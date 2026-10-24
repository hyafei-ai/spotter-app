import { describe, expect, it } from 'vitest';
import {
  DAY_MODEL_VERSION,
  Program,
  ProgramDay,
  addBlocksToDay,
  addExerciseToDay,
  blocksFromText,
  cloneDay,
  dayBlocks,
  dayContentNames,
  migrateDay,
  migrateProgram,
  newExercise,
  newWorkoutBlock,
  programProblems,
  removeDayBlock,
  resolveDay,
  setDayBlocks,
  STARTER_LIBRARY,
  assign,
  dayFor,
  isSingleSessions,
  setOverride,
  singleSessionsProgram,
  type ProgramDay as Day,
} from '../src';
import { demoPrograms } from '../src/demo/programs';

let n = 0;
const ids = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
const lib = (id: string) => STARTER_LIBRARY.find((e) => e.id === id)!;

/** A day exactly as stored before blocks (v1): no `v`, no `blocks`. */
function v1Day(): Day {
  const a = newExercise(lib('back-squat'), ids);
  const b = { ...newExercise(lib('bench-press'), ids), supersetGroup: 'A' };
  const c = { ...newExercise(lib('barbell-row'), ids), supersetGroup: 'A' };
  return { id: ids(), title: 'Lower A', weekday: 1, coachNote: 'Brace hard.', exercises: [a, b, c] };
}

describe('day model migration (v1 → v2)', () => {
  it('keeps every exercise exactly, in one strength block', () => {
    const old = v1Day();
    const m = migrateDay(old);
    expect(m.v).toBe(DAY_MODEL_VERSION);
    expect(m.exercises).toEqual(old.exercises);
    expect(m.blocks).toHaveLength(1);
    expect(m.blocks![0]).toMatchObject({ kind: 'strength', exerciseIds: old.exercises.map((e) => e.id) });
    expect({ ...m, v: undefined, blocks: undefined }).toEqual({ ...old, v: undefined, blocks: undefined });
  });

  it('is stable: migrating twice gives the same day, with the same block id', () => {
    const once = migrateDay(v1Day());
    expect(migrateDay(once)).toEqual(once);
  });

  it('old shapes still parse, and the client plan for a strength day is unchanged', () => {
    const old = v1Day();
    expect(ProgramDay.safeParse(JSON.parse(JSON.stringify(old))).success).toBe(true);
    const before = resolveDay(old, '2026-10-23', { 'back-squat': 140 });
    const after = resolveDay(migrateDay(old), '2026-10-23', { 'back-squat': 140 });
    expect(after).toEqual(before);
    expect('blocks' in before).toBe(false);
  });

  it('migrates every day of a stored program and round-trips through JSON', () => {
    const { programs } = demoPrograms('2026-10-23');
    const stored = JSON.parse(JSON.stringify(programs[0]!)) as Program;
    for (const w of stored.weeks)
      for (const d of w.days) {
        delete (d as { v?: number }).v;
        delete (d as { blocks?: unknown }).blocks;
      }
    const m = migrateProgram(Program.parse(stored));
    expect(Program.safeParse(JSON.parse(JSON.stringify(m))).success).toBe(true);
    m.weeks.forEach((w, wi) => w.days.forEach((d, di) => expect(d.exercises).toEqual(stored.weeks[wi]!.days[di]!.exercises)));
  });

  it('repairs v2 days whose lists disagree, without losing an exercise', () => {
    const old = migrateDay(v1Day());
    const extra = newExercise(lib('deadlift'), ids);
    const broken: Day = { ...old, exercises: [...old.exercises, extra], blocks: [...old.blocks!, { ...newWorkoutBlock('strength', ids), exerciseIds: ['missing'] }] };
    const fixed = migrateDay(broken);
    expect(fixed.exercises.map((e) => e.id)).toEqual([...old.exercises.map((e) => e.id), extra.id]);
    const refs = fixed.blocks!.flatMap((b) => (b.kind === 'strength' ? b.exerciseIds : []));
    expect(refs).not.toContain('missing');
    expect(refs).toContain(extra.id);
  });
});

describe('editing a day with blocks', () => {
  it('adds a pasted metcon after the strength, then removes it again', () => {
    const day = migrateDay(v1Day());
    const paste = blocksFromText('Metcon: AMRAP 12\n10 burpees\n15 wall balls', { newId: ids });
    const withMetcon = addBlocksToDay(day, paste, (l) => ({ id: l.movementId ?? 'x', name: l.name, metric: 'weight_reps' }), ids);
    expect(dayBlocks(withMetcon).map((b) => b.kind)).toEqual(['strength', 'amrap']);
    expect(dayContentNames(withMetcon)).toEqual(['Back Squat', 'Bench Press', 'Barbell Row', 'AMRAP 12']);
    const plan = resolveDay(withMetcon, '2026-10-23', {});
    expect(plan.blocks?.map((b) => b.kind)).toEqual(['strength', 'amrap']);
    const amrap = dayBlocks(withMetcon)[1]!;
    expect(removeDayBlock(withMetcon, amrap.id).exercises).toEqual(day.exercises);
  });

  it('pasted strength lines become exercises in their own block', () => {
    const day: Day = { id: ids(), title: 'Strength + engine', weekday: 2, coachNote: null, exercises: [], v: 2, blocks: [] };
    const paste = blocksFromText('A) Back squat 5x5 @ 100kg\nB) 5 x 1km run, 2 min rest', { newId: ids });
    const d = addBlocksToDay(day, paste, (l) => ({ id: l.movementId!, name: l.name, metric: 'weight_reps' }), ids);
    expect(d.exercises).toHaveLength(1);
    expect(d.exercises[0]!.sets).toHaveLength(5);
    expect(d.exercises[0]!.sets[0]).toMatchObject({ repsMax: 5, loadType: 'absolute', loadValue: 100 });
    expect(dayBlocks(d).map((b) => b.kind)).toEqual(['strength', 'intervals']);
    expect(programProblems({ id: 'p', name: 'P', status: 'draft', isTemplate: false, version: 1, source: 'coach', updatedAt: '', weeks: [{ id: 'w', days: [d] }] })).toEqual([]);
  });

  it('adding an exercise goes into the chosen strength block; removing a block removes its exercises', () => {
    const day = migrateDay(v1Day());
    const second = { ...newWorkoutBlock('strength', ids) };
    const d1 = setDayBlocks(day, [...dayBlocks(day), newWorkoutBlock('amrap', ids), second]);
    const pe = newExercise(lib('plank'), ids);
    const d2 = addExerciseToDay(d1, pe, second.id);
    expect(dayBlocks(d2)[2]).toMatchObject({ id: second.id, exerciseIds: [pe.id] });
    expect(d2.exercises.at(-1)!.id).toBe(pe.id);
    expect(removeDayBlock(d2, second.id).exercises.map((e) => e.id)).not.toContain(pe.id);
  });

  it('copying a day gives fresh ids and keeps the strength references pointing at the copies', () => {
    const day = addBlocksToDay(migrateDay(v1Day()), blocksFromText('AMRAP 10\n5 burpees', { newId: ids }), () => ({ id: 'x', name: 'x', metric: 'weight_reps' }), ids);
    const copy = cloneDay(day, ids);
    expect(copy.id).not.toBe(day.id);
    const s = dayBlocks(copy).find((b) => b.kind === 'strength')!;
    expect(s.kind === 'strength' && s.exerciseIds).toEqual(copy.exercises.map((e) => e.id));
    expect(dayBlocks(copy)[1]!.id).not.toBe(dayBlocks(day)[1]!.id);
  });

  it('a day with only a conditioning block is a valid session; an empty one is not', () => {
    const day: Day = { id: ids(), title: 'WOD', weekday: 3, coachNote: null, exercises: [], v: 2, blocks: [newWorkoutBlock('amrap', ids)] };
    const p = { id: 'p', name: 'P', status: 'draft' as const, isTemplate: false, version: 1, source: 'coach' as const, updatedAt: '', weeks: [{ id: 'w', days: [day] }] };
    expect(programProblems(p)).toEqual([]);
    expect(programProblems({ ...p, weeks: [{ id: 'w', days: [{ ...day, blocks: [] }] }] }).map((x) => x.message)).toEqual(['Week 1, Wednesday has nothing in it yet.']);
  });

  it('a single-sessions holder: the sent date is a session, every other day a rest day', () => {
    const holder = singleSessionsProgram('Maya', '2026-10-23T08:00:00Z', ids);
    expect(isSingleSessions(holder)).toBe(true);
    const a = setOverride(assign(holder, 'client-1', '2026-10-23', ids), '2026-10-24', migrateDay(v1Day()));
    expect(dayFor(a, '2026-10-24').kind).toBe('session');
    expect(dayFor(a, '2026-10-25').kind).toBe('rest');
  });

  it('only an approved Strategy & Stimulus reaches the client plan', () => {
    const day = migrateDay(v1Day());
    const draft = { ...day, brief: { stimulus: 'Fast and spicy.', strategy: 'Unbroken thrusters.', status: 'draft' as const, source: 'ai' as const, updatedAt: '' } };
    expect(resolveDay(draft, '2026-10-23', {}).brief).toBeUndefined();
    const approved = { ...draft, brief: { ...draft.brief, status: 'approved' as const } };
    expect(resolveDay(approved, '2026-10-23', {}).brief).toEqual({ stimulus: 'Fast and spicy.', strategy: 'Unbroken thrusters.' });
  });
});
