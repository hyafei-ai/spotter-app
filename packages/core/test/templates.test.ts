import { describe, expect, it } from 'vitest';
import {
  LibraryExercise,
  STARTER_LIBRARY,
  findLibraryExercise,
  searchLibrary,
} from '../src/library';
import { EXERCISE_REGIONS } from '../src/injury';
import { parseWorkout } from '../src/parse';
import {
  BENCHMARKS,
  DIVISION_LOADS,
  HYROX_FULL_ORDER,
  HYROX_STATIONS,
  HYROX_STATION_IDS,
  HYROX_STATION_STANDARDS,
  PFT_STATION_STANDARDS,
  PFT_TEMPLATE,
  RACE_TRAINING,
  REF_RUN_SEC,
  REF_STATION_SEC,
  SESSIONS,
  SIM_DIVISIONS,
  VERIFY_NOTE,
  allSimTemplates,
  allTemplates,
  buildSimTemplate,
  simAsWorkout,
  templateById,
} from '../src/templates';

describe('movement library', () => {
  it('ids are unique and valid', () => {
    const ids = STARTER_LIBRARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of STARTER_LIBRARY) expect(LibraryExercise.safeParse(e).success, e.id).toBe(true);
  });

  it('keeps the original starter ids, in order, at the front (append-only)', () => {
    expect(STARTER_LIBRARY.slice(0, 5).map((e) => e.id)).toEqual([
      'back-squat',
      'front-squat',
      'safety-bar-squat',
      'goblet-squat',
      'bulgarian-split-squat',
    ]);
    expect(STARTER_LIBRARY[39]!.id).toBe('kettlebell-swing');
  });

  it('every entry has injury regions', () => {
    expect(STARTER_LIBRARY.filter((e) => !(e.id in EXERCISE_REGIONS)).map((e) => e.id)).toEqual([]);
  });

  it('no alias points at two different exercises', () => {
    const seen = new Map<string, string>();
    for (const e of STARTER_LIBRARY)
      for (const n of [e.name, ...(e.aliases ?? [])]) {
        const k = n.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(k)) expect(seen.get(k), `${n} is on ${seen.get(k)} and ${e.id}`).toBe(e.id);
        seen.set(k, e.id);
      }
  });

  it.each([
    ['t2b', 'toes-to-bar'],
    ['OHP', 'overhead-press'],
    ['C&J', 'clean-and-jerk'],
    ['hspu', 'kipping-hspu'],
    ['assault', 'air-bike'],
    ['pullup', 'pull-up'],
    ['DU', 'double-under'],
    ['bbj', 'burpee-broad-jump'],
    ['wall ball', 'wall-ball'],
  ])('search finds %s through aliases', (q, id) => {
    expect(searchLibrary(STARTER_LIBRARY, q).map((e) => e.id)).toContain(id);
  });

  it('findLibraryExercise is exact, ignoring case, punctuation and plural s', () => {
    expect(findLibraryExercise(STARTER_LIBRARY, 'Thrusters')?.id).toBe('thruster');
    expect(findLibraryExercise(STARTER_LIBRARY, 'Pull-Ups')?.id).toBe('pull-up');
    expect(findLibraryExercise(STARTER_LIBRARY, 'KB swings')?.id).toBe('kettlebell-swing');
    expect(findLibraryExercise(STARTER_LIBRARY, 'sandbag walking lunges')?.id).toBe(
      'sandbag-lunge',
    );
    expect(findLibraryExercise(STARTER_LIBRARY, 'squat variation')).toBeNull();
    expect(findLibraryExercise(STARTER_LIBRARY, '')).toBeNull();
  });
});

describe('templates', () => {
  const all = allTemplates();

  it('ids are unique and look up', () => {
    const ids = all.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(templateById('benchmark.fran')?.name).toBe('Fran');
    expect(templateById('nope')).toBeNull();
  });

  it('every segment is a library movement or rest', () => {
    for (const t of all)
      for (const s of t.workout.segments) {
        if (s.kind === 'rest') continue;
        expect(
          STARTER_LIBRARY.some((e) => e.id === s.movementId),
          `${t.id}: ${s.movement}`,
        ).toBe(true);
      }
  });

  it('no brand claims or third-party programme names in labels', () => {
    for (const t of all) {
      expect(t.label, t.id).not.toMatch(
        /crossfit|hyrox|mayhem|beetle|affiliate|freedom|liberty|independence/i,
      );
      expect(t.summary, t.id).not.toMatch(/elite|legendary|sub-\d/i);
    }
    expect(BENCHMARKS.every((b) => b.label === `Benchmark: ${b.name}`)).toBe(true);
  });

  it.each([...BENCHMARKS, ...SESSIONS, ...RACE_TRAINING].map((t) => [t.id, t] as const))(
    '%s: the whiteboard parses back to the same workout',
    (_id, t) => {
      const p = parseWorkout(t.whiteboard);
      const w = t.workout;
      expect(p.format).toBe(w.format);
      expect(p.rounds).toBe(w.rounds);
      expect(p.timeCapSec).toBe(w.timeCapSec);
      expect(p.repScheme).toEqual(w.repScheme);
      const shape = (s: (typeof w.segments)[number]) => [
        s.kind,
        s.movementId,
        s.reps,
        s.sets,
        s.distanceM,
        s.calories,
        s.durationSec,
        s.loadKg,
      ];
      expect(p.segments.map(shape)).toEqual(w.segments.map(shape));
    },
  );

  it('Fran is 21-15-9 thrusters at 95/65 lb, converted', () => {
    const fran = templateById('benchmark.fran')!;
    expect(fran.workout.segments[0]).toMatchObject({
      movementId: 'thruster',
      loadKg: 43.1,
      loadKgAlt: 29.5,
      loadFromLb: true,
    });
  });
});

describe('race sims', () => {
  it('the race order is 8 runs and 8 stations, ending on wall balls', () => {
    expect(HYROX_FULL_ORDER).toHaveLength(16);
    expect(HYROX_FULL_ORDER.filter((x) => x === 'Run')).toHaveLength(8);
    expect(HYROX_FULL_ORDER[HYROX_FULL_ORDER.length - 1]).toBe('Wall Balls');
    expect(
      HYROX_STATIONS.every((s) => STARTER_LIBRARY.some((e) => e.id === HYROX_STATION_IDS[s])),
    ).toBe(true);
  });

  it('a full singles sim has 16 segments with division loads', () => {
    const sim = buildSimTemplate('full', 'singles', 'pro_men');
    expect(sim.id).toBe('race.full.singles.pro_men');
    expect(sim.label).toBe('Full race sim · Singles · Pro Men');
    expect(sim.segments).toHaveLength(16);
    expect(sim.segments[15]).toMatchObject({
      kind: 'station',
      station: 'Wall Balls',
      reps: 100,
      weightKg: 9,
    });
    expect(sim.segments.find((s) => s.station === 'Farmers Carry')).toMatchObject({
      weightKg: 32,
      implements: 2,
      distanceM: 200,
    });
    expect(sim.totalRefSec).toBe(8 * 255 + 210 + 135 + 165 + 300 + 220 + 105 + 210 + 195);
  });

  it('a half sim is the first four runs and stations, marked as a training format', () => {
    const half = buildSimTemplate('half', 'singles', 'open_women');
    expect(half.segments).toHaveLength(8);
    expect(half.segments.filter((s) => s.kind === 'station').map((s) => s.station)).toEqual([
      'SkiErg',
      'Sled Push',
      'Sled Pull',
      'Burpee Broad Jump',
    ]);
    expect(half.verify.some((v) => v.includes('not an official race'))).toBe(true);
  });

  it('the source duplicate (Open Men = Pro Women splits) is unknown, not guessed', () => {
    for (const d of ['open_men', 'pro_women'] as const) {
      expect(Object.values(REF_STATION_SEC[d]).every((v) => v.value === null)).toBe(true);
      expect(buildSimTemplate('full', 'singles', d).totalRefSec).toBeNull();
    }
    expect(REF_STATION_SEC.open_women.SkiErg.value).toBe(270);
  });

  it('doubles and relay have no reference splits (the source used a made-up 0.65 factor)', () => {
    for (const type of ['doubles', 'relay'] as const) {
      const sim = buildSimTemplate('full', type, 'pro_men');
      expect(sim.segments.every((s) => s.refSec === null)).toBe(true);
      expect(sim.totalRefSec).toBeNull();
      expect(sim.verify.length).toBeGreaterThan(2);
    }
  });

  it('every division load, distance and reference split is marked to verify', () => {
    for (const d of SIM_DIVISIONS) {
      for (const v of Object.values(DIVISION_LOADS[d])) expect(v).toMatchObject({ verify: true });
      for (const v of Object.values(REF_STATION_SEC[d])) expect(v.verify).toBe(true);
      expect(REF_RUN_SEC[d]).toMatchObject({ verify: true, note: VERIFY_NOTE });
    }
    for (const s of Object.values(HYROX_STATION_STANDARDS))
      expect((s.distanceM ?? s.reps)!.verify).toBe(true);
  });

  it('lists every combination once', () => {
    const sims = allSimTemplates();
    expect(sims).toHaveLength(2 * 3 * 4);
    expect(new Set(sims.map((s) => s.id)).size).toBe(sims.length);
  });

  it('maps into the neutral structure', () => {
    const t = simAsWorkout(buildSimTemplate('full', 'singles', 'open_women'));
    expect(t.workout.format).toBe('hyrox');
    expect(t.workout.segments.map((s) => s.movementId).filter((x) => x !== 'run')).toEqual(
      HYROX_STATIONS.map((s) => HYROX_STATION_IDS[s]),
    );
    expect(t.workout.segments.find((s) => s.movementId === 'farmer-carry')?.note).toBe('2 × 16 kg');
  });

  it('PFT distances are unknown because the source disagreed with itself', () => {
    for (const s of Object.values(PFT_STATION_STANDARDS)) {
      const v = (s.distanceM ?? s.reps)!;
      expect(v.value).toBeNull();
      expect(v.note).toMatch(/two versions/);
    }
    expect(PFT_TEMPLATE.workout.segments).toHaveLength(6);
  });
});
