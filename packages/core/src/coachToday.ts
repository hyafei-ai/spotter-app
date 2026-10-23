import { CYCLE_PHASE_LABEL, SHORT_SLEEP_HOURS } from './signals';
import { RESTING_HR_HIGH_BPM } from './wearables';
import {
  mainMuscleGroup,
  rosterCell,
  UNDER_FUELLED_SHARE,
  type ClientDay,
  type MuscleGroup,
  type RosterFlag,
} from './timeline';
import type { PatternConfidence } from './patterns';
import type { MastersWin, MastersWinKind } from './masters';
import type { BodyRegion, FuelLevel } from './physiology';

/**
 * The coach's Today (docs/ux/coach-experience.md, docs/ux/first-value.md): display helpers that turn a
 * client's day, today's planned session and what they shared into one plain line and one action. Pure and
 * deterministic, so the same inputs read the same on every screen. Nothing new is inferred: strain signals
 * use the same thresholds as the daily read and the roster cell (signals.ts, wearables.ts, timeline.ts).
 */

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmtH = (h: number) => (Number.isInteger(r1(h)) ? String(r1(h)) : r1(h).toFixed(1));

/** "a", "a and b", "a, b and c". */
export function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/* ---------- today's planned session ---------- */

/** The shape Today needs from a program day (ProgramDay and SessionPlan both fit). */
export interface PlannedDay {
  title: string;
  exercises: { exerciseId: string; sets: unknown[] }[];
}

/**
 * A planned day counts as heavy at this many working sets or more. A product choice for "worth easing", not a
 * physiology threshold: the demo's Lower A has 14 sets, an easy recovery day under 10.
 */
export const HEAVY_DAY_SETS = 12;

/** Body regions a main muscle group loads, for "ongoing knee pain + a leg day". Generous on purpose: it asks, never forbids. */
export const REGIONS_LOADED: Record<MuscleGroup, BodyRegion[]> = {
  legs: ['knee', 'hip', 'ankle'],
  'posterior chain': ['lower_back', 'hip', 'knee'],
  push: ['shoulder', 'elbow', 'wrist'],
  pull: ['shoulder', 'elbow', 'upper_back'],
  core: ['lower_back'],
};

export interface SessionDemand {
  sets: number;
  heavy: boolean;
  groups: MuscleGroup[];
  regions: BodyRegion[];
}

export function sessionDemand(day: PlannedDay): SessionDemand {
  const sets = day.exercises.reduce((n, e) => n + e.sets.length, 0);
  const groups = [
    ...new Set(
      day.exercises.map((e) => mainMuscleGroup(e.exerciseId)).filter((g): g is MuscleGroup => !!g),
    ),
  ];
  const regions = [...new Set(groups.flatMap((g) => REGIONS_LOADED[g]))];
  return { sets, heavy: sets >= HEAVY_DAY_SETS, groups, regions };
}

/* ---------- strain signals in words ---------- */

export type StrainKind = 'short_sleep' | 'low_hrv' | 'high_rhr';
export interface StrainSignal {
  kind: StrainKind;
  /** For the coach: "5.9 h sleep", "HRV 15% under usual". */
  text: string;
  /** For the client: "HRV 15% under your usual". */
  clientText: string;
}

/** Today's recovery signals against the client's own baseline (same thresholds as the daily read and rosterCell). */
export function strainSignals(day: ClientDay | null | undefined): StrainSignal[] {
  if (!day) return [];
  const r = day.recovery;
  const out: StrainSignal[] = [];
  if (r.sleepHours != null && r.sleepHours < SHORT_SLEEP_HOURS) {
    const t = `${fmtH(r.sleepHours)} h sleep`;
    out.push({ kind: 'short_sleep', text: t, clientText: t });
  }
  if (r.hrvLow && r.hrvVsBaseline != null) {
    const pct = Math.round((1 - r.hrvVsBaseline) * 100);
    out.push({
      kind: 'low_hrv',
      text: `HRV ${pct}% under usual`,
      clientText: `HRV ${pct}% under your usual`,
    });
  }
  if (r.rhrVsBaseline != null && r.rhrVsBaseline >= RESTING_HR_HIGH_BPM) {
    const n = Math.round(r.rhrVsBaseline);
    out.push({
      kind: 'high_rhr',
      text: `resting HR ${n} bpm over usual`,
      clientText: `resting HR ${n} bpm over your usual`,
    });
  }
  return out;
}

/* ---------- Act today ---------- */

export type ActKind = 'ease' | 'pain' | 'fuel';
export interface ActItem {
  kind: ActKind;
  /** One plain line with the why: "5.9 h sleep and HRV 15% under usual · Lower A today (14 sets)". */
  line: string;
  /** What the one button does: offer the easier version, or message with a prefilled question. */
  action: 'offer_easier' | 'message';
  /** Prefilled message for the client (the coach edits before sending). */
  draft: string;
  /** Higher first when several clients need acting on. */
  weight: number;
  session: string;
}

export interface ActInput {
  firstName: string;
  /** Today's ClientDay (shared health only; pass null when the viewer doesn't see health). */
  day: ClientDay | null;
  planned: PlannedDay | null;
  /** Ongoing pain the client shared (atrisk PhysiologyDetail.pain shape). */
  pain?: { region: BodyRegion; side: 'left' | 'right' | 'both' | null; days: number } | null;
  fuelLevel?: FuelLevel | null;
  /** The coach's easier-version rule in words (signals.ts describeLighter), for the message. */
  lighterWords?: string;
}

const REGION_WORDS: Record<BodyRegion, string> = {
  neck: 'neck',
  shoulder: 'shoulder',
  elbow: 'elbow',
  wrist: 'wrist',
  upper_back: 'upper back',
  lower_back: 'lower back',
  hip: 'hip',
  knee: 'knee',
  ankle: 'ankle',
  foot: 'foot',
  other: 'sore spot',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * At most one item per client, most pressing first: a strained body on a heavy day (2+ strain signals), then
 * ongoing pain on a day that loads that area, then a fuel flag on a training day ("talk to someone" any
 * training day, "watch" only on a heavy one). No session planned today means nothing to act on.
 */
export function actToday(input: ActInput): ActItem | null {
  const { planned, firstName } = input;
  if (!planned || planned.exercises.length === 0) return null;
  const demand = sessionDemand(planned);
  const session = `${planned.title} today`;
  const signals = strainSignals(input.day);
  if (signals.length >= 2 && demand.heavy) {
    const how =
      input.lighterWords && input.lighterWords !== 'Same session'
        ? `: ${input.lighterWords.toLowerCase()}`
        : '';
    return {
      kind: 'ease',
      line: `${cap(joinWords(signals.map((s) => s.text)))} · ${session} (${demand.sets} sets)`,
      action: 'offer_easier',
      draft: `Morning ${firstName}. ${cap(joinWords(signals.map((s) => s.clientText)))} today, so I've set up an easier version of ${planned.title}${how}. Take it if the warm-up feels flat. Your call.`,
      weight: 100 + signals.length,
      session: planned.title,
    };
  }
  const p = input.pain;
  if (p && p.days >= 3 && demand.regions.includes(p.region)) {
    const where = [p.side === 'left' || p.side === 'right' ? p.side : '', REGION_WORDS[p.region]]
      .filter(Boolean)
      .join(' ');
    return {
      kind: 'pain',
      line: `${cap(where)} pain on ${p.days} of the last 14 days · ${session} loads the ${REGION_WORDS[p.region]}`,
      action: 'message',
      draft: `Hi ${firstName}, how's the ${where} today? ${planned.title} loads it, so tell me what hurts and I'll swap those exercises.`,
      weight: 80 + p.days,
      session: planned.title,
    };
  }
  if (input.fuelLevel === 'talk_to_someone' || (input.fuelLevel === 'watch' && demand.heavy)) {
    return {
      kind: 'fuel',
      line: `${input.fuelLevel === 'talk_to_someone' ? 'Fuel check flagged' : 'Fuel check: one to watch'} · ${session}`,
      action: 'message',
      draft: `Hi ${firstName}, ${planned.title} today. Have you had something to eat in the last couple of hours? Something with carbs before you start will help the session.`,
      weight: input.fuelLevel === 'talk_to_someone' ? 70 : 60,
      session: planned.title,
    };
  }
  return null;
}

/* ---------- messages the coach sends ---------- */

/** Wins that come from the watch (health data): hidden from a coach who doesn't see this client's health. */
export const HEALTH_WIN_KINDS: MastersWinKind[] = [
  'resting_hr',
  'hrv_baseline',
  'sleep_regularity',
];

/** The prefilled "Send to {name}" message for a win (MastersWin.text is already written to the client). */
export function winMessage(firstName: string, win: Pick<MastersWin, 'text'>): string {
  return `${firstName}, worth knowing: ${win.text}. That's the work adding up.`;
}

/** The prefilled check-in message: a greeting and the question to ask. */
export function checkInMessage(firstName: string, question: string | null): string {
  return question
    ? `Hi ${firstName}, ${question.charAt(0).toLowerCase()}${question.slice(1)}`
    : `Hi ${firstName}, how's this week going?`;
}

/* ---------- patterns in words ---------- */

/** Confidence in words for the coach (patterns.ts: high z ≥ 2, medium z ≥ 1.5). */
export const PATTERN_CONFIDENCE_WORDS: Record<PatternConfidence, string> = {
  high: 'Clear in their data',
  medium: 'Showing up, worth watching',
  low: 'Too early to say',
};

/** Weeks of history that hold any data (a session, sleep, HRV, a check or food). */
export function historyWeeks(days: ClientDay[]): number {
  const first = days.findIndex(hasAnything);
  return first < 0 ? 0 : Math.floor((days.length - first) / 7);
}

function hasAnything(d: ClientDay): boolean {
  const r = d.recovery;
  return (
    d.training.sessions.length > 0 ||
    r.sleepHours != null ||
    r.hrvMs != null ||
    r.restingHr != null ||
    d.check != null ||
    d.nutrition.kcal != null
  );
}

/* ---------- timeline in words ---------- */

/** The client's usual night, the median of the nights in view (their own baseline, never a population number). */
export function usualSleep(days: ClientDay[]): number | null {
  const xs = days
    .map((d) => d.recovery.sleepHours)
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b);
  if (xs.length < 7) return null;
  const m = Math.floor(xs.length / 2);
  return r1(xs.length % 2 ? xs[m]! : (xs[m - 1]! + xs[m]!) / 2);
}

export interface LaneSummaries {
  training: string;
  sleep: string | null;
  hrv: string | null;
  mobility: string | null;
  food: string | null;
  pain: string | null;
  cycle: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One short line per lane, also the timeline's text alternative. Null when the lane has no data. */
export function laneSummaries(days: ClientDay[]): LaneSummaries {
  const sessions = days.flatMap((d) => d.training.sessions);
  const imported = sessions.filter((s) => s.source === 'imported').length;
  const sleeps = days.filter((d) => d.recovery.sleepHours != null);
  const usual = usualSleep(days);
  const short = sleeps.filter((d) => d.recovery.sleepHours! < SHORT_SLEEP_HOURS).length;
  const hrvDays = days.filter((d) => d.recovery.hrvLow != null);
  const lowHrv = hrvDays.filter((d) => d.recovery.hrvLow).length;
  const mob = days.reduce((n, d) => n + d.mobility.sessions, 0);
  const food = days.filter((d) => d.nutrition.kcal != null);
  const under = food.filter(
    (d) => d.nutrition.vsTarget != null && d.nutrition.vsTarget < UNDER_FUELLED_SHARE,
  ).length;
  const pain = days.filter((d) => d.pain.length > 0).length;
  const cycle = days.some((d) => d.cycle != null);
  return {
    training: sessions.length
      ? `${plural(sessions.length, 'session')}${imported ? `, ${imported} from other apps` : ''}`
      : 'No sessions',
    sleep: sleeps.length
      ? `usual ${usual != null ? `${fmtH(usual)} h` : 'not known yet'} · ${plural(short, 'short night')}`
      : null,
    hrv: hrvDays.length ? `${plural(lowHrv, 'day')} well under usual` : null,
    mobility: mob ? plural(mob, 'session') : null,
    food: food.length
      ? `logged ${food.length} of ${days.length} days${under ? ` · ${under} under 75% of target` : ''}`
      : null,
    pain: pain ? `logged on ${plural(pain, 'day')}` : null,
    cycle: cycle ? 'shared by the client' : null,
  };
}

/** The details for one tapped day, one plain line each. */
export function dayDetail(day: ClientDay): string[] {
  const out: string[] = [];
  for (const s of day.training.sessions) {
    const bits = [s.title, `${s.minutes} min`];
    if (s.rpe != null) bits.push(`effort ${s.rpe}/10`);
    if (s.deltaPct != null && Math.abs(s.deltaPct) >= 1)
      bits.push(
        `lifts ${Math.abs(Math.round(s.deltaPct))}% ${s.deltaPct > 0 ? 'over' : 'under'} their usual`,
      );
    if (s.source === 'imported') bits.push('imported');
    out.push(bits.join(' · '));
  }
  if (!day.training.sessions.length) out.push('No training logged');
  const r = day.recovery;
  if (r.sleepHours != null)
    out.push(`Sleep ${fmtH(r.sleepHours)} h${r.sleepHours < SHORT_SLEEP_HOURS ? ' (short)' : ''}`);
  if (r.hrvMs != null) {
    const pct = r.hrvVsBaseline != null ? Math.round((r.hrvVsBaseline - 1) * 100) : null;
    out.push(
      `HRV ${Math.round(r.hrvMs)} ms${pct != null && pct !== 0 ? ` (${Math.abs(pct)}% ${pct < 0 ? 'under' : 'over'} usual${r.hrvLow ? ', well under' : ''})` : ''}`,
    );
  }
  if (r.restingHr != null) {
    const d = r.rhrVsBaseline != null ? Math.round(r.rhrVsBaseline) : 0;
    out.push(
      `Resting HR ${Math.round(r.restingHr)} bpm${d ? ` (${Math.abs(d)} ${d > 0 ? 'over' : 'under'} usual)` : ''}`,
    );
  }
  if (day.mobility.sessions) out.push(`Mobility ${day.mobility.minutes} min`);
  if (day.nutrition.kcal != null) {
    const pct =
      day.nutrition.vsTarget != null
        ? ` (${Math.round(day.nutrition.vsTarget * 100)}% of target)`
        : '';
    out.push(
      `Food ${day.nutrition.kcal.toLocaleString('en-US')} kcal${pct}${day.nutrition.source ? ` · ${day.nutrition.source}` : ''}`,
    );
  }
  if (day.cycle?.phase)
    out.push(
      `Cycle: ${day.cycle.phase === 'menstrual' ? 'period' : `${CYCLE_PHASE_LABEL[day.cycle.phase].toLowerCase()} phase`}${day.cycle.day ? `, day ${day.cycle.day}` : ''} (estimate)`,
    );
  for (const p of day.pain) out.push(`Pain: ${REGION_WORDS[p.region]} ${p.level}/10`);
  const c = day.check;
  if (c && (c.energy != null || c.soreness != null || c.stress != null)) {
    const bits = [
      c.energy != null ? `energy ${c.energy}` : null,
      c.soreness != null ? `soreness ${c.soreness}` : null,
      c.stress != null ? `stress ${c.stress}` : null,
    ].filter(Boolean);
    out.push(`Daily check: ${bits.join(', ')} (of 5)`);
  }
  return out;
}

/* ---------- connected: the first insight ---------- */

export interface ConnectedSummary {
  weeks: number;
  workouts: number;
  nights: number;
  hrvDays: number;
  foodDays: number;
  /** "16 weeks: 52 workouts, 112 nights of sleep, HRV on 112 days and food on 98 days". */
  text: string;
}

/** What a newly connected client's history holds, in words. Counts only what's there; never promises more. */
export function connectedSummary(days: ClientDay[]): ConnectedSummary {
  const weeks = historyWeeks(days);
  const workouts = days.reduce((n, d) => n + d.training.sessions.length, 0);
  const nights = days.filter((d) => d.recovery.sleepHours != null).length;
  const hrvDays = days.filter((d) => d.recovery.hrvMs != null).length;
  const foodDays = days.filter((d) => d.nutrition.kcal != null).length;
  const parts = [
    workouts ? plural(workouts, 'workout') : null,
    nights ? `${plural(nights, 'night')} of sleep` : null,
    hrvDays ? `HRV on ${plural(hrvDays, 'day')}` : null,
    foodDays ? `food on ${plural(foodDays, 'day')}` : null,
  ].filter((x): x is string => !!x);
  return {
    weeks,
    workouts,
    nights,
    hrvDays,
    foodDays,
    text: `${plural(weeks, 'week')}: ${parts.length ? joinWords(parts) : 'nothing shared yet'}`,
  };
}

/* ---------- the all-clients grid ---------- */

export const ROSTER_FLAG_WORDS: Record<RosterFlag, string> = {
  short_sleep: 'short sleep',
  low_hrv: 'HRV well under usual',
  pain: 'pain logged',
  under_fuelled: 'under-fuelled',
};

/** The grid row's text alternative: "Jordan: trained 6 of 14 days. 2 days to ease off, latest today: short sleep and HRV well under usual." */
export function rosterRowText(firstName: string, days: ClientDay[], today: string): string {
  const cells = days.map((d) => ({ d, c: rosterCell(d) }));
  const trained = cells.filter((x) => x.c.trained).length;
  if (!cells.some((x) => x.c.tone != null || x.c.trained))
    return `${firstName}: nothing shared in the last ${days.length} days.`;
  const ease = cells.filter((x) => x.c.tone === 'ease');
  const watch = cells.filter((x) => x.c.tone === 'watch');
  let tail = 'No strain signals.';
  const latest = ease[ease.length - 1] ?? watch[watch.length - 1];
  if (latest) {
    const when =
      latest.d.date === today
        ? 'today'
        : new Date(`${latest.d.date}T12:00:00Z`).toLocaleDateString('en-US', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          });
    const counts = [
      ease.length ? `${plural(ease.length, 'day')} to ease off` : null,
      watch.length ? `${plural(watch.length, 'day')} to watch` : null,
    ]
      .filter(Boolean)
      .join(', ');
    tail = `${counts}, latest ${when}${latest.c.flags.length ? `: ${joinWords(latest.c.flags.map((f) => ROSTER_FLAG_WORDS[f]))}` : ''}.`;
  }
  return `${firstName}: trained ${trained} of ${days.length} days. ${tail}`;
}
