import type { ParsedSegment } from '../parse/types';
import { seg, toVerify, workout, VERIFY_NOTE, type TemplateWorkout, type Verify } from './types';

/**
 * Hyrox-format race simulations, station constants and PFT constants (docs/ports.md row 3), from Station Zero's
 * constants/hyrox.ts, constants/pft.ts, utils/hyroxSimTemplates.ts and the race templates in defaultTemplates.ts.
 *
 * Every division load and reference split is marked `verify` ("To verify against the current official standard").
 * Fixed rather than copied:
 * - The source's reference station splits for Open Men and Pro Women were identical, row for row (a copy-paste);
 *   both rows are null here rather than guessed.
 * - The source's doubles/relay splits were the singles splits × 0.65, a made-up factor; they are null here.
 * - The source's full-sim template had 9 runs (a run after the last station); a race is 8 runs and ends on the
 *   last station.
 * - The source's two PFT definitions disagreed (500 m / 25 m / 50 reps in one, 1000 m / 50 m / 75 reps in the
 *   other); the PFT distances are null here, with both versions in the note.
 * - The source's goal-time split weights (distributeGoalTime) and scale-to-goal had no source; not ported.
 * Labels avoid brand claims: "Full race sim · Singles · Open Women".
 */

export const HYROX_STATIONS = [
  'SkiErg',
  'Sled Push',
  'Sled Pull',
  'Burpee Broad Jump',
  'Rowing',
  'Farmers Carry',
  'Sandbag Lunges',
  'Wall Balls',
] as const;
export type HyroxStation = (typeof HYROX_STATIONS)[number];

/** Library ids for each station (library.ts). */
export const HYROX_STATION_IDS: Record<HyroxStation, string> = {
  SkiErg: 'ski-erg',
  'Sled Push': 'sled-push',
  'Sled Pull': 'sled-pull',
  'Burpee Broad Jump': 'burpee-broad-jump',
  Rowing: 'rower',
  'Farmers Carry': 'farmer-carry',
  'Sandbag Lunges': 'sandbag-lunge',
  'Wall Balls': 'wall-ball',
};

/** Short names for chart labels. */
export const HYROX_STATION_SHORT: Record<HyroxStation, string> = {
  SkiErg: 'Ski',
  'Sled Push': 'Push',
  'Sled Pull': 'Pull',
  'Burpee Broad Jump': 'BBJ',
  Rowing: 'Row',
  'Farmers Carry': 'Farm',
  'Sandbag Lunges': 'Lunge',
  'Wall Balls': 'WB',
};

/** Run distance between stations in the full format. */
export const HYROX_RUN_M: Verify = toVerify(1000);

/** Station work per the source: distance or reps. Wall ball reps depend on division (see DIVISION_LOADS). */
export const HYROX_STATION_STANDARDS: Record<
  HyroxStation,
  { distanceM: Verify | null; reps: Verify | null }
> = {
  SkiErg: { distanceM: toVerify(1000), reps: null },
  'Sled Push': { distanceM: toVerify(50), reps: null },
  'Sled Pull': { distanceM: toVerify(50), reps: null },
  'Burpee Broad Jump': { distanceM: toVerify(80), reps: null },
  Rowing: { distanceM: toVerify(1000), reps: null },
  'Farmers Carry': { distanceM: toVerify(200), reps: null },
  'Sandbag Lunges': { distanceM: toVerify(100), reps: null },
  'Wall Balls': { distanceM: null, reps: toVerify(100) },
};

/** The race order: run 1, station 1, … run 8, station 8. Ends on the last station. */
export const HYROX_FULL_ORDER: ('Run' | HyroxStation)[] = HYROX_STATIONS.flatMap((s) => [
  'Run' as const,
  s,
]);

export const SIM_DIVISIONS = ['open_women', 'open_men', 'pro_women', 'pro_men'] as const;
export type SimDivision = (typeof SIM_DIVISIONS)[number];
export const SIM_DIVISION_LABEL: Record<SimDivision, string> = {
  open_women: 'Open Women',
  open_men: 'Open Men',
  pro_women: 'Pro Women',
  pro_men: 'Pro Men',
};

export type SimFormat = 'full' | 'half';
export type SimType = 'singles' | 'doubles' | 'relay';
export const SIM_TYPE_LABEL: Record<SimType, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  relay: 'Relay',
};

export interface DivisionLoads {
  sledPushKg: Verify;
  sledPullKg: Verify;
  /** Per hand. */
  farmersKg: Verify;
  sandbagKg: Verify;
  wallBallKg: Verify;
  wallBallReps: Verify;
}

const loads = (
  sledPushKg: number,
  sledPullKg: number,
  farmersKg: number,
  sandbagKg: number,
  wallBallKg: number,
): DivisionLoads => ({
  sledPushKg: toVerify(sledPushKg),
  sledPullKg: toVerify(sledPullKg),
  farmersKg: toVerify(farmersKg),
  sandbagKg: toVerify(sandbagKg),
  wallBallKg: toVerify(wallBallKg),
  wallBallReps: toVerify(100),
});

/**
 * Division loads as the source had them. The source's own comment said the Open Women sled push figure includes
 * the sled and should be confirmed per heat. Open Men and Pro Women share sled, farmers and wall ball loads here;
 * that may be the real standard (it is not a row-for-row copy, the sandbag differs), so it is kept and marked.
 */
export const DIVISION_LOADS: Record<SimDivision, DivisionLoads> = {
  open_women: loads(102, 78, 16, 10, 4),
  open_men: loads(152, 103, 24, 20, 6),
  pro_women: loads(152, 103, 24, 15, 6),
  pro_men: loads(202, 153, 32, 30, 9),
};

/** Reference run seconds per km by division, from the source. Not a norm: only a default pace to show. */
export const REF_RUN_SEC: Record<SimDivision, Verify> = {
  open_women: toVerify(330),
  open_men: toVerify(300),
  pro_women: toVerify(270),
  pro_men: toVerify(255),
};

const ref = (row: number[] | null): Record<HyroxStation, Verify> =>
  Object.fromEntries(
    HYROX_STATIONS.map((s, i) => [
      s,
      toVerify<number>(
        row ? row[i]! : null,
        row
          ? VERIFY_NOTE
          : 'Unknown: the source had the same numbers for Open Men and Pro Women (a copy-paste)',
      ),
    ]),
  ) as Record<HyroxStation, Verify>;

/** Reference station seconds by division, in race order. Open Men and Pro Women are unknown (source duplicate). */
export const REF_STATION_SEC: Record<SimDivision, Record<HyroxStation, Verify>> = {
  open_women: ref([270, 195, 225, 360, 285, 150, 270, 270]),
  open_men: ref(null),
  pro_women: ref(null),
  pro_men: ref([210, 135, 165, 300, 220, 105, 210, 195]),
};

export interface SimSegment {
  index: number;
  kind: 'run' | 'station';
  /** "Run 3" or the station name. */
  name: string;
  station: HyroxStation | null;
  distanceM: number | null;
  reps: number | null;
  weightKg: number | null;
  /** 2 for farmers carry (one per hand). */
  implements: number | null;
  /** Reference seconds, or null when unknown. Always `verify`. */
  refSec: number | null;
}

export interface SimTemplate {
  /** "race.full.singles.pro_women" */
  id: string;
  format: SimFormat;
  type: SimType;
  division: SimDivision;
  /** "Full race sim · Singles · Open Women" */
  label: string;
  subtitle: string;
  segments: SimSegment[];
  /** Sum of the reference splits, or null when any is unknown. */
  totalRefSec: number | null;
  /** Plain notes on what to check. */
  verify: string[];
}

const TYPE_NOTE: Record<SimType, string | null> = {
  singles: null,
  doubles:
    'Doubles: partners split the station work; check the current rules for how runs are shared. Reference splits are unknown for doubles.',
  relay:
    'Relay: each team member takes a share of the runs and stations; check the current rules for the split. Reference splits are unknown for relay.',
};

function stationSegment(
  station: HyroxStation,
  index: number,
  division: SimDivision,
  type: SimType,
): SimSegment {
  const l = DIVISION_LOADS[division];
  const std = HYROX_STATION_STANDARDS[station];
  const weight: Partial<Record<HyroxStation, Verify>> = {
    'Sled Push': l.sledPushKg,
    'Sled Pull': l.sledPullKg,
    'Farmers Carry': l.farmersKg,
    'Sandbag Lunges': l.sandbagKg,
    'Wall Balls': l.wallBallKg,
  };
  return {
    index,
    kind: 'station',
    name: station,
    station,
    distanceM: std.distanceM?.value ?? null,
    reps: station === 'Wall Balls' ? l.wallBallReps.value : null,
    weightKg: weight[station]?.value ?? null,
    implements: station === 'Farmers Carry' ? 2 : null,
    refSec: type === 'singles' ? REF_STATION_SEC[division][station].value : null,
  };
}

/**
 * One simulation template. Half is the source's definition: the first four runs and stations at full distance.
 * There is no official half format; it's marked to verify as a training format.
 */
export function buildSimTemplate(
  format: SimFormat,
  type: SimType,
  division: SimDivision,
): SimTemplate {
  const stations = format === 'full' ? HYROX_STATIONS : HYROX_STATIONS.slice(0, 4);
  const segments: SimSegment[] = [];
  stations.forEach((station, i) => {
    segments.push({
      index: segments.length,
      kind: 'run',
      name: `Run ${i + 1}`,
      station: null,
      distanceM: HYROX_RUN_M.value,
      reps: null,
      weightKg: null,
      implements: null,
      refSec: type === 'singles' ? REF_RUN_SEC[division].value : null,
    });
    segments.push(stationSegment(station, segments.length, division, type));
  });
  const refs = segments.map((s) => s.refSec);
  const verify = [
    `Division loads and distances: ${VERIFY_NOTE.toLowerCase()}`,
    'Reference splits come from the source app with no stated source; they are a default to show, not a norm',
  ];
  if (TYPE_NOTE[type]) verify.push(TYPE_NOTE[type]!);
  if (format === 'half')
    verify.push('Half: a training format (first four runs and stations), not an official race');
  return {
    id: `race.${format}.${type}.${division}`,
    format,
    type,
    division,
    label: `${format === 'full' ? 'Full' : 'Half'} race sim · ${SIM_TYPE_LABEL[type]} · ${SIM_DIVISION_LABEL[division]}`,
    subtitle: format === 'full' ? '8 runs and 8 stations' : '4 runs and 4 stations',
    segments,
    totalRefSec: refs.every((x): x is number => x != null) ? refs.reduce((a, b) => a + b, 0) : null,
    verify,
  };
}

/** Every format × type × division, for a picker. */
export function allSimTemplates(): SimTemplate[] {
  const out: SimTemplate[] = [];
  for (const format of ['full', 'half'] as SimFormat[])
    for (const type of ['singles', 'doubles', 'relay'] as SimType[])
      for (const division of SIM_DIVISIONS) out.push(buildSimTemplate(format, type, division));
  return out;
}

/** A simulation in the neutral parsed structure the block model maps from. */
export function simAsWorkout(sim: SimTemplate): TemplateWorkout {
  const segments: ParsedSegment[] = sim.segments.map((s) =>
    s.kind === 'run'
      ? seg('run', { distanceM: s.distanceM })
      : seg(HYROX_STATION_IDS[s.station!], {
          distanceM: s.distanceM,
          reps: s.reps,
          loadKg: s.weightKg,
          note: s.implements ? `${s.implements} × ${s.weightKg} kg` : null,
        }),
  );
  return {
    id: sim.id,
    name: sim.label,
    label: sim.label,
    category: 'race_sim',
    summary: sim.subtitle,
    scoring: 'time',
    workout: workout({ format: 'hyrox', segments }),
    whiteboard: '',
    verify: sim.verify,
  };
}

/* ---------- PFT ---------- */

/** PFT stations (the source's constants/pft.ts): six stations, no running. */
export const PFT_STATIONS = [
  'SkiErg',
  'Sled Push',
  'Sled Pull',
  'Burpee Broad Jump',
  'Rowing',
  'Wall Balls',
] as const satisfies readonly HyroxStation[];
export type PftStation = (typeof PFT_STATIONS)[number];

const PFT_CONFLICT =
  'Unknown: the source had two versions (500 m / 25 m / 25 m / 40 m / 500 m / 50 reps, and 1000 m / 50 m / 50 m / 80 m / 1000 m / 75 reps). ' +
  VERIFY_NOTE;

/** PFT station work: null until checked, because the source's two definitions disagreed. */
export const PFT_STATION_STANDARDS: Record<
  PftStation,
  { distanceM: Verify | null; reps: Verify | null }
> = {
  SkiErg: { distanceM: toVerify<number>(null, PFT_CONFLICT), reps: null },
  'Sled Push': { distanceM: toVerify<number>(null, PFT_CONFLICT), reps: null },
  'Sled Pull': { distanceM: toVerify<number>(null, PFT_CONFLICT), reps: null },
  'Burpee Broad Jump': { distanceM: toVerify<number>(null, PFT_CONFLICT), reps: null },
  Rowing: { distanceM: toVerify<number>(null, PFT_CONFLICT), reps: null },
  'Wall Balls': { distanceM: null, reps: toVerify<number>(null, PFT_CONFLICT) },
};

export const PFT_TEMPLATE: TemplateWorkout = {
  id: 'assessment.pft',
  name: 'Station test (PFT)',
  label: 'Station test (PFT)',
  category: 'assessment',
  summary: 'Six stations back to back, no running; distances to set once checked',
  scoring: 'time',
  workout: workout({
    format: 'for_time',
    segments: PFT_STATIONS.map((s) => seg(HYROX_STATION_IDS[s])),
  }),
  whiteboard: '',
  verify: [PFT_CONFLICT],
};

/* ---------- race-format training sessions (from the source's defaultTemplates.ts) ---------- */

const station = (s: HyroxStation, distanceM: number | null, reps: number | null = null) =>
  seg(HYROX_STATION_IDS[s], { distanceM, reps });
const run = (distanceM: number) => seg('run', { distanceM });

export const RACE_TRAINING: TemplateWorkout[] = [
  {
    id: 'race_training.stations-only',
    name: 'Stations only',
    label: 'Race stations, no running',
    category: 'race_sim',
    summary: 'All eight stations back to back at race distances',
    scoring: 'time',
    workout: workout({
      format: 'for_time',
      segments: [
        station('SkiErg', 1000),
        station('Sled Push', 50),
        station('Sled Pull', 50),
        station('Burpee Broad Jump', 80),
        station('Rowing', 1000),
        station('Farmers Carry', 200),
        station('Sandbag Lunges', 100),
        station('Wall Balls', null, 100),
      ],
    }),
    whiteboard:
      'For time\nSkiErg 1000m\nSled push 50m\nSled pull 50m\nBurpee broad jumps 80m\nRow 1000m\nFarmers carry 200m\nSandbag lunges 100m\n100 wall balls',
    verify: [`Station distances: ${VERIFY_NOTE.toLowerCase()}`],
  },
  {
    id: 'race_training.half-distance',
    name: 'Half-distance sim',
    label: 'Half-distance race sim',
    category: 'race_sim',
    summary: '500 m runs and every station at half distance',
    scoring: 'time',
    workout: workout({
      format: 'hyrox',
      segments: [
        run(500),
        station('SkiErg', 500),
        run(500),
        station('Sled Push', 25),
        run(500),
        station('Sled Pull', 25),
        run(500),
        station('Burpee Broad Jump', 40),
        run(500),
        station('Rowing', 500),
        run(500),
        station('Farmers Carry', 100),
        run(500),
        station('Sandbag Lunges', 50),
        run(500),
        station('Wall Balls', null, 50),
      ],
    }),
    whiteboard:
      'Hyrox half-distance sim\n500m run\nSkiErg 500m\n500m run\nSled push 25m\n500m run\nSled pull 25m\n500m run\nBurpee broad jumps 40m\n500m run\nRow 500m\n500m run\nFarmers carry 100m\n500m run\nSandbag lunges 50m\n500m run\n50 wall balls',
    verify: [],
  },
  {
    id: 'race_training.transitions',
    name: 'Transition practice',
    label: 'Run-off-the-station practice',
    category: 'race_sim',
    summary: 'Four stations, each straight into a 400 m run',
    scoring: 'time',
    workout: workout({
      format: 'for_time',
      segments: [
        station('SkiErg', 500),
        run(400),
        station('Sled Push', 25),
        run(400),
        station('Rowing', 500),
        run(400),
        station('Wall Balls', null, 30),
        run(400),
      ],
    }),
    whiteboard:
      'For time\nSkiErg 500m\n400m run\nSled push 25m\n400m run\nRow 500m\n400m run\n30 wall balls\n400m run',
    verify: [],
  },
  {
    id: 'race_training.race-week',
    name: 'Race-week opener',
    label: 'Race-week opener',
    category: 'race_sim',
    summary: 'Short runs and light station work to stay sharp',
    scoring: 'none',
    workout: workout({
      format: 'unknown',
      segments: [
        run(400),
        station('SkiErg', 250),
        run(400),
        station('Sled Push', 15),
        run(400),
        station('Rowing', 250),
        run(400),
        station('Wall Balls', null, 20),
      ],
    }),
    whiteboard:
      'Race week opener\n400m run\nSkiErg 250m\n400m run\nSled push 15m\n400m run\nRow 250m\n400m run\n20 wall balls',
    verify: [],
  },
];
