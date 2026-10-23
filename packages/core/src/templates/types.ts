import { STARTER_LIBRARY } from '../library';
import { emptySegment, emptyWorkout } from '../parse/segments';
import type { ParsedSegment, ParsedWorkout } from '../parse/types';

/**
 * Ready-made workouts as data (docs/ports.md row 3), in the same neutral structure the paste parser produces, so
 * the block model (row 1) maps templates and pastes the same way.
 */

/** The note every number marked `verify` carries. */
export const VERIFY_NOTE = 'To verify against the current official standard';

/**
 * A number taken from the source app that hasn't been checked against the current official standard. `value`
 * is null where the source was clearly wrong (a copy-paste duplicate, or two sources disagreeing).
 */
export interface Verify<T = number> {
  value: T | null;
  verify: true;
  note: string;
}

export const toVerify = <T>(value: T | null, note: string = VERIFY_NOTE): Verify<T> => ({
  value,
  verify: true,
  note,
});

export type TemplateCategory =
  'benchmark' | 'race_sim' | 'running' | 'conditioning' | 'skill' | 'assessment';
export type TemplateScoring = 'time' | 'rounds_reps' | 'reps' | 'load' | 'none';

export interface TemplateWorkout {
  /** Stable: "benchmark.fran", "run.400-repeats". */
  id: string;
  /** "Fran". */
  name: string;
  /** "Benchmark: Fran". Plain, no trademark claims. */
  label: string;
  category: TemplateCategory;
  /** One line for the picker. */
  summary: string;
  scoring: TemplateScoring;
  workout: ParsedWorkout;
  /** The same workout as a coach would write it. Tests parse it back and compare with `workout`. */
  whiteboard: string;
  /** Anything about the template that needs checking, in plain words. Empty when nothing does. */
  verify: string[];
}

/** A work segment for a library movement. Throws on an unknown id so a typo fails the tests. */
export function seg(movementId: string, fields: Partial<ParsedSegment> = {}): ParsedSegment {
  const e = STARTER_LIBRARY.find((x) => x.id === movementId);
  if (!e) throw new Error(`Unknown library movement: ${movementId}`);
  return { ...emptySegment(''), movement: e.name, movementId, ...fields };
}

export function restSeg(durationSec: number | null, note: string | null = null): ParsedSegment {
  return { ...emptySegment(''), kind: 'rest', movement: 'Rest', durationSec, note };
}

export function workout(
  fields: Partial<ParsedWorkout> & Pick<ParsedWorkout, 'format' | 'segments'>,
): ParsedWorkout {
  return { ...emptyWorkout(), confidence: 1, ...fields };
}

const LB_PER_KG = 2.2046226218;
/** Pounds to kg at one decimal, for loads published in pounds. */
export const lb = (n: number) => Math.round((n / LB_PER_KG) * 10) / 10;
