/**
 * The neutral structure the paste parser produces (docs/ports.md row 2, docs/features/multisport-core.md).
 * It is deliberately flat and unopinionated: the block workout model (row 1) maps from it later, so nothing here
 * decides how a session is scored or timed on the watch.
 */

export const WORKOUT_FORMATS = [
  'hyrox',
  'amrap',
  'for_time',
  'rounds_for_time',
  'emom',
  'tabata',
  'strength',
  'intervals',
  'unknown',
] as const;
export type WorkoutFormat = (typeof WORKOUT_FORMATS)[number];

/** Plain names for each format, for the coach's "Read as: …" line. */
export const WORKOUT_FORMAT_LABEL: Record<WorkoutFormat, string> = {
  hyrox: 'Race simulation',
  amrap: 'AMRAP',
  for_time: 'For time',
  rounds_for_time: 'Rounds for time',
  emom: 'EMOM',
  tabata: 'Tabata',
  strength: 'Strength',
  intervals: 'Intervals',
  unknown: 'Not sure',
};

export interface ParsedSegment {
  /** "work" for a movement, "rest" for programmed rest. */
  kind: 'work' | 'rest';
  /** As written, cleaned of numbers and units: "Thrusters", "Run", "Rest". */
  movement: string;
  /** The library exercise this matches exactly (library.ts findLibraryExercise), or null for anything else. */
  movementId: string | null;
  reps: number | null;
  /** The second number of a pair like "15/12" (whiteboards usually list the heavier standard first). */
  repsAlt: number | null;
  /** Sets or repeats of this line: "5x5" gives 5, "400m x8" gives 8. */
  sets: number | null;
  /** The rep scheme this movement follows ("21-15-9" gives [21, 15, 9]), or null. */
  repScheme: number[] | null;
  loadKg: number | null;
  /** Second load of a pair like "135/95". */
  loadKgAlt: number | null;
  /** The load was written in pounds (lb, lbs, #) and converted. */
  loadFromLb: boolean;
  /** No unit was written ("95/65"); the parser used the default unit and said so in the warnings. */
  loadUnitAssumed: boolean;
  /** "@ 80%" or "85% 1RM". */
  percent1rm: number | null;
  calories: number | null;
  caloriesAlt: number | null;
  distanceM: number | null;
  durationSec: number | null;
  /** Anything else on the line worth keeping: "max", "odd minutes", "box 24/20 in", "@ 5k pace". */
  note: string | null;
  /** The line it came from. */
  raw: string;
}

export interface ParsedWorkout {
  format: WorkoutFormat;
  /** 0–1: how sure the format guess is. 0 when nothing matched. */
  confidence: number;
  /** AMRAP length, EMOM length or a written time cap. */
  timeCapSec: number | null;
  rounds: number | null;
  /** A shared rep scheme like 21-15-9, when one applies to the movements below it. */
  repScheme: number[] | null;
  /** EMOM window: 60 for EMOM, 120 for E2MOM or "every 2:00". */
  intervalSec: number | null;
  /** Work and rest for tabata or "40 on / 20 off". */
  workSec: number | null;
  restSec: number | null;
  /** A per-station cap like "4 min per station". */
  stationCapSec: number | null;
  /** A name line the parser didn't treat as a movement ("Fran", "Tuesday conditioning"), or null. */
  title: string | null;
  /** Scaling levels found in the paste (RX, Scaled, Level 2…). The segments are from `levelUsed`. */
  levels: string[];
  levelUsed: string | null;
  segments: ParsedSegment[];
  /** Score, goal and coach-note lines kept as written ("Score: total time", "Goal: unbroken wall balls"). */
  notes: string[];
  /** Plain sentences for the coach about anything assumed or not understood. */
  warnings: string[];
}

export interface ParseOptions {
  /** Unit for loads written without one ("95/65"). Whiteboards in pounds are the common case. */
  defaultLoadUnit?: 'kg' | 'lb';
  /** Which scaling level to read when several are pasted: its index or name. Default: the first. */
  level?: number | string;
}
