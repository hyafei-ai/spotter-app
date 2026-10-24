import { BLOCK_GROUPS } from './blocks';
import type { TemplateCategory } from './templates/types';

/**
 * The coach's training styles (docs/ux/multisport.md section 6), chosen once and skippable. They change order and
 * wording only: nothing is ever hidden, so a strength coach who takes on a runner still has every block and template.
 */
export const TRAINER_STYLES = ['strength', 'hybrid', 'functional', 'endurance', 'general'] as const;
export type TrainerStyle = (typeof TRAINER_STYLES)[number];

export const TRAINER_STYLE_LABEL: Record<TrainerStyle, string> = {
  strength: 'Strength',
  hybrid: 'Hybrid and race-format',
  functional: 'Functional fitness (WODs)',
  endurance: 'Endurance',
  general: 'General fitness',
};

export const TRAINER_STYLE_EXAMPLE: Record<TrainerStyle, string> = {
  strength: '5 × 5 squats, progression, estimated max',
  hybrid: 'Runs and stations, race simulations',
  functional: 'AMRAPs, EMOMs, benchmarks like Fran',
  endurance: 'Intervals, paces, heart-rate zones',
  general: 'Mixed sessions, consistency, feeling better',
};

type GroupId = (typeof BLOCK_GROUPS)[number]['id'];
const GROUPS_FOR: Record<TrainerStyle, GroupId[]> = {
  strength: ['strength'],
  hybrid: ['race', 'endurance', 'strength'],
  functional: ['functional', 'strength'],
  endurance: ['endurance'],
  general: ['strength', 'functional'],
};
const TEMPLATES_FOR: Record<TrainerStyle, TemplateCategory[]> = {
  strength: ['benchmark'],
  hybrid: ['race_sim', 'running'],
  functional: ['benchmark', 'conditioning'],
  endurance: ['running'],
  general: ['conditioning'],
};

export type ProgressLead = 'lifts' | 'scores' | 'paces' | 'consistency';

export interface StyleProfile {
  styles: TrainerStyle[];
  /** Block picker groups, the coach's first. */
  groupOrder: GroupId[];
  /** Template categories, the coach's first. */
  templateOrder: TemplateCategory[];
  /** What a session is called in the coach's builder: "WOD", "Session". */
  sessionWord: string;
  /** Which results lead on the client page and in the client's Progress. */
  progressLead: ProgressLead;
}

const ALL_TEMPLATES: TemplateCategory[] = ['benchmark', 'race_sim', 'running', 'conditioning', 'skill', 'assessment'];

/** The profile for the chosen styles; no choice (skipped) means all five in the default order. */
export function styleProfile(chosen: readonly TrainerStyle[] | null | undefined): StyleProfile {
  const skipped = !chosen?.length;
  const styles = skipped ? [...TRAINER_STYLES] : TRAINER_STYLES.filter((s) => chosen.includes(s));
  // Each chosen style's main group first, then their other groups, then everything else.
  const firstGroups = skipped ? [] : [...new Set([...styles.map((s) => GROUPS_FOR[s][0]!), ...styles.flatMap((s) => GROUPS_FOR[s])])];
  const groupOrder = [...firstGroups, ...BLOCK_GROUPS.map((g) => g.id).filter((g) => !firstGroups.includes(g))];
  const firstTemplates = [...new Set([...styles.map((s) => TEMPLATES_FOR[s][0]!), ...styles.flatMap((s) => TEMPLATES_FOR[s])])];
  const templateOrder = [...firstTemplates, ...ALL_TEMPLATES.filter((c) => !firstTemplates.includes(c))];
  const only = styles.length === 1 ? styles[0] : null;
  return {
    styles,
    groupOrder,
    templateOrder,
    sessionWord: only === 'functional' ? 'WOD' : 'Session',
    progressLead: only === 'functional' || only === 'hybrid' ? 'scores' : only === 'endurance' ? 'paces' : only === 'general' ? 'consistency' : 'lifts',
  };
}
