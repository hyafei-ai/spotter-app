import type { ImportedActivity, ImportedWorkout } from './physiology';

/**
 * Mobility (docs/features/patterns.md): stretching, yoga, pilates and the coach's mobility routines,
 * logged in a tap ("Did mobility") or read from the health app. Mobility is training data: it's shared
 * with the coach like sessions, and feeds the personal pattern "soreness in weeks with 2+ mobility
 * sessions". It never adds to training load.
 */

export const MOBILITY_KINDS = ['routine', 'yoga', 'stretching', 'pilates', 'other'] as const;
export type MobilityKind = (typeof MOBILITY_KINDS)[number];
export const MOBILITY_KIND_LABEL: Record<MobilityKind, string> = {
  routine: 'Coach’s routine',
  yoga: 'Yoga',
  stretching: 'Stretching',
  pilates: 'Pilates',
  other: 'Other',
};

export interface MobilitySession {
  id: string;
  date: string;
  minutes: number;
  kind: MobilityKind;
  source: 'spotter' | 'imported';
  /** The coach's routine it followed, when logged from one. */
  routineId: string | null;
}

/** Imported activities that count as mobility rather than training. */
export const MOBILITY_ACTIVITIES: Partial<Record<ImportedActivity, MobilityKind>> = {
  yoga: 'yoga',
  pilates: 'pilates',
  flexibility: 'stretching',
  mind_and_body: 'other',
};

export const isMobilityActivity = (a: ImportedActivity) => a in MOBILITY_ACTIVITIES;

/** A health-app workout as a mobility session, or null when it's training (runs, rides, strength…). */
export function mobilityFromImported(w: Pick<ImportedWorkout, 'id' | 'date' | 'durationMin' | 'activity'>): MobilitySession | null {
  const kind = MOBILITY_ACTIVITIES[w.activity];
  if (!kind) return null;
  return { id: `imported:${w.id}`, date: w.date, minutes: Math.max(0, Math.round(w.durationMin)), kind, source: 'imported', routineId: null };
}

/**
 * Logged and imported mobility together. A Spotter log and an imported session of the same kind on the same
 * day are taken as the same session (the athlete tapped "Did mobility" after a yoga class the watch also
 * recorded); the Spotter log wins.
 */
export function mergeMobility(logged: MobilitySession[], imported: ImportedWorkout[]): MobilitySession[] {
  const out = [...logged];
  for (const w of imported) {
    const m = mobilityFromImported(w);
    if (!m) continue;
    if (logged.some((l) => l.date === m.date && l.kind === m.kind)) continue;
    out.push(m);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** A coach-assignable routine. Items are timed (seconds) or counted (reps). */
export interface MobilityRoutine {
  id: string;
  title: string;
  items: { name: string; seconds: number | null; reps: number | null }[];
}

export const routineMinutes = (r: MobilityRoutine) =>
  Math.max(1, Math.round(r.items.reduce((n, i) => n + (i.seconds ?? (i.reps ?? 0) * 4), 0) / 60));

/*
 * MOCK starter routines: example content a coach can copy and edit. Not prescriptions, and not based on any
 * study; the coach decides what each client does.
 */
export const STARTER_MOBILITY_ROUTINES: MobilityRoutine[] = [
  {
    id: 'mock-hips-ankles',
    title: 'Hips and ankles (MOCK)',
    items: [
      { name: '90/90 hip switches', seconds: null, reps: 10 },
      { name: 'Half-kneeling hip flexor stretch, each side', seconds: 45, reps: null },
      { name: 'Knee-to-wall ankle rocks, each side', seconds: null, reps: 12 },
      { name: 'Deep squat hold', seconds: 60, reps: null },
    ],
  },
  {
    id: 'mock-upper-back',
    title: 'Upper back and shoulders (MOCK)',
    items: [
      { name: 'Open books, each side', seconds: null, reps: 8 },
      { name: 'Wall slides', seconds: null, reps: 10 },
      { name: 'Doorway chest stretch', seconds: 45, reps: null },
      { name: 'Cat–cow', seconds: null, reps: 10 },
    ],
  },
  {
    id: 'mock-desk-reset',
    title: 'Ten-minute desk reset (MOCK)',
    items: [
      { name: 'Neck side stretch, each side', seconds: 30, reps: null },
      { name: 'Standing hamstring stretch', seconds: 60, reps: null },
      { name: 'World’s greatest stretch, each side', seconds: null, reps: 5 },
      { name: 'Child’s pose', seconds: 60, reps: null },
      { name: 'Glute bridge', seconds: null, reps: 15 },
    ],
  },
];

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);

/** Mobility in the 7 days ending today: sessions and minutes. */
export function mobilityWeek(sessions: MobilitySession[], today: string): { sessions: number; minutes: number } {
  const t = dayNum(today);
  const week = sessions.filter((s) => t - dayNum(s.date) >= 0 && t - dayNum(s.date) < 7);
  return { sessions: week.length, minutes: week.reduce((n, s) => n + s.minutes, 0) };
}
