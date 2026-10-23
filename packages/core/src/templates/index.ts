import { BENCHMARKS, SESSIONS } from './benchmarks';
import { PFT_TEMPLATE, RACE_TRAINING, allSimTemplates, simAsWorkout } from './raceSims';
import type { TemplateWorkout } from './types';

export {
  VERIFY_NOTE,
  toVerify,
  type TemplateCategory,
  type TemplateScoring,
  type TemplateWorkout,
  type Verify,
} from './types';
export * from './benchmarks';
export * from './raceSims';

/** Every ready-made workout: benchmarks, generic sessions, race training, the PFT and every race-sim combination. */
export function allTemplates(): TemplateWorkout[] {
  return [
    ...BENCHMARKS,
    ...SESSIONS,
    ...RACE_TRAINING,
    PFT_TEMPLATE,
    ...allSimTemplates().map(simAsWorkout),
  ];
}

export function templateById(id: string): TemplateWorkout | null {
  return allTemplates().find((t) => t.id === id) ?? null;
}
