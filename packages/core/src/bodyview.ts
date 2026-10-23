import type { CycleEstimate, WearableDay } from './physiology';
import type { CyclePhase } from './signals';
import { WEARABLE_SOURCE_LABEL, hrvStatus, restingHrStatus, type BaselineStatus } from './wearables';
import type { MastersWinKind } from './masters';

/**
 * Display helpers for the client's Body tab and recovery screen (docs/ux/client-experience.md): the small
 * charts' series and the one plain line that goes with each. Plain words first; the numbers are one tap
 * deeper. Everything compares the person with their own history, never a population.
 */

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Prefer the watch-backed sources over typed-in values when a day has more than one. */
const SOURCE_ORDER: WearableDay['source'][] = ['apple_health', 'health_connect', 'manual'];

/** The last `n` days ending on `today`, oldest first, one value per day (null when nothing was recorded). */
export function recentSeries(days: WearableDay[], today: string, n: number, pick: (d: WearableDay) => number | null): (number | null)[] {
  const t = dayNum(today);
  const out: (number | null)[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const date = isoOf(t - k);
    const hit = days
      .filter((d) => d.date === date && pick(d) != null)
      .sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source))[0];
    out.push(hit ? pick(hit) : null);
  }
  return out;
}

/** Where a day's numbers came from, in words ("Apple Watch via Apple Health"). */
export function wearableSourceWords(days: WearableDay[]): string | null {
  const s = days.find((d) => d.source !== 'manual')?.source ?? days[0]?.source;
  return s ? WEARABLE_SOURCE_LABEL[s] : null;
}

export interface SleepRead {
  /** 14 nights, oldest first; the last is last night. */
  nights: (number | null)[];
  /** The person's usual: mean of the 28 nights before last night, once there are 7. */
  usual: number | null;
  last: number | null;
  /** One plain line: "Short night: 5.6 h, about 1.4 h under your usual". */
  line: string;
}

export function sleepRead(days: WearableDay[], today: string): SleepRead {
  const nights = recentSeries(days, today, 14, (d) => d.sleepHours);
  const prior = recentSeries(days, isoOf(dayNum(today) - 1), 28, (d) => d.sleepHours).filter((v): v is number => v != null);
  const usual = prior.length >= 7 ? r1(mean(prior)) : null;
  const last = nights[nights.length - 1] ?? null;
  let line: string;
  if (last == null) line = nights.some((v) => v != null) ? 'No sleep recorded for last night.' : 'No sleep recorded yet.';
  else if (usual == null) line = `${r1(last)} h last night. Your usual shows after a week of nights.`;
  else {
    const diff = r1(last - usual);
    line =
      diff <= -1
        ? `Short night: ${r1(last)} h, about ${Math.abs(diff)} h under your usual.`
        : diff >= 1
          ? `Long night: ${r1(last)} h, about ${diff} h over your usual.`
          : `${r1(last)} h last night, close to your usual.`;
  }
  return { nights, usual, last, line };
}

export interface BaselineRead {
  values: (number | null)[];
  /** The person's usual range (mean ± 1 SD of the prior 28 days, same source), when known. */
  band: [number, number] | null;
  status: BaselineStatus;
  /** Plain words, no numbers: "Under your usual today". */
  plain: string;
  /** The numbers, for one tap deeper: "41 ms today · usual 48 ms (Apple Watch via Apple Health)". */
  numbers: string | null;
}

function bandOf(s: BaselineStatus): [number, number] | null {
  return s.baseline != null && s.sd != null ? [r1(s.baseline - s.sd), r1(s.baseline + s.sd)] : null;
}

export function hrvRead(days: WearableDay[], today: string): BaselineRead {
  const status = hrvStatus(days, today);
  const values = recentSeries(days, today, 14, (d) => d.hrvMs);
  const plain =
    status.status === 'low'
      ? 'Under your usual today: your body may still be recovering.'
      : status.status === 'normal'
        ? 'In your usual range today.'
        : status.today == null
          ? 'No reading for today yet.'
          : 'Your usual range shows after a week of readings.';
  const numbers =
    status.today == null
      ? null
      : `${Math.round(status.today)} ms today${status.baseline != null ? ` · usual ${Math.round(status.baseline)} ms` : ''}${status.source ? ` (${WEARABLE_SOURCE_LABEL[status.source]})` : ''}`;
  return { values, band: bandOf(status), status, plain, numbers };
}

export function restingHrRead(days: WearableDay[], today: string): BaselineRead {
  const status = restingHrStatus(days, today);
  const values = recentSeries(days, today, 14, (d) => d.restingHr);
  const plain =
    status.status === 'high'
      ? `Higher than usual today${status.delta != null ? ` (${Math.round(status.delta)} bpm up)` : ''}.`
      : status.status === 'normal'
        ? 'Close to your usual.'
        : status.today == null
          ? 'No reading for today yet.'
          : 'Your usual shows after a week of readings.';
  const numbers =
    status.today == null
      ? null
      : `${Math.round(status.today)} bpm today${status.baseline != null ? ` · usual ${Math.round(status.baseline)} bpm` : ''}${status.source ? ` (${WEARABLE_SOURCE_LABEL[status.source]})` : ''}`;
  return { values, band: bandOf(status), status, plain, numbers };
}

/** The recovery card's headline, from how many of sleep, HRV and resting HR are off the person's usual. */
export function recoveryHeadline(sleep: SleepRead, hrv: BaselineRead, rhr: BaselineRead): string {
  const known = [sleep.usual != null && sleep.last != null, hrv.status.status !== 'unknown', rhr.status.status !== 'unknown'].filter(Boolean).length;
  if (!known) return sleep.last != null ? 'Getting to know your usual' : 'No recovery data yet';
  const off = [sleep.usual != null && sleep.last != null && sleep.last - sleep.usual <= -1, hrv.status.status === 'low', rhr.status.status === 'high'].filter(Boolean).length;
  return off >= 2 ? 'Recovering less than usual' : off === 1 ? 'Mostly recovered, one thing off' : 'Recovering as usual';
}

/* ---------- cycle ring ---------- */

export interface CycleRingSegment {
  phase: CyclePhase;
  from: number;
  to: number;
}

/**
 * Phase spans for drawing a cycle ring, using the same counting as estimateCycle: the luteal half is the 13
 * days before the next start, ovulation the 3 days before that, the period about 5 days (unless logged).
 */
export function cycleRingSegments(e: Pick<CycleEstimate, 'typicalLength'>, periodDays = 5): { length: number; segments: CycleRingSegment[] } {
  const length = Math.max(21, Math.min(45, e.typicalLength ?? 28));
  const lutealFrom = length - 12;
  const ovFrom = lutealFrom - 3;
  const men = Math.min(periodDays, ovFrom - 2);
  return {
    length,
    segments: [
      { phase: 'menstrual', from: 1, to: men },
      { phase: 'follicular', from: men + 1, to: ovFrom - 1 },
      { phase: 'ovulation', from: ovFrom, to: lutealFrom - 1 },
      { phase: 'luteal', from: lutealFrom, to: length },
    ],
  };
}

/* ---------- weekly minutes ---------- */

/** Minutes per day for the 7 days ending today (oldest first) and the total. */
export function weekMinutes(logs: { date: string; minutes: number }[], today: string): { days: number[]; total: number; sessions: number } {
  const t = dayNum(today);
  const days = Array.from({ length: 7 }, () => 0);
  let sessions = 0;
  for (const l of logs) {
    const ago = t - dayNum(l.date);
    if (ago >= 0 && ago < 7) {
      days[6 - ago]! += l.minutes;
      sessions++;
    }
  }
  return { days, total: days.reduce((a, b) => a + b, 0), sessions };
}

/* ---------- share a win ---------- */

/** Wins that come from health data (watch readings). They only go on a share card when the person picks them. */
export const HEALTH_WIN_KINDS: ReadonlySet<MastersWinKind> = new Set<MastersWinKind>(['resting_hr', 'hrv_baseline', 'sleep_regularity']);

/** A win in the first person, for a card the client posts: "Held your Back Squat…" → "Held my Back Squat…". */
export function firstPerson(text: string): string {
  return text
    .replace(/\byou’re\b/gi, 'I’m')
    .replace(/\byou're\b/gi, "I'm")
    .replace(/\byours\b/gi, 'mine')
    .replace(/\byour\b/g, 'my')
    .replace(/\bYour\b/g, 'My')
    .replace(/\byou\b/g, 'me')
    .replace(/\bYou\b/g, 'I');
}

export interface ShareCard {
  headline: string;
  coachedBy: string;
  /** The text a share sheet carries alongside (or instead of) the image. */
  text: string;
  includesHealthData: boolean;
}

/** The share card for one win, in the trainer's words: "… · Coached by Maya Reyes". */
export function shareCardFor(win: { kind: string; text: string }, coachName: string, appName: string): ShareCard {
  const headline = firstPerson(win.text);
  const coachedBy = `Coached by ${coachName}`;
  return { headline, coachedBy, text: `${headline}. ${coachedBy} · ${appName}`, includesHealthData: HEALTH_WIN_KINDS.has(win.kind as MastersWinKind) };
}
