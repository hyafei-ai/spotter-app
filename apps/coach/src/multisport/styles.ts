import { create } from 'zustand';
import { styleProfile, TRAINER_STYLES, type StyleProfile, type TrainerStyle } from '@spotter/core';
import { tenant } from '../env';

/*
 * The coach's training styles (docs/ux/multisport.md section 6). Asked once on Programs, always in Me → Coaching
 * styles, skippable: skipped means every style in the default order. They change order and wording, never hide.
 * MOCK transport: this device's localStorage (TODO-INTEGRATE a coach_settings row; nothing here is sensitive).
 */
const KEY = `spotter.coach.styles.${tenant.slug}`;

interface Stored {
  styles: TrainerStyle[];
  /** The coach answered or said "Not now": the inline card stays away. */
  answered: boolean;
}

function read(): Stored {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (s) return { styles: (s.styles ?? []).filter((x): x is TrainerStyle => (TRAINER_STYLES as readonly string[]).includes(x)), answered: !!s.answered };
  } catch {
    // private mode: defaults for this visit
  }
  return { styles: [], answered: false };
}

interface StylesState extends Stored {
  set(styles: TrainerStyle[]): void;
  skip(): void;
}

export const useStyles = create<StylesState>((set) => {
  const save = (s: Stored) => {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
    } catch {
      // keep it for this visit
    }
    set(s);
  };
  return {
    ...read(),
    set: (styles) => save({ styles, answered: true }),
    skip: () => save({ styles: read().styles, answered: true }),
  };
});

export function useStyleProfile(): StyleProfile {
  const styles = useStyles((s) => s.styles);
  return styleProfile(styles);
}
