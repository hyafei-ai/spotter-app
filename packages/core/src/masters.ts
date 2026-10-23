import { STARTER_LIBRARY } from './library';
import { sessionBestE1rms } from './calibration';
import { repBests } from './progress';
import type { CalibrationSession, WearableDay } from './physiology';

/**
 * Motivation beyond raw PRs for masters athletes (docs/features/masters.md). After 40, and more so after
 * 50, all-time bests get rare; these are the honest wins that are still there:
 * - era bests: best since turning 50, this year, since starting with the coach, in 2 years
 * - holding strong: strength held within 3% of the athlete's own 12-week best for 8+ weeks
 * - rep, volume and density bests: more reps at a load, the biggest week, the same work in less time
 * - capability goals the coach picks (carry, balance, getting up off the floor), against the athlete's own
 *   history, never a population norm
 * - health markers from the watch: resting HR down, HRV baseline up, steadier sleep
 *
 * Every win is computed from logged data; nothing is rounded up. Coach lines never use pronouns.
 */

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
};
const LIB_NAMES: Record<string, string> = Object.fromEntries(STARTER_LIBRARY.map((e) => [e.id, e.name]));
const nameOf = (id: string, names?: Record<string, string>) => names?.[id] ?? LIB_NAMES[id] ?? id;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/* ---------- inputs and outputs ---------- */

export interface MastersSession extends CalibrationSession {
  durationMin?: number | null;
  title?: string;
}

export const CAPABILITY_UNITS = ['kg', 's', 'm', 'reps', 'cm', 'yes_no'] as const;
export type CapabilityUnit = (typeof CAPABILITY_UNITS)[number];

export interface CapabilityGoal {
  id: string;
  title: string;
  /** 'yes_no' records 1 (done) or 0 (not yet), e.g. getting up off the floor without hands. */
  unit: CapabilityUnit;
  target: number;
  direction: 'up' | 'down';
  history: { date: string; value: number }[];
}

export interface MastersInput {
  sessions: MastersSession[];
  wearables?: WearableDay[];
  goals?: CapabilityGoal[];
  /** For "since turning 50". Year-only birthdays use 1 January. */
  birthDate?: string | null;
  /** First day with this coach, for "since starting coaching". */
  coachStart?: string | null;
  names?: Record<string, string>;
}

export type MastersWinKind =
  | 'era_best'
  | 'holding_strong'
  | 'rep_best'
  | 'volume_week'
  | 'session_sets'
  | 'density'
  | 'capability_reached'
  | 'capability_best'
  | 'resting_hr'
  | 'hrv_baseline'
  | 'sleep_regularity';

export interface MastersWin {
  kind: MastersWinKind;
  date: string;
  /** To the athlete: "Held your Back Squat strength for 10 weeks". */
  text: string;
  /** To the coach, short and pronoun-free: "Back Squat held for 10 weeks". */
  coachText: string;
  /** How much it's worth mentioning (higher first, before recency). */
  weight: number;
  exerciseId?: string;
}

/* ---------- era bests ---------- */

export interface EraAnchor {
  date: string;
  /** "since turning 50", "this year", "since starting coaching", "in 2 years" */
  words: string;
}

/** The anchors that apply on `today`, oldest first (the oldest one beaten is the most meaningful). */
export function eraAnchors(input: Pick<MastersInput, 'birthDate' | 'coachStart'>, today: string): EraAnchor[] {
  const t = dayNum(today);
  const out: EraAnchor[] = [{ date: isoOf(t - 730), words: 'in 2 years' }, { date: isoOf(t - 365), words: 'in a year' }, { date: `${today.slice(0, 4)}-01-01`, words: 'this year' }];
  if (input.birthDate) {
    const age = ageOn(input.birthDate, today);
    if (age >= 40) {
      const decade = Math.floor(age / 10) * 10;
      const bday = `${Number(input.birthDate.slice(0, 4)) + decade}${input.birthDate.slice(4)}`;
      out.push({ date: bday, words: `since turning ${decade}` });
    }
  }
  if (input.coachStart) out.push({ date: input.coachStart, words: 'since starting coaching' });
  return out.filter((a) => dayNum(a.date) < t).sort((a, b) => a.date.localeCompare(b.date));
}

export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Recent wins look back this far. */
export const RECENT_DAYS = 28;
/** An era best needs this many earlier sessions of the lift inside the era. */
export const ERA_MIN_SESSIONS = 3;

/**
 * Best estimated max since an anchor, when it isn't an all-time best (those are progress.ts raw bests):
 * the most recent session's top e1RM beats everything since the anchor, and something before the anchor
 * was higher. The oldest anchor that holds wins.
 */
export function eraBests(input: MastersInput, today: string): MastersWin[] {
  const t = dayNum(today);
  const anchors = eraAnchors(input, today);
  const sorted = [...input.sessions].filter((s) => dayNum(s.date) <= t).sort((a, b) => a.date.localeCompare(b.date));
  const series = new Map<string, { date: string; e: number }[]>();
  for (const s of sorted) for (const [ex, e] of sessionBestE1rms(s)) series.set(ex, [...(series.get(ex) ?? []), { date: s.date, e }]);
  const out: MastersWin[] = [];
  for (const [ex, pts] of series) {
    const recent = pts.filter((p) => t - dayNum(p.date) < RECENT_DAYS);
    if (!recent.length) continue;
    const top = recent.reduce((a, b) => (b.e > a.e ? b : a));
    const before = pts.filter((p) => p.date < top.date);
    if (!before.length || top.e > Math.max(...before.map((p) => p.e)) + 1e-6) continue; // all-time best: not an era best
    for (const a of anchors) {
      const inEra = before.filter((p) => p.date >= a.date);
      const preEra = before.filter((p) => p.date < a.date);
      if (inEra.length < ERA_MIN_SESSIONS || !preEra.length) continue;
      if (top.e <= Math.max(...inEra.map((p) => p.e)) + 1e-6) continue;
      const name = nameOf(ex, input.names);
      const span = t - dayNum(a.date);
      out.push({
        kind: 'era_best',
        date: top.date,
        exerciseId: ex,
        text: `Your best ${name} ${a.words}: about ${r1(top.e)} kg estimated max`,
        coachText: `Best ${name} ${a.words} (${r1(top.e)} kg est. max)`,
        weight: 70 + Math.min(15, span / 50),
      });
      break;
    }
  }
  return out;
}

/* ---------- holding strong ---------- */

export const HOLD_WITHIN_PCT = 3;
export const HOLD_REFERENCE_WEEKS = 12;
export const HOLD_MIN_WEEKS = 8;

/** Weekly best e1RM per lift in 7-day blocks ending today, oldest first (null = no session that week). */
function weeklyBests(sessions: CalibrationSession[], today: string, weeks: number): Map<string, (number | null)[]> {
  const t = dayNum(today);
  const out = new Map<string, (number | null)[]>();
  for (const s of sessions) {
    const ago = t - dayNum(s.date);
    if (ago < 0 || ago >= weeks * 7) continue;
    const w = weeks - 1 - Math.floor(ago / 7);
    for (const [ex, e] of sessionBestE1rms(s)) {
      const arr = out.get(ex) ?? Array.from({ length: weeks }, () => null);
      arr[w] = Math.max(arr[w] ?? 0, e);
      out.set(ex, arr);
    }
  }
  return out;
}

/**
 * Held: each week's best is within 3% of the best of the 12 weeks up to it. The streak runs back from the
 * latest week with the lift; one empty week is skipped, two end it. 8+ weeks is a win.
 */
export function holdingStrong(input: MastersInput, today: string): MastersWin[] {
  const WEEKS = 104;
  const out: MastersWin[] = [];
  for (const [ex, wk] of weeklyBests(input.sessions, today, WEEKS)) {
    let last = wk.length - 1;
    while (last >= 0 && wk[last] == null) last--;
    if (last < wk.length - 2) continue; // not trained in the last two weeks
    let first = last;
    let gap = 0;
    for (let w = last; w >= 0; w--) {
      const v = wk[w];
      if (v == null) {
        if (++gap >= 2) break;
        continue;
      }
      gap = 0;
      const ref = Math.max(...wk.slice(Math.max(0, w - HOLD_REFERENCE_WEEKS + 1), w + 1).filter((x): x is number => x != null));
      if (v < ref * (1 - HOLD_WITHIN_PCT / 100)) break;
      first = w;
    }
    const weeks = last - first + 1;
    if (weeks < HOLD_MIN_WEEKS) continue;
    const name = nameOf(ex, input.names);
    out.push({
      kind: 'holding_strong',
      date: isoOf(dayNum(today) - (wk.length - 1 - last) * 7),
      exerciseId: ex,
      text: `Held your ${name} strength for ${weeks} weeks`,
      coachText: `${name} strength held for ${weeks} weeks`,
      weight: 60 + Math.min(15, weeks - HOLD_MIN_WEEKS),
    });
  }
  return out;
}

/* ---------- reps, volume and density ---------- */

const tonnage = (s: CalibrationSession) => s.sets.reduce((n, x) => n + Math.max(0, x.weightKg) * Math.max(0, x.reps), 0);
const hardSets = (s: CalibrationSession) => s.sets.filter((x) => x.rpe == null || x.rpe >= 7).length;
const tonnes = (kg: number) => (kg >= 1000 ? `${r1(kg / 1000)} t` : `${Math.round(kg)} kg`);

/** Rep bests (progress.ts) from the last 4 weeks, newest first, at most one per lift. */
export function recentRepBests(input: MastersInput, today: string): MastersWin[] {
  const t = dayNum(today);
  const seen = new Set<string>();
  return repBests(input.sessions.filter((s) => dayNum(s.date) <= t), input.names)
    .filter((w) => t - dayNum(w.date) < RECENT_DAYS)
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((w) => (seen.has(w.exerciseId) ? false : (seen.add(w.exerciseId), true)))
    .map((w) => {
      const kg = w.text.match(/at ([\d.]+) kg/)?.[1] ?? '';
      const name = nameOf(w.exerciseId, input.names);
      return { kind: 'rep_best' as const, date: w.date, exerciseId: w.exerciseId, text: w.text, coachText: `${name}: ${w.value} reps at ${kg} kg, most at that weight`, weight: 55 };
    });
}

/** A week (or session) has to beat at least this many earlier ones to count. */
export const VOLUME_MIN_BEATEN = 8;

/** The latest 7 days moved more than each of the 8+ weeks before it; or the latest session had the most hard sets in 8+ sessions. */
export function volumeBests(input: MastersInput, today: string): MastersWin[] {
  const t = dayNum(today);
  const out: MastersWin[] = [];
  const weeks: number[] = [];
  const first = Math.min(...input.sessions.map((s) => dayNum(s.date)));
  for (let w = 0; t - w * 7 - 6 >= first - 6 && w < 104; w++) {
    weeks.push(input.sessions.filter((s) => t - dayNum(s.date) >= w * 7 && t - dayNum(s.date) < w * 7 + 7).reduce((n, s) => n + tonnage(s), 0));
  }
  const [cur, ...prev] = weeks;
  if (cur && cur > 0) {
    let beaten = 0;
    while (beaten < prev.length && prev[beaten]! < cur) beaten++;
    if (beaten >= VOLUME_MIN_BEATEN) {
      const span = beaten === prev.length ? 'on record' : `in ${beaten + 1} weeks`;
      out.push({ kind: 'volume_week', date: today, text: `Your biggest training week ${span}: ${tonnes(cur)} lifted`, coachText: `Biggest week ${span}: ${tonnes(cur)} lifted`, weight: 50 });
    }
  }
  const sorted = [...input.sessions].filter((s) => dayNum(s.date) <= t).sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  if (latest && t - dayNum(latest.date) < 7) {
    const n = hardSets(latest);
    let beaten = 0;
    while (beaten + 1 < sorted.length && hardSets(sorted[beaten + 1]!) < n) beaten++;
    if (beaten >= VOLUME_MIN_BEATEN) {
      out.push({ kind: 'session_sets', date: latest.date, text: `Most hard sets in one session in a while: ${n}`, coachText: `Most hard sets in a session in ${beaten + 1} sessions: ${n}`, weight: 40 });
    }
  }
  return out;
}

/** Density: the same lifts and about the same work (within 5% tonnage) as an earlier session, in 10%+ less time (at least 5 minutes). */
export function densityBests(input: MastersInput, today: string): MastersWin[] {
  const t = dayNum(today);
  const timed = input.sessions.filter((s) => s.durationMin != null && s.durationMin > 0 && dayNum(s.date) <= t).sort((a, b) => a.date.localeCompare(b.date));
  const key = (s: CalibrationSession) => [...new Set(s.sets.map((x) => x.exerciseId))].sort().join('|');
  const out: MastersWin[] = [];
  for (const s of timed.filter((x) => t - dayNum(x.date) < RECENT_DAYS).reverse()) {
    const match = timed
      .filter((p) => p.date < s.date && key(p) === key(s) && tonnage(s) >= tonnage(p) * 0.95)
      .filter((p) => p.durationMin! - s.durationMin! >= Math.max(5, p.durationMin! * 0.1))
      .pop();
    if (!match) continue;
    const saved = Math.round(match.durationMin! - s.durationMin!);
    const what = s.title ?? 'session';
    out.push({
      kind: 'density',
      date: s.date,
      text: `Same ${what} work as on ${shortDate(match.date)}, ${saved} minutes faster`,
      coachText: `Same ${what} work as ${shortDate(match.date)}, ${saved} min faster`,
      weight: 50,
    });
    break;
  }
  return out;
}

/* ---------- capability goals ---------- */

export interface CapabilityTemplate {
  id: string;
  title: string;
  unit: CapabilityUnit;
  direction: 'up' | 'down';
  /** A starting value for the coach to edit, from the goal's own wording; not a norm for any age. Null = coach sets it. */
  suggestedTarget: number | null;
  howTo: string;
}

/** Starter goals a coach can pick. No population norms: the target is the coach's and the athlete's call. */
export const CAPABILITY_STARTERS: CapabilityTemplate[] = [
  { id: 'farmer-carry-bodyweight', title: 'Farmer carry, bodyweight total', unit: 'm', direction: 'up', suggestedTarget: 40, howTo: 'Carry half your bodyweight in each hand. Record the distance before setting the weights down.' },
  { id: 'single-leg-balance', title: 'Single-leg balance, eyes open', unit: 's', direction: 'up', suggestedTarget: 30, howTo: 'Stand on one leg, hands on hips. Record the shorter side.' },
  { id: 'floor-to-stand', title: 'Floor to standing without hands', unit: 'yes_no', direction: 'up', suggestedTarget: 1, howTo: 'Sit on the floor, then stand up without hands or knees touching anything. 1 = done.' },
  { id: 'dead-hang', title: 'Dead hang', unit: 's', direction: 'up', suggestedTarget: null, howTo: 'Hang from a bar with straight arms. Record seconds until the grip goes.' },
  { id: 'sit-and-reach', title: 'Sit and reach', unit: 'cm', direction: 'up', suggestedTarget: null, howTo: 'Same box or step each time; record centimetres past (or short of, as negative) the toes.' },
];

export interface CapabilityProgress {
  latest: number | null;
  best: number | null;
  reached: boolean;
  /** 0–100, toward the target, for a progress bar. Null with no history. */
  pct: number | null;
  /** "32 of 40 m", "Reached: 30 s", "Not yet". */
  text: string;
}

const unitText = (v: number, u: CapabilityUnit) => (u === 'yes_no' ? (v >= 1 ? 'done' : 'not yet') : u === 'reps' ? `${v} reps` : `${v} ${u}`);
const better = (g: CapabilityGoal, a: number, b: number) => (g.direction === 'up' ? a > b : a < b);
const reachedValue = (g: CapabilityGoal, v: number) => (g.direction === 'up' ? v >= g.target : v <= g.target);

export function capabilityProgress(goal: CapabilityGoal): CapabilityProgress {
  const h = [...goal.history].sort((a, b) => a.date.localeCompare(b.date));
  if (!h.length) return { latest: null, best: null, reached: false, pct: null, text: 'No attempts logged yet' };
  const latest = h[h.length - 1]!.value;
  const best = h.reduce((b, x) => (better(goal, x.value, b) ? x.value : b), h[0]!.value);
  const reached = reachedValue(goal, best);
  if (goal.unit === 'yes_no') return { latest, best, reached, pct: reached ? 100 : 0, text: reached ? 'Done' : 'Not yet' };
  const pct = goal.direction === 'up' ? (goal.target > 0 ? (best / goal.target) * 100 : 100) : best > 0 ? (goal.target / best) * 100 : 100;
  return {
    latest,
    best,
    reached,
    pct: Math.max(0, Math.min(100, Math.round(pct))),
    text: reached ? `Reached: ${unitText(best, goal.unit)}` : goal.unit === 'reps' ? `${best} of ${goal.target} reps` : `${best} of ${goal.target} ${goal.unit}`,
  };
}

/** Wins from capability goals in the last 4 weeks: target reached for the first time, or a new best. */
export function capabilityWins(input: MastersInput, today: string): MastersWin[] {
  const t = dayNum(today);
  const out: MastersWin[] = [];
  for (const g of input.goals ?? []) {
    const h = [...g.history].filter((x) => dayNum(x.date) <= t).sort((a, b) => a.date.localeCompare(b.date));
    for (let i = h.length - 1; i >= 1; i--) {
      const x = h[i]!;
      if (t - dayNum(x.date) >= RECENT_DAYS) break;
      const prev = h.slice(0, i);
      const prevBest = prev.reduce((b, p) => (better(g, p.value, b) ? p.value : b), prev[0]!.value);
      if (!better(g, x.value, prevBest)) continue;
      if (reachedValue(g, x.value) && !reachedValue(g, prevBest)) {
        out.push({ kind: 'capability_reached', date: x.date, text: `Goal reached: ${g.title}${g.unit === 'yes_no' ? '' : `, ${unitText(x.value, g.unit)}`}`, coachText: `Goal reached: ${g.title}${g.unit === 'yes_no' ? '' : ` (${unitText(x.value, g.unit)})`}`, weight: 90 });
      } else {
        const prog = g.unit === 'yes_no' ? '' : ` (${unitText(x.value, g.unit)} of ${g.target})`;
        out.push({ kind: 'capability_best', date: x.date, text: `New best on ${g.title}${prog}`, coachText: `${g.title}: new best${prog}`, weight: 55 });
      }
      break;
    }
  }
  return out;
}

/* ---------- health markers ---------- */

export const RHR_DROP_BPM = 3;
export const HRV_RISE_PCT = 5;
/** Sleep counts as steadier when the nightly SD drops by at least 0.2 h and to 80% or less of what it was. */
export const SLEEP_SD_DROP_H = 0.2;
export const SLEEP_SD_RATIO = 0.8;
const MARKER_GAP_DAYS = 56;

function windowValues(days: WearableDay[], today: string, endAgo: number, length: number, pick: (d: WearableDay) => number | null): number[] {
  const t = dayNum(today);
  return days.filter((d) => t - dayNum(d.date) >= endAgo && t - dayNum(d.date) < endAgo + length).map(pick).filter((x): x is number => x != null);
}

/** Resting HR down 3+ bpm, HRV baseline up 5%+, steadier sleep: the last weeks against the same weeks 8 weeks before. Same source only. */
export function healthMarkerWins(input: MastersInput, today: string): MastersWin[] {
  const all = input.wearables ?? [];
  if (!all.length) return [];
  const counts = new Map<string, number>();
  for (const d of all) counts.set(d.source, (counts.get(d.source) ?? 0) + 1);
  const source = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  const days = all.filter((d) => d.source === source);
  const out: MastersWin[] = [];

  const rNow = windowValues(days, today, 0, 14, (d) => d.restingHr);
  const rThen = windowValues(days, today, MARKER_GAP_DAYS, 14, (d) => d.restingHr);
  if (rNow.length >= 7 && rThen.length >= 7) {
    const drop = mean(rThen) - mean(rNow);
    if (drop >= RHR_DROP_BPM) {
      const bpm = Math.round(drop);
      out.push({ kind: 'resting_hr', date: today, text: `Your resting heart rate is ${bpm} bpm lower than 8 weeks ago`, coachText: `Resting HR down ${bpm} bpm in 8 weeks`, weight: 65 });
    }
  }
  const hNow = windowValues(days, today, 0, 28, (d) => d.hrvMs);
  const hThen = windowValues(days, today, MARKER_GAP_DAYS, 28, (d) => d.hrvMs);
  if (hNow.length >= 14 && hThen.length >= 14 && mean(hThen) > 0) {
    const rise = (mean(hNow) / mean(hThen) - 1) * 100;
    if (rise >= HRV_RISE_PCT) {
      const p = Math.round(rise);
      out.push({ kind: 'hrv_baseline', date: today, text: `Your usual HRV is ${p}% higher than 8 weeks ago`, coachText: `HRV baseline up ${p}% in 8 weeks`, weight: 60 });
    }
  }
  const sNow = windowValues(days, today, 0, 28, (d) => d.sleepHours);
  const sThen = windowValues(days, today, MARKER_GAP_DAYS, 28, (d) => d.sleepHours);
  if (sNow.length >= 14 && sThen.length >= 14) {
    const a = sd(sThen);
    const b = sd(sNow);
    if (a - b >= SLEEP_SD_DROP_H && b <= a * SLEEP_SD_RATIO) {
      out.push({
        kind: 'sleep_regularity',
        date: today,
        text: `Your sleep is steadier: nights now vary by about ${r1(b)} h, down from ${r1(a)} h`,
        coachText: `Sleep steadier: nightly swing ${r1(a)} h → ${r1(b)} h`,
        weight: 50,
      });
    }
  }
  return out;
}

/* ---------- putting it together ---------- */

export function mastersWins(input: MastersInput, today: string): MastersWin[] {
  return [
    ...eraBests(input, today),
    ...holdingStrong(input, today),
    ...recentRepBests(input, today),
    ...volumeBests(input, today),
    ...densityBests(input, today),
    ...capabilityWins(input, today),
    ...healthMarkerWins(input, today),
  ];
}

/** Most meaningful first, nudged by recency (a point and a half per day old). */
const score = (w: MastersWin, today: string) => w.weight - 1.5 * Math.max(0, dayNum(today) - dayNum(w.date));

/** The coach's prep: the top 3 wins worth mentioning, one line each (use `coachText`), at most one of each kind. */
export function winsToMention(input: MastersInput, today: string): MastersWin[] {
  const kinds = new Set<MastersWinKind>();
  return mastersWins(input, today)
    .sort((a, b) => score(b, today) - score(a, today))
    .filter((w) => (kinds.has(w.kind) ? false : (kinds.add(w.kind), true)))
    .slice(0, 3);
}

/** The athlete's week: wins dated in the last 7 days, most meaningful first (use `text`). */
export function weeklyWins(input: MastersInput, today: string): MastersWin[] {
  const t = dayNum(today);
  return mastersWins(input, today)
    .filter((w) => t - dayNum(w.date) < 7)
    .sort((a, b) => b.weight - a.weight);
}

/* ---------- age grading (interface only) ---------- */

/**
 * Age-graded results ("worth 112 kg at 30") need a sourced coefficient table, e.g. the masters age
 * coefficients published by a weightlifting or powerlifting federation, cited by name and edition.
 * None ships here on purpose: no coefficients are invented. Implement this interface with the sourced
 * table and show its `source` wherever a graded number appears.
 */
export interface AgeGrader {
  id: string;
  /** Where the coefficients come from, shown with every graded result. */
  source: string;
  /** The graded value, or null when the table doesn't cover this lift, age or sex. */
  grade(input: { exerciseId: string; kg: number; ageYears: number; sex: 'female' | 'male' | null }): number | null;
}
