import { describe, expect, it } from 'vitest';
import {
  detectWorkoutFormat,
  parseMovementLine,
  parseScalingLevels,
  parseWorkout,
  parseWorkoutParts,
  scalingHint,
  splitWorkoutParts,
  type ParsedSegment,
} from '../src/parse';

/* Whiteboard fixtures written for these tests (MOCK, no real athletes). Loads are the common public standards. */

const work = (w: { segments: ParsedSegment[] }) => w.segments.filter((s) => s.kind === 'work');
const pick = (s: ParsedSegment) => ({
  movement: s.movement,
  id: s.movementId,
  reps: s.reps,
  sets: s.sets,
  kg: s.loadKg,
  cal: s.calories,
  m: s.distanceM,
  sec: s.durationSec,
});

describe('detectWorkoutFormat', () => {
  const cases: [string, string][] = [
    ['HYROX simulation: 8 stations, 1 km runs', 'hyrox'],
    ['SkiErg, sled push, sled pull, wall balls', 'unknown'],
    ['AMRAP 20: 5 pull-ups, 10 push-ups, 15 squats', 'amrap'],
    ['As many rounds as possible in 12 minutes', 'amrap'],
    ['For time: 21-15-9 thrusters and pull-ups', 'for_time'],
    ['21-15-9\nThrusters\nPull-ups', 'for_time'],
    ['5 rounds for time: 400m run, 15 OHS', 'rounds_for_time'],
    ['3 RFT: 50 DU, 10 T2B', 'rounds_for_time'],
    ['EMOM 12: odd 12 cal row, even 10 burpees', 'emom'],
    ['E2MOM x 5: 3 back squat', 'emom'],
    ['Every 2:00 x 6: 250m row', 'emom'],
    ['Tabata air squats', 'tabata'],
    ['20/10 x 8 bike', 'tabata'],
    ['Back squat 5x5 @ 80%', 'strength'],
    ['Deadlift: build to a heavy single', 'strength'],
    ['Back squat 5-5-5-3-3-1', 'strength'],
    ['5x10 burpees', 'unknown'],
    ['8 x 400m @ 5k pace, 90s rest', 'intervals'],
    ['400m repeats', 'intervals'],
    ['40 on / 20 off x 8 bike', 'intervals'],
    ['', 'unknown'],
    ['Easy walk with the dog', 'unknown'],
  ];
  it.each(cases)('%s → %s', (text, format) => {
    expect(detectWorkoutFormat(text).format).toBe(format);
  });

  it('reports what matched and a confidence', () => {
    const d = detectWorkoutFormat('AMRAP 20');
    expect(d.matched).toContain('amrap');
    expect(d.confidence).toBeGreaterThan(0.5);
    expect(detectWorkoutFormat('nothing here').confidence).toBe(0);
  });

  it('a descending rep scheme on a metcon stays "for time", not strength (source fix)', () => {
    expect(detectWorkoutFormat('21-15-9 thrusters, pull-ups').format).toBe('for_time');
    expect(detectWorkoutFormat('9-6-3 squat cleans and burpees').format).toBe('for_time');
  });
});

describe('scaling levels', () => {
  it('reads level names as hints', () => {
    expect(scalingHint('RX')).toEqual({ kind: 'rx', level: null });
    expect(scalingHint("Rx'd")).toEqual({ kind: 'rx', level: null });
    expect(scalingHint('RX+')).toEqual({ kind: 'rx_plus', level: null });
    expect(scalingHint('Scaled')).toEqual({ kind: 'scaled', level: null });
    expect(scalingHint('Level 2')).toEqual({ kind: 'level', level: 2 });
    expect(scalingHint('Intermediate (Level 2)')).toEqual({ kind: 'intermediate', level: 2 });
    expect(scalingHint('Option B')).toEqual({ kind: 'option', level: 2 });
    expect(scalingHint('Thrusters')).toBeNull();
    expect(scalingHint('rx thrusters')).toBeNull();
  });

  it('splits a paste into levels with a shared preamble', () => {
    const s = parseScalingLevels(`For time:
RX:
21-15-9 thrusters 95/65
Scaled:
21-15-9 thrusters 65/45
Foundations:
15-12-9 DB thrusters`)!;
    expect(s.preamble).toBe('For time:');
    expect(s.levels.map((l) => [l.name, l.kind])).toEqual([
      ['RX', 'rx'],
      ['Scaled', 'scaled'],
      ['Foundations', 'foundations'],
    ]);
    expect(s.levels[1]!.text).toBe('21-15-9 thrusters 65/45');
  });

  it('reads wrapped headers and content on the header line', () => {
    const wrapped = parseScalingLevels('— RX —\n30 C&J 135/95\n— Scaled —\n30 C&J 95/65')!;
    expect(wrapped.levels.map((l) => l.name)).toEqual(['RX', 'Scaled']);
    const inline = parseScalingLevels('Level 1: 20 wall balls 6 kg\nLevel 2: 20 wall balls 9 kg')!;
    expect(inline.levels.map((l) => [l.kind, l.level, l.text])).toEqual([
      ['level', 1, '20 wall balls 6 kg'],
      ['level', 2, '20 wall balls 9 kg'],
    ]);
  });

  it('needs two levels', () => {
    expect(parseScalingLevels('RX:\n30 C&J 135/95')).toBeNull();
    expect(parseScalingLevels('21 thrusters\n21 pull-ups')).toBeNull();
  });

  it('parseWorkout reads the first level by default, or the one asked for', () => {
    const text =
      '— RX —\n21-15-9\nDeadlift 225/155\nBurpees\n— Scaled —\n21-15-9\nDeadlift 155/105\nBurpees';
    const rx = parseWorkout(text);
    expect(rx.levels).toEqual(['RX', 'Scaled']);
    expect(rx.levelUsed).toBe('RX');
    expect(work(rx)[0]!.loadKg).toBeCloseTo(102.1, 1);
    expect(rx.warnings[0]).toBe('Read the RX level; also found Scaled');
    const scaled = parseWorkout(text, { level: 'scaled' });
    expect(scaled.levelUsed).toBe('Scaled');
    expect(work(scaled)[0]!.loadKg).toBeCloseTo(70.3, 1);
    expect(parseWorkout(text, { level: 1 }).levelUsed).toBe('Scaled');
  });
});

describe('parseMovementLine', () => {
  const lines: [string, Partial<ReturnType<typeof pick>>][] = [
    ['21 Thrusters (95/65)', { movement: 'Thrusters', id: 'thruster', reps: 21, kg: 43.1 }],
    ['15 pull-ups', { movement: 'pull-ups', id: 'pull-up', reps: 15 }],
    ['400m run', { movement: 'run', id: 'run', m: 400 }],
    ['Run 1 mile', { id: 'run', m: 1609 }],
    ['Row 2k', { id: 'rower', m: 2000 }],
    ['5k run', { id: 'run', m: 5000 }],
    ['20 cal row', { id: 'rower', cal: 20 }],
    ['Assault bike 15 cal', { id: 'air-bike', cal: 15 }],
    ['50 double-unders', { id: 'double-under', reps: 50 }],
    ['10 deadlifts @ 100 kg', { id: 'deadlift', reps: 10, kg: 100 }],
    ['Deadlift 5x3 @ 140kg', { id: 'deadlift', sets: 5, reps: 3, kg: 140 }],
    ['5 sets of 5 back squat', { id: 'back-squat', sets: 5, reps: 5 }],
    ['Back Squat 5 x 5', { id: 'back-squat', sets: 5, reps: 5 }],
    ['Plank 3x60s', { id: 'plank', sets: 3, sec: 60 }],
    ['60 sec plank', { id: 'plank', sec: 60 }],
    ['2:00 plank hold', { sec: 120 }],
    ['Wall Balls 100 reps (6 kg)', { id: 'wall-ball', reps: 100, kg: 6 }],
    ['Wall Balls 100', { id: 'wall-ball', reps: 100 }],
    ['Handstand walk 50 ft', { id: 'handstand-walk', m: 15 }],
    ['25 ft handstand walk', { id: 'handstand-walk', m: 8 }],
    ['Sled push 50m @ 152 kg', { id: 'sled-push', m: 50, kg: 152 }],
    ['Farmers carry 200m (2x24kg)', { id: 'farmer-carry', m: 200, kg: 24 }],
    ['10 KB swings 1.5 pood', { id: 'kettlebell-swing', reps: 10, kg: 24 }],
    ['30 C&J 135#', { id: 'clean-and-jerk', reps: 30, kg: 61.2 }],
    ['12 T2B', { id: 'toes-to-bar', reps: 12 }],
    ['8 x 400m', { id: 'run', sets: 8, m: 400 }],
  ];
  it.each(lines)('%s', (line, want) => {
    const s = parseMovementLine(line)!;
    const got = pick(s);
    for (const [k, v] of Object.entries(want)) expect(got[k as keyof typeof got], k).toBe(v);
  });

  it('keeps both numbers of a pair and flags pounds', () => {
    const s = parseMovementLine('21 Thrusters 95/65 lb')!;
    expect(s.loadKg).toBeCloseTo(43.1, 1);
    expect(s.loadKgAlt).toBeCloseTo(29.5, 1);
    expect(s.loadFromLb).toBe(true);
    expect(s.loadUnitAssumed).toBe(false);
    const kg = parseMovementLine('21 Thrusters 43/30 kg')!;
    expect([kg.loadKg, kg.loadKgAlt, kg.loadFromLb]).toEqual([43, 30, false]);
    const cal = parseMovementLine('15/12 cal bike')!;
    expect([cal.calories, cal.caloriesAlt]).toEqual([15, 12]);
    const reps = parseMovementLine('20/15 box jumps')!;
    expect([reps.reps, reps.repsAlt]).toEqual([20, 15]);
  });

  it('marks a load with no unit as assumed, using the default unit', () => {
    const lb = parseMovementLine('Thrusters 95/65')!;
    expect(lb.loadUnitAssumed).toBe(true);
    expect(lb.loadFromLb).toBe(true);
    const kg = parseMovementLine('Thrusters 40/30', { defaultLoadUnit: 'kg' })!;
    expect([kg.loadKg, kg.loadFromLb, kg.loadUnitAssumed]).toEqual([40, false, true]);
  });

  it('reads percentages, RPE and box heights without mistaking them for loads', () => {
    const pct = parseMovementLine('Back squat 5x3 @ 85% 1RM')!;
    expect([pct.percent1rm, pct.loadKg]).toEqual([85, null]);
    const rpe = parseMovementLine('Bench press 4x8 @ RPE 8')!;
    expect([rpe.reps, rpe.sets, rpe.loadKg, rpe.note]).toEqual([8, 4, null, 'RPE 8']);
    const box = parseMovementLine('30 box jump overs 24/20"')!;
    expect([box.reps, box.loadKg, box.note, box.movementId]).toEqual([
      30,
      null,
      '24/20 in',
      'box-jump-over',
    ]);
  });

  it('keeps notes: per side, max, pace, effort', () => {
    expect(parseMovementLine('Bulgarian split squat 3x10/leg')!.note).toBe('per leg');
    expect(parseMovementLine('Max reps pull-ups in 2 min')!.note).toBe('max');
    expect(parseMovementLine('Max reps pull-ups in 2 min')!.movement).toBe('pull-ups');
    expect(parseMovementLine('Long run 75 min easy')!.note).toBe('easy');
    expect(parseMovementLine('6 x 800m @ 10k pace')!.note).toBe('@ 10k pace');
  });

  it('returns null for a line with nothing movement-like', () => {
    expect(parseMovementLine('21')).toBeNull();
    expect(parseMovementLine('')).toBeNull();
  });

  it('links library movements only on an exact name or alias', () => {
    expect(parseMovementLine('10 strict pull-ups')!.movementId).toBe('pull-up');
    expect(parseMovementLine('10 HSPU')!.movementId).toBe('kipping-hspu');
    expect(parseMovementLine('10 DB snatches')!.movementId).toBeNull();
    expect(parseMovementLine('10 cossack squats')!.movementId).toBeNull();
  });
});

describe('parseWorkout: benchmarks and common whiteboards', () => {
  it('Fran-style couplet with a shared rep scheme', () => {
    const w = parseWorkout('Fran\n21-15-9\nThrusters (95/65)\nPull-ups');
    expect(w.title).toBe('Fran');
    expect(w.format).toBe('for_time');
    expect(w.repScheme).toEqual([21, 15, 9]);
    expect(work(w).map((s) => s.movementId)).toEqual(['thruster', 'pull-up']);
    expect(work(w).every((s) => s.repScheme?.join('-') === '21-15-9')).toBe(true);
    expect(w.warnings).toContain('Loads with no unit were read as lb: 95/65');
  });

  it('inline scheme with movements split by " / "', () => {
    const w = parseWorkout('For time:\n21-15-9 Thrusters 43/30 kg / Pull-ups');
    expect(work(w).map(pick)).toMatchObject([
      { id: 'thruster', kg: 43 },
      { id: 'pull-up', kg: null },
    ]);
    expect(w.warnings).toEqual([]);
  });

  it('different schemes per movement are kept per segment, with no shared scheme', () => {
    const w = parseWorkout('33/24-22/18-13/10 cal assault bike\n9-6-3 squat cleans 135/95');
    expect(w.repScheme).toBeNull();
    expect(work(w).map((s) => s.repScheme)).toEqual([
      [33, 22, 13],
      [9, 6, 3],
    ]);
    expect(work(w)[0]!.note).toBe('scheme in calories');
    expect(work(w)[1]!.movementId).toBe('clean');
  });

  it('Cindy-style AMRAP', () => {
    const w = parseWorkout('AMRAP 20:\n5 pull-ups\n10 push-ups\n15 air squats');
    expect([w.format, w.timeCapSec]).toEqual(['amrap', 1200]);
    expect(work(w).map((s) => [s.movementId, s.reps])).toEqual([
      ['pull-up', 5],
      ['push-up', 10],
      ['air-squat', 15],
    ]);
  });

  it.each([
    ['20 min AMRAP', 1200],
    ['AMRAP 12 min', 720],
    ['AMRAP in 15 minutes', 900],
    ['20:00 AMRAP', 1200],
    ['As many rounds as possible in 8 minutes', 480],
  ])('AMRAP header %s', (head, sec) => {
    expect(parseWorkout(`${head}\n10 burpees`).timeCapSec).toBe(sec);
  });

  it('AMRAP written on one line, movements after a colon', () => {
    const w = parseWorkout('AMRAP 12: 5 pull-ups, 10 push-ups, 15 squats');
    expect(w.timeCapSec).toBe(720);
    expect(work(w).map((s) => s.movementId)).toEqual(['pull-up', 'push-up', 'air-squat']);
  });

  it('warns when an AMRAP has no length', () => {
    expect(parseWorkout('AMRAP\n10 burpees').warnings).toContain('No AMRAP length found');
  });

  it('Helen-style rounds for time with a time cap', () => {
    const w = parseWorkout(
      '5 rounds for time\n400m run\n21 KB swings (24/16 kg)\n12 pull-ups\nTime cap: 25 min',
    );
    expect([w.format, w.rounds, w.timeCapSec]).toEqual(['rounds_for_time', 5, 1500]);
    expect(work(w).map(pick)).toMatchObject([
      { id: 'run', m: 400 },
      { id: 'kettlebell-swing', reps: 21, kg: 24 },
      { id: 'pull-up', reps: 12 },
    ]);
    expect(work(w)[1]!.loadKgAlt).toBe(16);
  });

  it.each([
    ['3 RFT', 3],
    ['For 4 rounds:', 4],
    ['5 rounds of:', 5],
    ['4 sets', 4],
  ])('rounds header %s', (head, n) => {
    expect(parseWorkout(`${head}\n10 burpees\n10 box jumps`).rounds).toBe(n);
  });

  it('rounds with no "for time" read as rounds for time, with lower confidence and a warning', () => {
    const w = parseWorkout('10 rounds\n5 strict pull-ups\n10 push-ups\n15 air squats');
    expect([w.format, w.rounds, w.confidence]).toEqual(['rounds_for_time', 10, 0.5]);
    expect(w.warnings).toContain('No “for time” written; read as rounds for time');
  });

  it.each([
    ['Time cap: 12', 720],
    ['(cap 30)', 1800],
    ['12 min cap', 720],
    ['TC 10:30', 630],
  ])('time cap %s', (cap, sec) => {
    expect(parseWorkout(`For time\n50 wall balls\n${cap}`).timeCapSec).toBe(sec);
  });

  it('chipper with a title and a cap on the same line', () => {
    const w = parseWorkout(
      'Chipper — for time (cap 30)\n50 wall balls\n40 cal row\n30 box jump overs 24/20"\n20 DB snatches 22.5/15 kg\n10 bar muscle-ups\nRun 1 mile',
    );
    expect([w.title, w.format, w.timeCapSec]).toEqual(['Chipper', 'for_time', 1800]);
    expect(work(w).map((s) => s.movementId)).toEqual([
      'wall-ball',
      'rower',
      'box-jump-over',
      null,
      'bar-muscle-up',
      'run',
    ]);
    expect(work(w)[1]!.calories).toBe(40);
    expect(work(w)[3]!.loadKg).toBe(22.5);
  });

  it('half Murph: runs around rounds written on one line', () => {
    const w = parseWorkout(
      'Murph (half)\n800m run\n10 rounds of 5 pull-ups, 10 push-ups, 15 air squats\n800m run',
    );
    expect(w.title).toBe('Murph (half)');
    expect(w.rounds).toBe(10);
    expect(work(w).map((s) => [s.movementId, s.reps ?? s.distanceM])).toEqual([
      ['run', 800],
      ['pull-up', 5],
      ['push-up', 10],
      ['air-squat', 15],
      ['run', 800],
    ]);
  });

  it('Grace with RX and Scaled', () => {
    const w = parseWorkout(
      'Grace\nFor time\nRX:\n30 clean and jerks 135/95 lb\nScaled:\n30 clean and jerks 95/65 lb',
    );
    expect(w.levels).toEqual(['RX', 'Scaled']);
    expect(work(w).map(pick)).toMatchObject([{ id: 'clean-and-jerk', reps: 30, kg: 61.2 }]);
    expect(w.format).toBe('for_time');
  });
});

describe('parseWorkout: EMOM, intervals, tabata', () => {
  it('odd / even EMOM', () => {
    const w = parseWorkout('EMOM 12\nOdd: 12 cal row\nEven: 10 burpees');
    expect([w.format, w.intervalSec, w.timeCapSec]).toEqual(['emom', 60, 720]);
    expect(work(w).map((s) => [s.movementId, s.note])).toEqual([
      ['rower', 'odd minutes'],
      ['burpee', 'even minutes'],
    ]);
  });

  it('minute-by-minute EMOM', () => {
    const w = parseWorkout('EMOM 9\nMin 1: 15 wall balls\nMin 2: 12 cal bike\nMin 3: 10 burpees');
    expect(work(w).map((s) => s.note)).toEqual(['minute 1', 'minute 2', 'minute 3']);
  });

  it('E2MOM x 5 is five rounds of two minutes', () => {
    const w = parseWorkout('E2MOM x 5\n3 Back Squat @ 80%');
    expect([w.intervalSec, w.rounds, w.timeCapSec]).toEqual([120, 5, 600]);
    expect(work(w)[0]).toMatchObject({ movementId: 'back-squat', reps: 3, percent1rm: 80 });
  });

  it('"Every 2:00 x 6" with rest between rounds', () => {
    const w = parseWorkout(
      'Every 2:00 x 6\n250m row\n15 wall balls 20/14 lb\nRest 3:00 between rounds',
    );
    expect([w.format, w.intervalSec, w.rounds, w.restSec]).toEqual(['emom', 120, 6, 180]);
    expect(w.segments.map((s) => s.kind)).toEqual(['work', 'work', 'rest']);
  });

  it('"Every 90 seconds for 12 min"', () => {
    const w = parseWorkout('Every 90 seconds for 12 min\n3 power cleans @ 70%');
    expect([w.intervalSec, w.timeCapSec, w.rounds]).toEqual([90, 720, null]);
  });

  it('run intervals with inline rest', () => {
    const w = parseWorkout('8 x 400m @ 5k pace, 90s rest');
    expect(w.format).toBe('intervals');
    expect(
      w.segments.map((s) => [s.kind, s.movementId, s.sets, s.distanceM, s.durationSec]),
    ).toEqual([
      ['work', 'run', 8, 400, null],
      ['rest', null, null, null, 90],
    ]);
    expect(w.restSec).toBe(90);
  });

  it('threshold intervals with jog recovery', () => {
    const w = parseWorkout('5 x 1km at threshold, 2 min jog rest');
    expect(w.segments.map((s) => [s.kind, s.distanceM ?? s.durationSec])).toEqual([
      ['work', 1000],
      ['rest', 120],
    ]);
    expect(work(w)[0]!.note).toBe('at threshold');
  });

  it('row intervals written with the count after', () => {
    const w = parseWorkout('500m row x 6, rest 90s');
    expect(
      w.segments.map((s) => [s.kind, s.movementId, s.sets, s.distanceM ?? s.durationSec]),
    ).toEqual([
      ['work', 'rower', 6, 500],
      ['rest', null, null, 90],
    ]);
  });

  it('tabata assumes the usual 8 rounds of 20/10 and says so', () => {
    const w = parseWorkout('Tabata air squats');
    expect([w.format, w.rounds, w.workSec, w.restSec]).toEqual(['tabata', 8, 20, 10]);
    expect(work(w)[0]!.movementId).toBe('air-squat');
    expect(w.warnings[0]).toMatch(/usual 8 rounds/);
    expect(parseWorkout('Tabata x 6: burpees').rounds).toBe(6);
  });

  it('on/off work with a modifier line', () => {
    const w = parseWorkout('40 on / 20 off x 8\nBike\nMax cal');
    expect([w.format, w.workSec, w.restSec, w.rounds]).toEqual(['intervals', 40, 20, 8]);
    expect(work(w)).toHaveLength(1);
    expect(work(w)[0]!.note).toBe('max cal');
  });
});

describe('parseWorkout: strength and rest', () => {
  it('sets x reps with loads and percentages', () => {
    const w = parseWorkout('Back Squat 5x5 @ 100kg\nRomanian deadlift 3 x 10 @ 60 kg\nPlank 3x60s');
    expect(w.format).toBe('strength');
    expect(work(w).map(pick)).toMatchObject([
      { id: 'back-squat', sets: 5, reps: 5, kg: 100 },
      { id: 'romanian-deadlift', sets: 3, reps: 10, kg: 60 },
      { id: 'plank', sets: 3, sec: 60 },
    ]);
  });

  it('a lift with a rep scheme after it', () => {
    const w = parseWorkout('Back squat 5-5-5-3-3-1');
    expect(w.format).toBe('strength');
    expect(work(w)[0]).toMatchObject({ movementId: 'back-squat', repScheme: [5, 5, 5, 3, 3, 1] });
  });

  it('build-to and cash-out lines', () => {
    const w = parseWorkout(
      'Bench press 4x8 @ RPE 8\nBack squat: build to a heavy single\nCash out: 50 sit-ups',
    );
    expect(work(w).map((s) => [s.movementId, s.note])).toEqual([
      ['bench-press', 'RPE 8'],
      ['back-squat', 'build to a heavy single'],
      ['sit-up', 'cash out'],
    ]);
  });

  it.each([
    ['Rest 2:00', 120],
    ['Rest 90s', 90],
    ['2 min rest', 120],
    ['Rest 3 minutes', 180],
    ['rest 90', 90],
    ['rest 2', 120],
  ])('rest line %s', (line, sec) => {
    const w = parseWorkout(`10 burpees\n${line}\n10 burpees`);
    expect(w.segments[1]).toMatchObject({ kind: 'rest', movement: 'Rest', durationSec: sec });
  });

  it('rest as needed keeps the words', () => {
    const w = parseWorkout('Deadlift 5x3\nRest as needed');
    expect(w.segments[1]).toMatchObject({
      kind: 'rest',
      durationSec: null,
      note: 'Rest as needed',
    });
  });

  it('keeps score and note lines out of the movements', () => {
    const w = parseWorkout(
      'For time\n100 wall balls\nScore: total time\nGoal: unbroken sets of 20',
    );
    expect(work(w)).toHaveLength(1);
    expect(w.notes).toEqual(['Score: total time', 'Goal: unbroken sets of 20']);
  });
});

describe('parseWorkout: race simulation', () => {
  const SIM = `HYROX sim — 4 min per station
1km Run
SkiErg 1000m
1km Run
Sled Push 50m @ 152kg
1km Run
Sled Pull 50m (103 kg)
1km Run
80m Burpee Broad Jumps
1km Run
Row 1000m
1km Run
Farmers Carry 200m (2x24kg)
1km Run
Sandbag Lunges 100m 20kg
1km Run
100 Wall Balls (6kg)`;

  it('reads 8 runs and 8 stations in order, ending on the last station', () => {
    const w = parseWorkout(SIM);
    expect([w.format, w.title, w.stationCapSec]).toEqual(['hyrox', 'HYROX sim', 240]);
    const ids = work(w).map((s) => s.movementId);
    expect(ids).toHaveLength(16);
    expect(ids.filter((x) => x === 'run')).toHaveLength(8);
    expect(ids.filter((x) => x !== 'run')).toEqual([
      'ski-erg',
      'sled-push',
      'sled-pull',
      'burpee-broad-jump',
      'rower',
      'farmer-carry',
      'sandbag-lunge',
      'wall-ball',
    ]);
    expect(ids[ids.length - 1]).toBe('wall-ball');
    const farmers = work(w).find((s) => s.movementId === 'farmer-carry')!;
    expect([farmers.loadKg, farmers.note]).toEqual([24, '2 × 24 kg']);
  });

  it.each(['4 min/station', '4 minutes per station', 'Each station: 4 min', 'Station cap: 4 min'])(
    'station cap %s',
    (cap) => {
      expect(parseWorkout(`Hyrox stations\n${cap}\nSkiErg 1000m`).stationCapSec).toBe(240);
    },
  );

  it('a lone distance in a run list is a run', () => {
    const w = parseWorkout('Hyrox run practice\n1000m\nSkiErg 500m\n1000m');
    expect(work(w).map((s) => s.movementId)).toEqual(['run', 'ski-erg', 'run']);
  });
});

describe('parts and warnings', () => {
  const TEXT =
    'Warm-up: 5 min easy bike\nA) Front squat 4x6\nB) 15 min AMRAP: 10 T2B, 10 wall balls (9/6 kg)';

  it('splits parts on their headers', () => {
    expect(splitWorkoutParts(TEXT)).toEqual([
      { label: 'Warm-up', text: '5 min easy bike' },
      { label: 'A', text: 'Front squat 4x6' },
      { label: 'B', text: '15 min AMRAP: 10 T2B, 10 wall balls (9/6 kg)' },
    ]);
    expect(
      splitWorkoutParts('Strength:\nDeadlift 5x3\n-into-\n12 min AMRAP\n10 burpees').map(
        (p) => p.label,
      ),
    ).toEqual(['Strength', null]);
    expect(splitWorkoutParts('21-15-9 thrusters')).toEqual([
      { label: null, text: '21-15-9 thrusters' },
    ]);
  });

  it('parses each part on its own', () => {
    const parts = parseWorkoutParts(TEXT);
    expect(parts.map((p) => [p.label, p.workout.format])).toEqual([
      ['Warm-up', 'unknown'],
      ['A', 'strength'],
      ['B', 'amrap'],
    ]);
    expect(parts[2]!.workout.timeCapSec).toBe(900);
  });

  it('says when a single parse spans several parts', () => {
    const w = parseWorkout(TEXT);
    expect(w.warnings).toContain('This looks like 3 parts (Warm-up, A, B); read here as one list');
  });

  it('says when nothing could be read', () => {
    expect(parseWorkout('').warnings).toEqual(['Nothing to read']);
    expect(parseWorkout('21-15-9').warnings).toContain('Couldn’t find any movements');
  });

  it('strips bullets and list numbers', () => {
    const w = parseWorkout('For time\n- 50 wall balls\n• 40 cal row\n3. 30 box jumps');
    expect(work(w).map((s) => s.movementId)).toEqual(['wall-ball', 'rower', 'box-jump']);
  });
});
