import { describe, expect, it } from 'vitest';
import {
  Assignment,
  Program,
  STARTER_LIBRARY,
  addDays,
  applyProgramEdit,
  applySetToAll,
  assign,
  cloneProgram,
  copyDay,
  copyWeek,
  customExerciseId,
  dayFor,
  describeExercise,
  e1rmByExercise,
  emptySet,
  filenameTokens,
  matchVideos,
  mondayOf,
  move,
  newDay,
  newExercise,
  newProgram,
  programProblems,
  progressAcrossWeeks,
  publish,
  resolveDay,
  resolveLoadKg,
  searchLibrary,
  setOverride,
  toggleSupersetWithNext,
  updateDay,
  weekIndexFor,
  weekdayOf,
} from '../src/programs';
import { demoPrograms, DEMO_PROGRAM_CLIENT_ID } from '../src/demo/programs';
import { LOWER_A, DEMO_HISTORY } from '../src/demo/client';

const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const lib = (id: string) => STARTER_LIBRARY.find((e) => e.id === id)!;

describe('dates', () => {
  it('knows weekdays and program weeks', () => {
    expect(weekdayOf('2026-10-19')).toBe(1); // Monday
    expect(weekdayOf('2026-10-25')).toBe(7);
    expect(mondayOf('2026-10-22')).toBe('2026-10-19');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    // A Thursday start still counts that calendar week as week 1.
    expect(weekIndexFor('2026-10-22', '2026-10-25')).toBe(0);
    expect(weekIndexFor('2026-10-22', '2026-10-26')).toBe(1);
  });
});

function twoWeekProgram() {
  const newId = ids();
  let p = newProgram('Test', '2026-10-01T00:00:00Z', newId);
  const day = { ...newDay(1, 'Lower', newId), exercises: [newExercise(lib('back-squat'), newId)] };
  p = { ...p, weeks: [{ ...p.weeks[0]!, days: [day] }] };
  return { p: copyWeek(p, p.weeks[0]!.id, undefined, newId), newId };
}

describe('editing', () => {
  it('copies a week with fresh ids', () => {
    const { p } = twoWeekProgram();
    expect(p.weeks).toHaveLength(2);
    const [a, b] = p.weeks;
    expect(b!.id).not.toBe(a!.id);
    expect(b!.days[0]!.id).not.toBe(a!.days[0]!.id);
    expect(b!.days[0]!.exercises[0]!.id).not.toBe(a!.days[0]!.exercises[0]!.id);
    expect(b!.days[0]!.exercises[0]!.exerciseId).toBe('back-squat');
  });

  it('copies a day into another week, replacing that weekday', () => {
    const { p, newId } = twoWeekProgram();
    const renamed = updateDay(p, p.weeks[0]!.days[0]!.id, (d) => ({ ...d, title: 'Lower (heavy)' }));
    const out = copyDay(renamed, renamed.weeks[0]!.days[0]!.id, 1, undefined, newId);
    expect(out.weeks[1]!.days).toHaveLength(1);
    expect(out.weeks[1]!.days[0]!.title).toBe('Lower (heavy)');
    const toFri = copyDay(out, out.weeks[0]!.days[0]!.id, 1, 5, newId);
    expect(toFri.weeks[1]!.days.map((d) => d.weekday)).toEqual([1, 5]);
  });

  it('moves items and refuses impossible moves', () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    const same = [1, 2, 3];
    expect(move(same, 0, -1)).toBe(same);
  });

  it('joins and splits supersets, re-lettering groups', () => {
    const newId = ids();
    let day = { ...newDay(1, 'D', newId), exercises: ['bench-press', 'barbell-row', 'plank'].map((x) => newExercise(lib(x), newId)) };
    day = toggleSupersetWithNext(day, 0);
    expect(day.exercises.map((e) => e.supersetGroup)).toEqual(['A', 'A', null]);
    expect(day.exercises[0]!.restS).toBe(0);
    day = toggleSupersetWithNext(day, 1);
    expect(day.exercises.map((e) => e.supersetGroup)).toEqual(['A', 'A', 'A']);
    day = toggleSupersetWithNext(day, 0);
    expect(day.exercises.map((e) => e.supersetGroup)).toEqual([null, 'A', 'A']);
  });

  it('applies one set to all sets', () => {
    const e = newExercise(lib('back-squat'), ids());
    const edited = { ...e, sets: [{ ...e.sets[0]!, loadValue: 100, repsMin: 5, repsMax: 5 }, ...e.sets.slice(1)] };
    expect(applySetToAll(edited, 0).sets.every((s) => s.loadValue === 100 && s.repsMax === 5)).toBe(true);
  });

  it('progresses loads across later weeks', () => {
    const { p } = twoWeekProgram();
    let q = { ...p, weeks: p.weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, loadValue: 80 })) })) })) })) };
    q = copyWeek(q, q.weeks[1]!.id);
    const out = progressAcrossWeeks(q, 'back-squat', 0, 2.5, 0.025);
    expect(out.weeks.map((w) => w.days[0]!.exercises[0]!.sets[0]!.loadValue)).toEqual([80, 82.5, 85]);
    // Builds from the chosen week, whatever later weeks held before.
    const heavier = updateDay(q, q.weeks[1]!.days[0]!.id, (d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, loadValue: 90 })) })),
    }));
    expect(progressAcrossWeeks(heavier, 'back-squat', 1, 2.5, 0).weeks.map((w) => w.days[0]!.exercises[0]!.sets[0]!.loadValue)).toEqual([80, 90, 92.5]);
    expect(progressAcrossWeeks(heavier, 'deadlift', 0, 2.5, 0)).toBe(heavier);
  });

  it('describes exercises plainly', () => {
    const e = newExercise(lib('back-squat'), ids());
    expect(describeExercise({ ...e, sets: e.sets.map((s) => ({ ...s, loadValue: 80, rpe: 8 })) })).toBe('3 × 8–10 · 80 kg @ RPE 8');
    expect(describeExercise({ ...e, sets: [{ ...e.sets[0]!, loadType: 'pct_1rm', loadValue: 0.75, repsMin: 5, repsMax: 5 }] })).toBe('1 × 5 · 75% 1RM');
    expect(describeExercise({ ...newExercise(lib('plank'), ids()), sets: [emptySet('time')] })).toBe('1 × 30 s');
  });

  it('clones a program as a new draft', () => {
    const { p } = twoWeekProgram();
    const c = cloneProgram(publish(p), 'Copy');
    expect(c.status).toBe('draft');
    expect(c.version).toBe(1);
    expect(c.id).not.toBe(p.id);
  });
});

describe('validation', () => {
  it('reports what blocks publishing', () => {
    const newId = ids();
    expect(programProblems(newProgram('', undefined, newId)).map((x) => x.message)).toEqual(['Give the program a name.', 'Add at least one training day.']);
    const { p } = twoWeekProgram();
    expect(programProblems(p)).toEqual([]);
    const bad = updateDay(p, p.weeks[0]!.days[0]!.id, (d) => ({
      ...d,
      title: '',
      exercises: d.exercises.map((e) => ({ ...e, sets: [{ ...e.sets[0]!, repsMin: 12, repsMax: 8 }, { ...e.sets[0]!, loadType: 'pct_1rm', loadValue: 1.5 }] })),
    }));
    expect(programProblems(bad).map((x) => x.message)).toEqual([
      'Week 1, Monday needs a name.',
      'Week 1, Monday, Back Squat, set 1: the rep range is backwards.',
      'Week 1, Monday, Back Squat, set 2: % of 1RM should be between 1 and 120.',
    ]);
  });

  it('keeps version 1 when publishing a draft and bumps it on later saves', () => {
    const { p } = twoWeekProgram();
    const live = publish(p);
    expect(live.version).toBe(1);
    expect(publish(live).version).toBe(2);
  });
});

describe('loads', () => {
  it('resolves % of 1RM from real history, rounded to the plate increment', () => {
    const set = { ...emptySet('weight_reps'), loadType: 'pct_1rm' as const, loadValue: 0.75 };
    expect(resolveLoadKg(set, 120, 2.5)).toBe(90);
    expect(resolveLoadKg(set, 101, 2.5)).toBe(75);
    expect(resolveLoadKg(set, undefined, 2.5)).toBeNull();
    expect(resolveLoadKg({ ...set, loadType: 'rpe', rpe: 8 }, 120, 2.5)).toBeNull();
  });

  it('computes e1RM per exercise from logged sets only', () => {
    const e = e1rmByExercise(DEMO_HISTORY.flatMap((s) => s.sets));
    expect(e['back-squat']).toBeCloseTo(80 * (1 + 8 / 30), 6);
    expect(e['hanging-knee-raise']).toBeUndefined();
  });
});

describe('assignment', () => {
  const { p } = twoWeekProgram();
  const live = publish(p);
  const a = assign(live, 'client-1', '2026-10-19', () => 'asg-1');

  it('finds the session, rest days and the end of the program', () => {
    expect(dayFor(a, '2026-10-18').kind).toBe('not_started');
    const mon = dayFor(a, '2026-10-19');
    expect(mon.kind === 'session' && mon.day.title).toBe('Lower');
    expect(dayFor(a, '2026-10-20')).toEqual({ kind: 'rest', weekIndex: 0 });
    expect(dayFor(a, '2026-10-26').kind).toBe('session');
    expect(dayFor(a, '2026-11-02').kind).toBe('finished');
    expect(dayFor({ ...a, status: 'paused' }, '2026-10-19').kind).toBe('paused');
  });

  it('applies edits to future sessions only', () => {
    const edited = publish(updateDay(live, live.weeks[0]!.days[0]!.id, (d) => ({ ...d, title: 'Lower v2' })));
    // Today's session already started, so the change starts tomorrow; earlier dates keep v1.
    const started = applyProgramEdit(a, edited, '2026-10-19', true);
    expect(started.versions.map((v) => [v.effectiveFrom, v.version])).toEqual([
      ['2026-10-19', 1],
      ['2026-10-20', 2],
    ]);
    const today = dayFor(started, '2026-10-19');
    expect(today.kind === 'session' && today.day.title).toBe('Lower');
    // Not started yet: the change applies today.
    const notStarted = applyProgramEdit(a, edited, '2026-10-19', false);
    const t2 = dayFor(notStarted, '2026-10-19');
    expect(t2.kind === 'session' && t2.day.title).toBe('Lower v2');
    expect(notStarted.versions).toHaveLength(1);
    // Edits to another program are ignored.
    expect(applyProgramEdit(a, { ...edited, id: 'other' }, '2026-10-19', false)).toBe(a);
  });

  it('lets the coach replace one day and undo it', () => {
    const special = { ...newDay(2, 'Deload walk', ids()) };
    const withOverride = setOverride(a, '2026-10-20', special);
    const tue = dayFor(withOverride, '2026-10-20');
    expect(tue.kind === 'session' && tue.overridden && tue.day.title).toBe('Deload walk');
    expect(dayFor(setOverride(withOverride, '2026-10-20', null), '2026-10-20').kind).toBe('rest');
    expect(() => Assignment.parse(withOverride)).not.toThrow();
  });

  it('turns a day into the SessionPlan the logger runs', () => {
    const day = live.weeks[0]!.days[0]!;
    const withPct = { ...day, exercises: day.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, loadType: 'pct_1rm' as const, loadValue: 0.8 })) })) };
    const plan = resolveDay(withPct, '2026-10-19', { 'back-squat': 112 });
    expect(plan.exercises[0]!.sets.map((s) => s.loadKg)).toEqual([90, 90, 90]);
    expect(plan.scheduledDate).toBe('2026-10-19');
  });
});

describe('demo seed', () => {
  it('puts Lower A on today in week 3, with the ids the history was logged against', () => {
    const today = '2026-10-21';
    const { programs, assignments } = demoPrograms(today);
    for (const p of programs) expect(() => Program.parse(p)).not.toThrow();
    expect(programProblems(programs[0]!)).toEqual([]);
    const a = assignments[0]!;
    expect(a.clientId).toBe(DEMO_PROGRAM_CLIENT_ID);
    const d = dayFor(a, today);
    expect(d.kind === 'session' && d.weekIndex).toBe(2);
    const plan = d.kind === 'session' ? resolveDay(d.day, today, {}) : null;
    expect(plan?.programDayId).toBe(LOWER_A.programDayId);
    expect(plan?.exercises.map((e) => e.id)).toEqual(LOWER_A.exercises.map((e) => e.id));
    expect(plan?.exercises[0]!.sets[0]!.loadKg).toBe(80);
  });
});

describe('library', () => {
  it('searches by word starts and filters by tag and equipment', () => {
    expect(searchLibrary(STARTER_LIBRARY, 'squat').map((e) => e.id)).toContain('bulgarian-split-squat');
    expect(searchLibrary(STARTER_LIBRARY, 'db row').length).toBe(0);
    expect(searchLibrary(STARTER_LIBRARY, 'dumb row').map((e) => e.id)).toEqual(['db-row']);
    expect(searchLibrary(STARTER_LIBRARY, '', { tag: 'carry' }).map((e) => e.id)).toEqual(['farmer-carry', 'suitcase-carry']);
    expect(searchLibrary(STARTER_LIBRARY, 'press', { equipment: 'cable' }).map((e) => e.id)).toEqual(['pallof-press']);
  });

  it('makes tenant-scoped ids for custom exercises', () => {
    expect(customExerciseId('Landmine Press', 'maya-reyes-strength', new Set())).toBe('maya-reyes-strength/landmine-press');
    expect(customExerciseId('Landmine Press', 'm', new Set(['m/landmine-press']))).toBe('m/landmine-press-2');
  });

  it('tokenises video file names', () => {
    expect(filenameTokens('BackSquat_demo-v2.MOV')).toEqual(['back', 'squat']);
    expect(filenameTokens('IMG_4821.mp4')).toEqual([]);
  });

  it('matches demo videos to exercises and leaves ties for the coach', () => {
    const m = matchVideos(['back_squat.mp4', 'Romanian-Deadlift FINAL.mov', 'IMG_4821.mp4', 'squat.mp4', 'pull up.mov'], STARTER_LIBRARY);
    expect(m.map((x) => x.exerciseId)).toEqual(['back-squat', 'romanian-deadlift', null, null, 'pull-up']);
    expect(m[0]!.score).toBe(1);
  });
});

describe('programFromAiDraft', () => {
  it('builds an unpublished ai_draft program with days spread across the week and loads left empty', async () => {
    const { programFromAiDraft, programProblems } = await import('../src/programs');
    const { LOWER_A } = await import('../src/demo/client');
    const ex = LOWER_A.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, loadKg: null })) }));
    let n = 0;
    const p = programFromAiDraft(
      { name: 'Strength block', weeks: [{ days: [{ title: 'Lower', coachNote: null, exercises: ex }, { title: 'Upper', coachNote: 'Easy', exercises: ex }, { title: 'Full', coachNote: null, exercises: ex }] }] },
      '2026-10-21T00:00:00.000Z',
      () => `id-${n++}`,
    );
    expect(p.status).toBe('draft');
    expect(p.source).toBe('ai_draft');
    expect(p.weeks[0]!.days.map((d) => d.weekday)).toEqual([1, 3, 5]);
    const squat = p.weeks[0]!.days[0]!.exercises[0]!;
    // Squat has an RPE target and no load: it's loaded by RPE. The RDL has neither: absolute, left for the coach.
    expect(squat.sets[0]).toMatchObject({ loadType: 'rpe', loadValue: null, rpe: 8, repsMin: 5, repsMax: 8 });
    expect(p.weeks[0]!.days[0]!.exercises[1]!.sets[0]).toMatchObject({ loadType: 'absolute', loadValue: null });
    expect(new Set([p.id, ...p.weeks.flatMap((w) => w.days.map((d) => d.id))]).size).toBe(4);
    expect(Array.isArray(programProblems(p))).toBe(true);
  });
});
