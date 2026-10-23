import type { BodyRegion, ImportedActivity, PainLog } from './physiology';

/**
 * Injury load (docs/features/brief.md): where training load lands on the body, how monotonous the
 * week was, and pain the athlete logged. Rule-based and explainable. Never a diagnosis: the copy
 * says what was logged and what to do, and points to the coach.
 */

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);

export const BODY_REGION_LABEL: Record<BodyRegion, string> = {
  neck: 'Neck',
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  wrist: 'Wrist',
  upper_back: 'Upper back',
  lower_back: 'Lower back',
  hip: 'Hip',
  knee: 'Knee',
  ankle: 'Ankle',
  foot: 'Foot',
  other: 'Other',
};

/** Lowercase region words for sentences: "the knee pain", "back pain". */
export const regionWord = (r: BodyRegion) => (r === 'lower_back' ? 'back' : r === 'upper_back' ? 'upper back' : r === 'other' ? 'pain spot' : r);

/**
 * Regions each library exercise mostly loads (packages/core/src/library.ts ids). A small table on
 * purpose: unknown and custom exercises load no region, so the region view under-counts rather than
 * guesses.
 */
export const EXERCISE_REGIONS: Record<string, BodyRegion[]> = {
  'back-squat': ['knee', 'hip', 'lower_back'],
  'front-squat': ['knee', 'hip', 'upper_back'],
  'safety-bar-squat': ['knee', 'hip', 'lower_back'],
  'goblet-squat': ['knee', 'hip'],
  'bulgarian-split-squat': ['knee', 'hip'],
  'walking-lunge': ['knee', 'hip', 'ankle'],
  'leg-press': ['knee', 'hip'],
  deadlift: ['lower_back', 'hip'],
  'romanian-deadlift': ['lower_back', 'hip'],
  'db-rdl': ['lower_back', 'hip'],
  'hip-thrust': ['hip'],
  'leg-curl': ['knee'],
  'calf-raise': ['ankle', 'foot'],
  'bench-press': ['shoulder', 'elbow'],
  'incline-db-press': ['shoulder', 'elbow'],
  'overhead-press': ['shoulder', 'lower_back'],
  'db-shoulder-press': ['shoulder', 'elbow'],
  'push-up': ['shoulder', 'wrist'],
  dip: ['shoulder', 'elbow'],
  'triceps-pushdown': ['elbow'],
  'lateral-raise': ['shoulder'],
  'pull-up': ['shoulder', 'elbow', 'upper_back'],
  'chin-up': ['shoulder', 'elbow', 'upper_back'],
  'lat-pulldown': ['shoulder', 'upper_back'],
  'barbell-row': ['upper_back', 'lower_back'],
  'db-row': ['upper_back'],
  'seated-cable-row': ['upper_back'],
  'face-pull': ['shoulder', 'upper_back'],
  'biceps-curl': ['elbow'],
  plank: ['lower_back'],
  'side-plank': ['lower_back'],
  'dead-bug': ['lower_back'],
  'hanging-knee-raise': ['hip', 'shoulder'],
  'pallof-press': ['lower_back'],
  'farmer-carry': ['wrist', 'upper_back'],
  'suitcase-carry': ['wrist', 'lower_back'],
  'sled-push': ['knee', 'ankle'],
  rower: ['lower_back', 'knee'],
  'bike-intervals': ['knee', 'hip'],
  'kettlebell-swing': ['lower_back', 'hip'],
};

/** Regions loaded by workouts imported from the health app (running lands on knees, ankles, feet, hips). */
export const ACTIVITY_REGIONS: Record<ImportedActivity, BodyRegion[]> = {
  run: ['knee', 'ankle', 'foot', 'hip'],
  walk: ['ankle', 'foot'],
  hike: ['knee', 'ankle', 'foot', 'hip'],
  ride: ['knee', 'hip'],
  swim: ['shoulder'],
  row: ['lower_back', 'knee'],
  strength: [],
  hiit: ['knee', 'ankle'],
  yoga: [],
  pilates: [],
  dance: ['knee', 'ankle', 'foot'],
  class: [],
  other: [],
};

/** Exercise id used for a health-app workout in region load: `activity:run`. */
export const activityExerciseId = (a: ImportedActivity) => `activity:${a}`;

export function regionsFor(exerciseId: string): BodyRegion[] {
  if (exerciseId.startsWith('activity:')) return ACTIVITY_REGIONS[exerciseId.slice(9) as ImportedActivity] ?? [];
  return EXERCISE_REGIONS[exerciseId] ?? [];
}

/** A finished session (or imported workout) with its load and the exercises it contained, one entry per set. */
export interface InjurySession {
  date: string;
  load: number;
  sets: { exerciseId: string }[];
}

/**
 * Splits a session's load across body regions by share of sets. A set that loads two regions counts
 * fully toward each (region loads are compared with themselves over time, not summed).
 */
export function regionLoadsForSession(s: InjurySession): Partial<Record<BodyRegion, number>> {
  const out: Partial<Record<BodyRegion, number>> = {};
  if (!s.sets.length || s.load <= 0) return out;
  const per = s.load / s.sets.length;
  for (const set of s.sets) for (const r of regionsFor(set.exerciseId)) out[r] = (out[r] ?? 0) + per;
  return out;
}

export interface RegionLoad {
  region: BodyRegion;
  /** Last 7 days. */
  acute: number;
  /** Average week over the last 28 days. */
  chronicWeekly: number;
  ratio: number | null;
  /** 7-day load ≥ 1.5× the region's usual week. */
  spike: boolean;
}

export const REGION_SPIKE_RATIO = 1.5;

/** Per-region 7-day vs 28-day load, like signals.ts loadTrend. Needs 21 days of history to say anything. */
export function regionLoads(sessions: InjurySession[], today: string): RegionLoad[] {
  const t = dayNum(today);
  const past = sessions.filter((s) => dayNum(s.date) <= t && t - dayNum(s.date) < 28);
  const all = sessions.filter((s) => dayNum(s.date) <= t);
  if (!all.length) return [];
  const enough = t - Math.min(...all.map((s) => dayNum(s.date))) >= 21;
  const acute = new Map<BodyRegion, number>();
  const chronic = new Map<BodyRegion, number>();
  for (const s of past) {
    const loads = regionLoadsForSession(s);
    for (const [r, v] of Object.entries(loads) as [BodyRegion, number][]) {
      chronic.set(r, (chronic.get(r) ?? 0) + v);
      if (t - dayNum(s.date) < 7) acute.set(r, (acute.get(r) ?? 0) + v);
    }
  }
  return [...chronic.keys()].map((region) => {
    const a = Math.round(acute.get(region) ?? 0);
    const c = (chronic.get(region) ?? 0) / 4;
    const ratio = enough && c > 0 ? Math.round((a / c) * 100) / 100 : null;
    return { region, acute: a, chronicWeekly: Math.round(c), ratio, spike: ratio != null && ratio >= REGION_SPIKE_RATIO };
  });
}

export interface MonotonyStrain {
  weeklyLoad: number;
  /** Mean daily load ÷ SD of daily load over the last 7 days (rest days count as 0). Null with no training. */
  monotony: number | null;
  /** Weekly load × monotony. */
  strain: number | null;
  /** Monotony over 2.0: hard days with too little variation between them. */
  high: boolean;
}

export const MONOTONY_HIGH = 2.0;
/** Seven identical non-zero days have SD 0; report monotony as this cap instead of infinity. */
const MONOTONY_CAP = 10;

/** Foster's training monotony and strain for the 7 days ending today. */
export function monotonyStrain(sessions: { date: string; load: number }[], today: string): MonotonyStrain {
  const t = dayNum(today);
  const daily = Array.from({ length: 7 }, () => 0);
  for (const s of sessions) {
    const ago = t - dayNum(s.date);
    if (ago >= 0 && ago < 7) daily[ago]! += s.load;
  }
  const weeklyLoad = daily.reduce((a, b) => a + b, 0);
  if (weeklyLoad === 0) return { weeklyLoad: 0, monotony: null, strain: null, high: false };
  const mean = weeklyLoad / 7;
  const sd = Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / 7);
  const monotony = sd === 0 ? MONOTONY_CAP : Math.min(MONOTONY_CAP, Math.round((mean / sd) * 100) / 100);
  return { weeklyLoad, monotony, strain: Math.round(weeklyLoad * monotony), high: monotony > MONOTONY_HIGH };
}

/* ---------- pain ---------- */

export interface OngoingPain {
  region: BodyRegion;
  side: PainLog['side'];
  /** Distinct days with pain above 0 in the last 14. */
  days: number;
  maxLevel: number;
  latestLevel: number;
  latestDate: string;
  /** Consecutive days with pain, ending on the latest log. */
  streak: number;
}

export const PAIN_WINDOW_DAYS = 14;
export const PAIN_DAYS_ONGOING = 3;
export const PAIN_LEVEL_ONGOING = 6;

/** Pain is "ongoing" in a region when it's logged on 3+ of the last 14 days, or at 6/10 or more. */
export function ongoingPain(logs: PainLog[], today: string): OngoingPain[] {
  const t = dayNum(today);
  const recent = logs.filter((l) => l.level > 0 && t - dayNum(l.date) >= 0 && t - dayNum(l.date) < PAIN_WINDOW_DAYS);
  const byRegion = new Map<BodyRegion, PainLog[]>();
  for (const l of recent) byRegion.set(l.region, [...(byRegion.get(l.region) ?? []), l]);
  const out: OngoingPain[] = [];
  for (const [region, list] of byRegion) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const dates = [...new Set(sorted.map((l) => l.date))];
    const latest = sorted[sorted.length - 1]!;
    const maxLevel = Math.max(...sorted.map((l) => l.level));
    if (dates.length < PAIN_DAYS_ONGOING && maxLevel < PAIN_LEVEL_ONGOING) continue;
    let streak = 1;
    for (let i = dates.length - 1; i > 0 && dayNum(dates[i]!) - dayNum(dates[i - 1]!) === 1; i--) streak++;
    out.push({ region, side: latest.side, days: dates.length, maxLevel, latestLevel: latest.level, latestDate: latest.date, streak });
  }
  return out.sort((a, b) => b.latestLevel - a.latestLevel || b.days - a.days);
}

/** Plain words for an ongoing pain: "Knee pain logged 3 of the last 14 days (4/10 most recently)". */
export function painText(p: OngoingPain): string {
  const name = p.side && p.side !== 'both' ? `${p.side === 'left' ? 'Left' : 'Right'} ${regionWord(p.region)}` : BODY_REGION_LABEL[p.region];
  return p.days >= PAIN_DAYS_ONGOING
    ? `${name} pain logged ${p.days} of the last ${PAIN_WINDOW_DAYS} days (${p.latestLevel}/10 most recently)`
    : `${name} pain at ${p.maxLevel}/10`;
}

/**
 * Conservative return-to-training copy. Not a diagnosis and not a rehab plan: it keeps training
 * pain-free, hands decisions to the coach, and points to a professional when pain is high.
 */
export function returnGuidance(region: BodyRegion, painLevel: number, coach: string): string[] {
  const word = regionWord(region);
  const out = [`Keep it pain-free: if it hurts above 3/10 during a set, stop that exercise and tell ${coach}.`];
  if (painLevel >= 7) {
    out.unshift(`That’s a lot of pain. Skip anything that loads the ${word} today, and if it doesn’t ease in a few days, see a doctor or physio.`);
  } else if (painLevel >= 4) {
    out.push(`Go lighter on exercises that load the ${word}, or swap them for ones that don’t hurt. ${coach} can suggest swaps.`);
  } else {
    out.push(`Mild is fine to train around. Note how it feels the morning after.`);
  }
  out.push(`If it’s getting worse, or you notice swelling, numbness or pain at night, get it checked by a doctor or physio.`);
  return out;
}
