import { describe, expect, it } from 'vitest';
import {
  BLOCK_KINDS,
  Block,
  BlockResult,
  Mutation,
  SessionPlan,
  allTemplates,
  blockKey,
  blockLabel,
  blockLines,
  blockProblems,
  blocksFromTemplate,
  blocksFromText,
  defaultScoring,
  describeBlock,
  inferSessionScoring,
  inferSessionType,
  isStrengthOnly,
  newWorkoutBlock,
  nextStep,
  planBlocks,
  resultLine,
  scoreText,
  scoreValue,
  sessionProgress,
  styleProfile,
  templateById,
  type BlockScore,
} from '../src';

let n = 0;
const ids = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
const score = (s: Partial<BlockScore>): BlockScore => ({ timeSec: null, rounds: null, reps: null, loadKg: null, distanceM: null, calories: null, capped: false, scaled: false, ...s });

describe('block schema', () => {
  it('every kind has defaults that validate and no problems except an empty strength block or note', () => {
    for (const k of BLOCK_KINDS) {
      const b = newWorkoutBlock(k, ids);
      expect(Block.safeParse(b).success, k).toBe(true);
      const problems = blockProblems(b);
      if (k === 'strength' || k === 'note') expect(problems).toHaveLength(1);
      else expect(problems, k).toEqual([]);
    }
  });

  it('a block result and its mutation validate', () => {
    const r: BlockResult = {
      sessionId: ids(),
      blockId: 'b1',
      kind: 'amrap',
      key: 'benchmark.cindy',
      label: 'Cindy',
      scoring: 'rounds_reps',
      score: score({ rounds: 18, reps: 7 }),
      splits: [],
      rpe: null,
      loggedAt: '2026-10-23T08:00:00.000Z',
    };
    expect(BlockResult.safeParse(r).success).toBe(true);
    const m = Mutation.safeParse({ clientMutationId: ids(), createdAt: '2026-10-23T08:00:00.000Z', kind: 'block.result', payload: r });
    expect(m.success).toBe(true);
  });
});

describe('scoring and session type (port of inferWorkoutMeta)', () => {
  it('scores each kind the usual way', () => {
    expect(defaultScoring('for_time')).toBe('time');
    expect(defaultScoring('rep_scheme')).toBe('time');
    expect(defaultScoring('amrap')).toBe('rounds_reps');
    expect(defaultScoring('interval_amrap')).toBe('rounds_reps');
    expect(defaultScoring('tabata')).toBe('reps');
    expect(defaultScoring('strength')).toBe('load');
    expect(defaultScoring('emom')).toBe('none');
    expect(defaultScoring('intervals')).toBe('time');
  });

  it('infers the session type conservatively', () => {
    const k = (...kinds: Block['kind'][]) => kinds.map((kind) => ({ kind }));
    expect(inferSessionType(k('strength', 'strength', 'strength', 'amrap'))).toBe('strength');
    expect(inferSessionType(k('strength', 'amrap', 'for_time'))).toBe('conditioning');
    expect(inferSessionType(k('intervals', 'rest', 'intervals'))).toBe('intervals');
    expect(inferSessionType(k('strength', 'station_race'))).toBe('race_sim');
    expect(inferSessionType(k('strength', 'intervals'))).toBe('mixed');
    expect(inferSessionType(k('strength'), 'Saturday race sim')).toBe('race_sim');
    expect(inferSessionType([])).toBe('mixed');
    expect(inferSessionScoring(k('amrap', 'amrap', 'strength'))).toBe('rounds_reps');
    expect(inferSessionScoring(k('rest'))).toBe('none');
  });
});

describe('paste → blocks', () => {
  it('reads 21-15-9 as a rep scheme scored for time, and knows Fran', () => {
    const r = blocksFromText('Fran\nFor time\n21-15-9\nThrusters (95/65 lb)\nPull-ups', { defaultLoadUnit: 'kg', newId: ids });
    expect(r.blocks).toHaveLength(1);
    const b = r.blocks[0]!;
    expect(b.kind).toBe('rep_scheme');
    if (b.kind !== 'rep_scheme') return;
    expect(b.scheme).toEqual([21, 15, 9]);
    expect(b.templateId).toBe('benchmark.fran');
    expect(b.movements.map((m) => m.movementId)).toEqual(['thruster', 'pull-up']);
    expect(b.movements[0]!.loadKg).toBeCloseTo(43.1, 0);
    expect(blockLabel(b)).toBe('Fran');
    expect(b.scoring).toBe('time');
  });

  it('reads an AMRAP with its length, and an EMOM with rotating minutes', () => {
    const a = blocksFromText('AMRAP 20\n5 pull-ups\n10 push-ups\n15 air squats', { newId: ids }).blocks[0]!;
    expect(a.kind).toBe('amrap');
    if (a.kind === 'amrap') expect(a.durationSec).toBe(1200);
    expect(blockLabel(a)).toBe('AMRAP 20');
    const e = blocksFromText('EMOM 24\nOdd: 10 wall balls\nEven: 8 cal row', { newId: ids }).blocks[0]!;
    expect(e.kind).toBe('emom');
    if (e.kind === 'emom') {
      expect(e.rounds).toBe(24);
      expect(e.rotate).toBe(true);
    }
    expect(blockLabel(e)).toBe('EMOM 24');
  });

  it('reads 5 x 1 km with rest as intervals', () => {
    const b = blocksFromText('5 x 1km @ threshold, 2 min rest', { newId: ids }).blocks[0]!;
    expect(b.kind).toBe('intervals');
    if (b.kind !== 'intervals') return;
    expect(b.reps).toBe(5);
    expect(b.distanceM).toBe(1000);
    expect(b.restSec).toBe(120);
    expect(b.modality).toBe('run');
    expect(blockLabel(b)).toBe('5 × 1 km');
  });

  it('reads a strength line into a strength block with sets', () => {
    const r = blocksFromText('Back squat 5x5 @ 80%', { newId: ids });
    expect(r.blocks[0]!.kind).toBe('strength');
    expect(r.strength).toHaveLength(1);
    expect(r.strength[0]!.sets).toBe(5);
    expect(r.strength[0]!.reps).toEqual([5, 5, 5, 5, 5]);
    expect(r.strength[0]!.pct1rm).toBeCloseTo(0.8);
  });

  it('reads a two-part paste part by part', () => {
    const r = blocksFromText('A) Back squat 5x5 @ 100kg\nB) Metcon: AMRAP 12\n10 burpees\n15 wall balls (9/6 kg)', { newId: ids });
    expect(r.blocks.map((b) => b.kind)).toEqual(['strength', 'amrap']);
    expect(r.warnings.some((w) => w.includes('read here as one list'))).toBe(false);
  });

  it('uses the tenant unit for loads without one, and says so', () => {
    const kg = blocksFromText('For time\n30 clean and jerks 60/40', { defaultLoadUnit: 'kg', newId: ids });
    const b = kg.blocks[0]!;
    if (b.kind === 'for_time') expect(b.movements[0]!.loadKg).toBe(60);
    expect(kg.warnings.join(' ')).toMatch(/read as kg/);
  });

  it('warns rather than guesses when nothing is readable', () => {
    expect(blocksFromText('', { newId: ids }).warnings).toEqual(['Nothing to read']);
    const r = blocksFromText('3 / 4 / 5', { newId: ids });
    expect(r.blocks).toHaveLength(0);
    expect(r.warnings.join(' ')).toMatch(/Couldn’t find any movements/);
  });
});

describe('templates → blocks', () => {
  it('every template maps to valid blocks', () => {
    for (const t of allTemplates()) {
      const r = blocksFromTemplate(t, ids);
      expect(r.blocks.length, t.id).toBeGreaterThan(0);
      for (const b of r.blocks) expect(Block.safeParse(b).success, t.id).toBe(true);
    }
  });

  it('race sims become a station race with every number marked to verify', () => {
    const r = blocksFromTemplate(templateById('race.full.singles.open_women')!, ids);
    const b = r.blocks[0]!;
    expect(b.kind).toBe('station_race');
    if (b.kind !== 'station_race') return;
    expect(b.segments.filter((s) => s.kind === 'run')).toHaveLength(8);
    expect(b.segments.filter((s) => s.kind === 'station')).toHaveLength(8);
    expect(b.segments.every((s) => s.verify)).toBe(true);
    expect(b.templateId).toBe('race.full.singles.open_women');
  });

  it('benchmarks keep their name and template id, so repeats compare', () => {
    const b = blocksFromTemplate(templateById('benchmark.cindy')!, ids).blocks[0]!;
    expect(blockLabel(b)).toBe('Cindy');
    expect(blockKey(b)).toBe('benchmark.cindy');
    expect(describeBlock(b)).toContain('Cindy');
  });
});

describe('describing and scoring results', () => {
  const r = (label: string, kind: Block['kind'], scoring: BlockResult['scoring'], s: Partial<BlockScore>, splits: BlockResult['splits'] = []) => ({ label, kind, scoring, score: score(s), splits });

  it('writes results the way coaches say them', () => {
    expect(resultLine(r('Fran', 'rep_scheme', 'time', { timeSec: 252 }))).toBe('Fran 4:12');
    expect(resultLine(r('AMRAP 20', 'amrap', 'rounds_reps', { rounds: 7, reps: 12 }))).toBe('AMRAP 20: 7 rounds + 12');
    const splits = [261, 270, 272, 275, 278].map((sec, i) => ({ kind: 'interval' as const, name: 'Run', index: i, sec, distanceM: 1000, avgHr: null, maxHr: null }));
    expect(resultLine(r('5 × 1 km', 'intervals', 'time', { timeSec: 1356 }, splits))).toBe('5 × 1 km avg 4:31/km');
    expect(scoreText(r('Grace', 'for_time', 'time', { capped: true, reps: 24 }))).toBe('Capped · 24 reps');
    expect(scoreText(r('Max', 'strength', 'load', { loadKg: 100 }), 'lb')).toBe('220.5 lb');
    expect(scoreText(r('Tabata', 'tabata', 'reps', { reps: 96, scaled: true }))).toBe('96 reps (scaled)');
  });

  it('orders scores so bigger is better, with capped results behind every finish', () => {
    const fast = scoreValue({ scoring: 'time', score: score({ timeSec: 240 }) })!;
    const slow = scoreValue({ scoring: 'time', score: score({ timeSec: 300 }) })!;
    const capped = scoreValue({ scoring: 'time', score: score({ capped: true, reps: 80 }) })!;
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(capped);
    expect(scoreValue({ scoring: 'rounds_reps', score: score({ rounds: 8, reps: 0 }) })!).toBeGreaterThan(scoreValue({ scoring: 'rounds_reps', score: score({ rounds: 7, reps: 30 }) })!);
  });

  it('lines for the client', () => {
    const e = blocksFromText('EMOM 24\nOdd: 10 wall balls\nEven: 8 cal row', { newId: ids }).blocks[0]!;
    expect(blockLines(e)[0]).toMatch(/^Minute 1: 10 Wall Ball/);
  });
});

describe('session progress across blocks', () => {
  const plan: SessionPlan = {
    programDayId: '00000000-0000-7000-8000-00000000aaaa',
    title: 'Mixed',
    scheduledDate: '2026-10-23',
    coachNote: null,
    exercises: [
      {
        id: '00000000-0000-7000-8000-00000000e001',
        exerciseId: 'back-squat',
        name: 'Back Squat',
        metric: 'weight_reps',
        supersetGroup: null,
        restS: 120,
        tempo: null,
        note: null,
        trackRpe: false,
        demoVideoId: null,
        alternatives: [],
        progressionRule: null,
        sets: [0, 1].map((index) => ({ index, repsMin: 5, repsMax: 5, loadKg: 100, rpe: null, durationS: null, distanceM: null, amrap: false })),
      },
    ],
    blocks: [
      { id: 's', kind: 'strength', title: null, note: null, scoring: 'load', timeCapSec: null, templateId: null, exerciseIds: ['00000000-0000-7000-8000-00000000e001'] },
      { id: 'r', kind: 'rest', title: null, note: null, scoring: 'none', timeCapSec: null, templateId: null, durationSec: 120 },
      { ...newWorkoutBlock('amrap', ids), id: 'a' },
    ],
  };

  it('goes set by set, skips rest, then the AMRAP, then nothing', () => {
    const set0 = { programExerciseId: '00000000-0000-7000-8000-00000000e001', setIndex: 0 };
    const set1 = { ...set0, setIndex: 1 };
    expect(nextStep(plan, [], [])).toMatchObject({ kind: 'set', setIndex: 0 });
    expect(nextStep(plan, [set0], [])).toMatchObject({ kind: 'set', setIndex: 1 });
    expect(nextStep(plan, [set0, set1], [])).toMatchObject({ kind: 'block', block: { id: 'a' } });
    expect(nextStep(plan, [set0, set1], [{ blockId: 'a' }])).toBeNull();
    expect(sessionProgress(plan, [set0], [])).toEqual({ done: 1, planned: 3, sets: 2, blocks: 1 });
    expect(isStrengthOnly(plan)).toBe(false);
  });

  it('a plan without blocks is one strength block', () => {
    const old = { ...plan, blocks: undefined };
    expect(planBlocks(old).map((b) => b.kind)).toEqual(['strength']);
    expect(isStrengthOnly(old)).toBe(true);
  });
});

describe('trainer styles', () => {
  it('skipped means everything, in the default order', () => {
    const p = styleProfile(null);
    expect(p.groupOrder).toEqual(['strength', 'functional', 'endurance', 'race', 'other']);
    expect(p.sessionWord).toBe('Session');
    expect(p.progressLead).toBe('lifts');
  });

  it('a functional-fitness coach sees WODs first and says "WOD"; nothing is hidden', () => {
    const p = styleProfile(['functional']);
    expect(p.groupOrder[0]).toBe('functional');
    expect(p.groupOrder).toHaveLength(5);
    expect(p.templateOrder.slice(0, 2)).toEqual(['benchmark', 'conditioning']);
    expect(p.sessionWord).toBe('WOD');
    expect(p.progressLead).toBe('scores');
    expect(styleProfile(['hybrid', 'endurance']).groupOrder.slice(0, 3)).toEqual(['race', 'endurance', 'strength']);
  });
});
