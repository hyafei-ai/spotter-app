import { lb, restSeg, seg, workout, type TemplateWorkout } from './types';

/**
 * Common public benchmark workouts and generic sessions (docs/ports.md row 3), from Station Zero's
 * seedTemplates.ts and defaultTemplates.ts, filtered:
 * - Dropped: third-party programming tiers and the templates named after them, the "Elite sim targeting sub-60"
 *   template, recovery/yoga/foam-roll lists (not workouts to score), the partner and chipper templates whose
 *   distances were unclear ("Sled Push 20 lengths").
 * - Dropped copy that was a claim, not a description ("Sub-5 is elite", "Legendary benchmark").
 * - Labels say "Benchmark: Fran", never a brand.
 * Loads are the commonly published ones, kept in kg with the pound original noted; coaches scale freely.
 */

const pair = (heavyLb: number, lightLb: number) => ({
  loadKg: lb(heavyLb),
  loadKgAlt: lb(lightLb),
  loadFromLb: true,
});

export const BENCHMARKS: TemplateWorkout[] = [
  {
    id: 'benchmark.fran',
    name: 'Fran',
    label: 'Benchmark: Fran',
    category: 'benchmark',
    summary: '21-15-9 thrusters and pull-ups, for time',
    scoring: 'time',
    workout: workout({
      format: 'for_time',
      repScheme: [21, 15, 9],
      segments: [
        seg('thruster', { ...pair(95, 65), repScheme: [21, 15, 9], note: '95/65 lb' }),
        seg('pull-up', { repScheme: [21, 15, 9] }),
      ],
    }),
    whiteboard: 'Fran\nFor time\n21-15-9\nThrusters (95/65 lb)\nPull-ups',
    verify: [],
  },
  {
    id: 'benchmark.cindy',
    name: 'Cindy',
    label: 'Benchmark: Cindy',
    category: 'benchmark',
    summary: '20 min AMRAP of 5 pull-ups, 10 push-ups, 15 air squats',
    scoring: 'rounds_reps',
    workout: workout({
      format: 'amrap',
      timeCapSec: 1200,
      segments: [
        seg('pull-up', { reps: 5 }),
        seg('push-up', { reps: 10 }),
        seg('air-squat', { reps: 15 }),
      ],
    }),
    whiteboard: 'Cindy\nAMRAP 20\n5 pull-ups\n10 push-ups\n15 air squats',
    verify: [],
  },
  {
    id: 'benchmark.helen',
    name: 'Helen',
    label: 'Benchmark: Helen',
    category: 'benchmark',
    summary: '3 rounds for time: 400 m run, 21 kettlebell swings, 12 pull-ups',
    scoring: 'time',
    workout: workout({
      format: 'rounds_for_time',
      rounds: 3,
      segments: [
        seg('run', { distanceM: 400 }),
        seg('kettlebell-swing', { reps: 21, loadKg: 24, loadKgAlt: 16 }),
        seg('pull-up', { reps: 12 }),
      ],
    }),
    whiteboard: 'Helen\n3 rounds for time\n400m run\n21 KB swings (24/16 kg)\n12 pull-ups',
    verify: [],
  },
  {
    id: 'benchmark.grace',
    name: 'Grace',
    label: 'Benchmark: Grace',
    category: 'benchmark',
    summary: '30 clean and jerks for time',
    scoring: 'time',
    workout: workout({
      format: 'for_time',
      segments: [seg('clean-and-jerk', { reps: 30, ...pair(135, 95), note: '135/95 lb' })],
    }),
    whiteboard: 'Grace\nFor time\n30 clean and jerks (135/95 lb)',
    verify: [],
  },
  {
    id: 'benchmark.karen',
    name: 'Karen',
    label: 'Benchmark: Karen',
    category: 'benchmark',
    summary: '150 wall balls for time',
    scoring: 'time',
    workout: workout({
      format: 'for_time',
      segments: [seg('wall-ball', { reps: 150, ...pair(20, 14), note: '20/14 lb' })],
    }),
    whiteboard: 'Karen\nFor time\n150 wall balls (20/14 lb)',
    verify: [],
  },
  {
    id: 'benchmark.annie',
    name: 'Annie',
    label: 'Benchmark: Annie',
    category: 'benchmark',
    summary: '50-40-30-20-10 double-unders and sit-ups, for time',
    scoring: 'time',
    workout: workout({
      format: 'for_time',
      repScheme: [50, 40, 30, 20, 10],
      segments: [
        seg('double-under', { repScheme: [50, 40, 30, 20, 10] }),
        seg('sit-up', { repScheme: [50, 40, 30, 20, 10] }),
      ],
    }),
    whiteboard: 'Annie\nFor time\n50-40-30-20-10\nDouble-unders\nSit-ups',
    verify: [],
  },
  {
    id: 'benchmark.diane',
    name: 'Diane',
    label: 'Benchmark: Diane',
    category: 'benchmark',
    summary: '21-15-9 deadlifts and handstand push-ups, for time',
    scoring: 'time',
    workout: workout({
      format: 'for_time',
      repScheme: [21, 15, 9],
      segments: [
        seg('deadlift', { ...pair(225, 155), repScheme: [21, 15, 9], note: '225/155 lb' }),
        seg('kipping-hspu', { repScheme: [21, 15, 9] }),
      ],
    }),
    whiteboard: 'Diane\nFor time\n21-15-9\nDeadlifts (225/155 lb)\nHSPU',
    verify: [],
  },
  {
    id: 'benchmark.jackie',
    name: 'Jackie',
    label: 'Benchmark: Jackie',
    category: 'benchmark',
    summary: '1000 m row, 50 thrusters, 30 pull-ups, for time',
    scoring: 'time',
    workout: workout({
      format: 'for_time',
      segments: [
        seg('rower', { distanceM: 1000 }),
        seg('thruster', { reps: 50, ...pair(45, 35), note: '45/35 lb' }),
        seg('pull-up', { reps: 30 }),
      ],
    }),
    whiteboard: 'Jackie\nFor time\n1000m row\n50 thrusters (45/35 lb)\n30 pull-ups',
    verify: [],
  },
  {
    id: 'benchmark.half-murph',
    name: 'Half Murph',
    label: 'Benchmark: Half Murph',
    category: 'benchmark',
    summary: '800 m run, 10 rounds of 5 pull-ups, 10 push-ups, 15 air squats, 800 m run',
    scoring: 'time',
    workout: workout({
      format: 'rounds_for_time',
      rounds: 10,
      segments: [
        seg('run', { distanceM: 800, note: 'once, before the rounds' }),
        seg('pull-up', { reps: 5 }),
        seg('push-up', { reps: 10 }),
        seg('air-squat', { reps: 15 }),
        seg('run', { distanceM: 800, note: 'once, after the rounds' }),
      ],
    }),
    whiteboard:
      'Half Murph\nFor time\n800m run\n10 rounds of 5 pull-ups, 10 push-ups, 15 air squats\n800m run',
    verify: [],
  },
];

/** Generic sessions any coach can start from: runs, intervals, EMOMs. */
export const SESSIONS: TemplateWorkout[] = [
  {
    id: 'run.400-repeats',
    name: '400 m repeats',
    label: '400 m repeats',
    category: 'running',
    summary: '8 × 400 m at 5k pace, 90 s rest',
    scoring: 'time',
    workout: workout({
      format: 'intervals',
      restSec: 90,
      segments: [seg('run', { sets: 8, distanceM: 400, note: '@ 5k pace' }), restSeg(90)],
    }),
    whiteboard: '8 x 400m @ 5k pace, 90s rest',
    verify: [],
  },
  {
    id: 'run.threshold-1k',
    name: 'Threshold kilometres',
    label: 'Threshold kilometres',
    category: 'running',
    summary: '4 × 1 km at threshold, 2 min jog between',
    scoring: 'time',
    workout: workout({
      format: 'intervals',
      restSec: 120,
      segments: [seg('run', { sets: 4, distanceM: 1000, note: 'at threshold' }), restSeg(120)],
    }),
    whiteboard: '4 x 1km at threshold, 2 min jog rest',
    verify: [],
  },
  {
    id: 'run.tempo-5k',
    name: 'Tempo 5 km',
    label: 'Tempo 5 km',
    category: 'running',
    summary: '5 km at a sustained, comfortably hard pace',
    scoring: 'time',
    workout: workout({
      format: 'unknown',
      segments: [seg('run', { distanceM: 5000, note: 'tempo' })],
    }),
    whiteboard: 'Tempo run 5k',
    verify: [],
  },
  {
    id: 'run.long-10k',
    name: 'Long easy 10 km',
    label: 'Long easy 10 km',
    category: 'running',
    summary: '10 km at an easy, conversational pace',
    scoring: 'none',
    workout: workout({
      format: 'unknown',
      segments: [seg('run', { distanceM: 10000, note: 'easy' })],
    }),
    whiteboard: 'Run 10km easy',
    verify: [],
  },
  {
    id: 'run.hill-sprints',
    name: 'Hill sprints',
    label: 'Hill sprints',
    category: 'running',
    summary: '10 × 30 s hill sprints, walk back down to recover',
    scoring: 'none',
    workout: workout({
      format: 'intervals',
      segments: [
        seg('run', { sets: 10, durationSec: 30, note: 'uphill; walk back down to recover' }),
      ],
    }),
    whiteboard: 'Hill sprints\n10 x 30s sprint, walk back recovery',
    verify: [],
  },
  {
    id: 'run.recovery',
    name: 'Recovery jog',
    label: 'Recovery jog',
    category: 'running',
    summary: '20 min easy, conversational',
    scoring: 'none',
    workout: workout({
      format: 'unknown',
      segments: [seg('run', { durationSec: 1200, note: 'easy' })],
    }),
    whiteboard: 'Run 20 min easy',
    verify: [],
  },
  {
    id: 'row.500-repeats',
    name: '500 m row repeats',
    label: '500 m row repeats',
    category: 'skill',
    summary: '6 × 500 m row, 90 s rest; keep the splits even',
    scoring: 'time',
    workout: workout({
      format: 'intervals',
      restSec: 90,
      segments: [seg('rower', { sets: 6, distanceM: 500 }), restSeg(90)],
    }),
    whiteboard: '6 x 500m row, 90s rest',
    verify: [],
  },
  {
    id: 'ski.500-repeats',
    name: '500 m SkiErg repeats',
    label: '500 m SkiErg repeats',
    category: 'skill',
    summary: '5 × 500 m SkiErg, 90 s rest',
    scoring: 'time',
    workout: workout({
      format: 'intervals',
      restSec: 90,
      segments: [seg('ski-erg', { sets: 5, distanceM: 500 }), restSeg(90)],
    }),
    whiteboard: '5 x 500m SkiErg, 90s rest',
    verify: [],
  },
  {
    id: 'emom.wall-ball-row',
    name: 'EMOM 24: wall balls and row',
    label: 'EMOM 24: wall balls and row',
    category: 'conditioning',
    summary: 'Odd minutes wall balls, even minutes calorie row, for 24 minutes',
    scoring: 'none',
    workout: workout({
      format: 'emom',
      intervalSec: 60,
      timeCapSec: 1440,
      segments: [
        seg('wall-ball', { reps: 10, note: 'odd minutes; add 1 rep each round up to 15' }),
        seg('rower', { calories: 8, note: 'even minutes; add 1 calorie each round up to 12' }),
      ],
    }),
    whiteboard: 'EMOM 24\nOdd: 10 wall balls\nEven: 8 cal row',
    verify: [],
  },
  {
    id: 'tabata.four-stations',
    name: 'Tabata: four stations',
    label: 'Tabata: four stations',
    category: 'conditioning',
    summary: '8 rounds of 20 s on, 10 s off at each of four stations',
    scoring: 'reps',
    workout: workout({
      format: 'tabata',
      rounds: 8,
      workSec: 20,
      restSec: 10,
      segments: [
        seg('ski-erg', { note: 'station 1' }),
        seg('burpee', { note: 'station 2' }),
        seg('rower', { note: 'station 3' }),
        seg('wall-ball', { note: 'station 4' }),
      ],
    }),
    whiteboard: 'Tabata x 8\nSkiErg\nBurpees\nRow\nWall balls',
    verify: [],
  },
  {
    id: 'amrap.run-wall-ball-burpee',
    name: 'AMRAP 20: run, wall balls, burpees',
    label: 'AMRAP 20: run, wall balls, burpees',
    category: 'conditioning',
    summary: '20 min AMRAP of 200 m run, 10 wall balls, 10 burpees',
    scoring: 'rounds_reps',
    workout: workout({
      format: 'amrap',
      timeCapSec: 1200,
      segments: [
        seg('run', { distanceM: 200 }),
        seg('wall-ball', { reps: 10 }),
        seg('burpee', { reps: 10 }),
      ],
    }),
    whiteboard: 'AMRAP 20\n200m run\n10 wall balls\n10 burpees',
    verify: [],
  },
];
