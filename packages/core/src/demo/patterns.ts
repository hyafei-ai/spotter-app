/*
 * MOCK DATA: about 16 weeks of daily history for two demo clients, for "What works for {client}"
 * (patterns.ts) and masters motivation (masters.ts). Invented numbers, labelled as such, deterministic for a
 * given date (no Math.random).
 *
 * - Jordan Ellis (41): reuses the six months of cycle sessions (demo/cycle.ts), the last 28 wearable days
 *   (demo/wearables.ts), two weeks of food (demo/fuel.ts) and daily checks (demo/daily.ts), and adds the
 *   weeks before them. Built in on purpose, so the pattern finder has something to find: HRV dips for about
 *   two days after the heavier sessions, lifts run about 5% lower after short nights, progress is best at
 *   moderate weekly volume and stalls at the highest, soreness runs lower in weeks with 2+ mobility sessions,
 *   and (from demo/cycle.ts) lifts dip in the luteal phase. Food and time of day carry no built-in effect.
 * - Mei Tanaka (52, age from DEMO_CLIENT_AGES, not from the name): two and a half years of training with
 *   the estimated max flat to slightly down (and a three-week break), but strength held, a rep best, a big week, the same session
 *   done faster, a balance goal reached and steadier health markers.
 */
import { phaseOnFor } from '../cycle';
import { personalBaseline } from '../calibration';
import { buildTimeline, type ClientDay, type TimelineSessionInput } from '../timeline';
import { findPatterns, type Pattern } from '../patterns';
import { winsToMention, weeklyWins, type CapabilityGoal, type MastersInput, type MastersSession, type MastersWin } from '../masters';
import type { MobilitySession } from '../mobility';
import type { DailyCheck } from '../signals';
import type { HealthNutritionDay, ImportedWorkout, WearableDay } from '../physiology';
import { DEMO_CLIENTS } from './coach';
import { DEMO_CLIENT } from './client';
import { demoCycleProfile, demoCycleSessions } from './cycle';
import { demoImportedWorkouts, demoWearableDays } from './wearables';
import { demoHealthNutritionDays, demoPainLogs } from './fuel';
import { demoDailyChecks } from './daily';

/** MOCK: ages for demo clients, by coach-side client id. Names are never used to infer anything. */
export const DEMO_CLIENT_AGES: Record<string, number> = {
  [DEMO_CLIENTS[0]!.id]: 41,
  [DEMO_CLIENTS[5]!.id]: 52,
};
export const DEMO_JORDAN_ID = DEMO_CLIENTS[0]!.id;
export const DEMO_MEI_ID = DEMO_CLIENTS[5]!.id;

/** How many days of history the demo timeline covers (16 weeks). */
export const DEMO_HISTORY_DAYS = 112;
/** MOCK calorie target for Jordan (same ballpark as demo/fuel.ts). */
const JORDAN_TARGET_KCAL = 2000;

function isoLocal(offsetDays: number, base: Date): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
/** A fixed wobble in −1…1 for day o. */
const wobble = (o: number) => Math.round(Math.sin(o * 2.17 + 0.6) * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/* ---------- Jordan ---------- */

const START = -(DEMO_HISTORY_DAYS - 1); // −111
/** MOCK 4-week volume blocks: extra sets per lift per session (0 → about 9 sets a week per lift, 1 → 12, 3 → 18). */
const BLOCK_EXTRA = [0, 1, 1, 3, 3, 0, 1, 0];
/** MOCK weekly gain in estimated max for each extra-sets level: moderate volume progresses best, the most stalls. */
const GAIN_PER_WEEK: Record<number, number> = { 0: 0.002, 1: 0.007, 3: -0.003 };
const blockOf = (week: number) => BLOCK_EXTRA[Math.floor(week / 2)] ?? 0;

/** MOCK short night before day o (about one night in five, before the last 28 days). */
const shortNightBefore = (o: number) => (o >= -27 ? o >= -1 : ((o * 7919) % 23 + 23) % 23 < 5);

interface JordanData {
  sessions: TimelineSessionInput[];
  wearables: WearableDay[];
  checks: DailyCheck[];
  nutrition: HealthNutritionDay[];
  imported: ImportedWorkout[];
  mobility: MobilitySession[];
}

/** Mobility sessions per week, oldest first (8 weeks with 2+, 8 with fewer). */
const MOBILITY_PER_WEEK = [3, 0, 2, 1, 2, 0, 3, 1, 2, 1, 2, 0, 3, 1, 2, 0];

function jordanData(now: Date): JordanData {
  const today = isoLocal(0, now);
  const t = dayNum(today);
  const off = (iso: string) => dayNum(iso) - t;

  // Sessions: the cycle sessions, with volume blocks, a progression and the short-night dip in the last 16 weeks.
  const cum: number[] = [1];
  for (let w = 0; w < 16; w++) cum.push(cum[w]! * (1 + GAIN_PER_WEEK[blockOf(w)]!));
  const heavy = new Set<number>();
  const sessions: TimelineSessionInput[] = demoCycleSessions(now).map((s, i) => {
    const o = off(s.date);
    const titles = ['Lower A', 'Upper A', 'Full Body'];
    const startedAt = `${s.date}T${i % 2 ? '18' : '07'}:15:00`;
    if (o < START) return { ...s, title: titles[i % 3], durationMin: 45, startedAt };
    const week = Math.floor((o - START) / 7);
    const extra = blockOf(week);
    const isHeavy = i % 4 === 0;
    if (isHeavy) heavy.add(o);
    const factor = cum[week]! * (shortNightBefore(o) ? 0.95 : 1);
    const byLift = new Map<string, number>();
    for (const set of s.sets) byLift.set(set.exerciseId, set.weightKg);
    const sets = [...byLift].flatMap(([exerciseId, kg]) =>
      Array.from({ length: 3 + extra + (isHeavy ? 2 : 0) }, () => ({ exerciseId, weightKg: Math.round(kg * factor * 2) / 2, reps: 5, rpe: null })),
    );
    return { ...s, sets, title: titles[i % 3], durationMin: isHeavy ? 80 : 45 + extra * 5, startedAt };
  });

  // Wearables: generated before the last 28 days; the last 28 are demo/wearables.ts as they are.
  const recent = demoWearableDays(now);
  const wearables: WearableDay[] = [];
  for (let o = START; o < -27; o++) {
    const short = shortNightBefore(o);
    const dip = heavy.has(o - 1) ? -12 : heavy.has(o - 2) ? -3 : 0;
    wearables.push({
      date: isoLocal(o, now),
      sleepHours: short ? r1(5.8 + wobble(o) * 0.2) : r1(7.5 + wobble(o) * 0.4),
      hrvMs: r1(50 + wobble(o) * 1.5 + dip),
      restingHr: Math.round(61 - (3 * (o - START)) / 84 + wobble(o + 1) + (heavy.has(o - 1) ? 4 : 0)),
      activeKcal: Math.round(470 + wobble(o + 3) * 110),
      source: 'apple_health',
    });
  }
  wearables.push(...recent);

  // Mobility: logged in Spotter, with the occasional yoga class from the Apple Watch.
  const mobility: MobilitySession[] = [];
  const imported: ImportedWorkout[] = [...demoImportedWorkouts(now)];
  MOBILITY_PER_WEEK.forEach((count, w) => {
    [1, 4, 6].slice(0, count).forEach((d, k) => {
      const o = START + w * 7 + d;
      if (o > 0) return;
      const date = isoLocal(o, now);
      if ((w + k) % 4 === 3) {
        imported.push({ id: `mock-yoga-${w}-${k}`, date, startedAt: `${date}T19:00:00`, durationMin: 30, activity: 'yoga', activeKcal: 90, distanceM: null, avgHr: 92, maxHr: 110, source: 'apple_health', sourceApp: 'Apple Watch' });
      } else {
        mobility.push({ id: `mock-mobility-${w}-${k}`, date, minutes: k % 2 ? 15 : 10, kind: k % 2 ? 'stretching' : 'routine', source: 'spotter', routineId: k % 2 ? null : 'mock-hips-ankles' });
      }
    });
  });

  // Daily checks: generated before the last 14 days (soreness higher in low-mobility weeks); then demo/daily.ts.
  const checks: DailyCheck[] = [];
  for (let o = START; o < -14; o++) {
    const w = Math.floor((o - START) / 7);
    const lowMobility = (MOBILITY_PER_WEEK[w] ?? 0) < 2;
    const sore = Math.max(1, Math.min(5, 2 + (wobble(o * 3) > 0.3 ? 1 : 0) + (lowMobility ? 1 : 0) - (wobble(o * 5) < -0.6 ? 1 : 0)));
    const date = isoLocal(o, now);
    checks.push({
      id: `0192f0a7-0000-7000-8000-${String(o - START + 1).padStart(12, '0')}`,
      date,
      sleepHours: null,
      sleepSource: null,
      energy: 4,
      soreness: sore,
      stress: 2,
      cyclePhase: null,
      shareCycle: false,
      note: null,
      shareWithCoach: true,
      submittedAt: `${date}T07:10:00.000Z`,
    });
  }
  checks.push(...demoDailyChecks(now));

  // Food: generated before the last 14 days (no link to lifts); then demo/fuel.ts.
  const nutrition: HealthNutritionDay[] = [];
  for (let o = START; o < -14; o++) {
    if (((o % 9) + 9) % 9 === 4) continue; // a day here and there with nothing logged
    const kcal = Math.round(1960 + wobble(o * 7 + 1) * 260);
    nutrition.push({ date: isoLocal(o, now), kcal, proteinG: Math.round((kcal * 0.25) / 4), carbsG: Math.round((kcal * 0.45) / 4), fatG: Math.round((kcal * 0.3) / 9), sources: ['MyMacros'] });
  }
  nutrition.push(...demoHealthNutritionDays(now));

  return { sessions, wearables, checks, nutrition, imported, mobility };
}

/* ---------- Mei ---------- */

/** MOCK: Mei's birthday (52 now, turned 50 a little over two years ago). */
function meiBirthDate(now: Date): string {
  return isoLocal(-(52 * 365 + 13 + 100), now);
}

const MEI_WEEKS = 130;
/** MOCK: weeks ago (inclusive) when Mei took three weeks off. */
const MEI_BREAK = [24, 26] as const;

function meiSessions(now: Date): MastersSession[] {
  const out: MastersSession[] = [];
  for (let w = MEI_WEEKS - 1; w >= 0; w--) {
    if (w >= MEI_BREAK[0] && w <= MEI_BREAK[1]) continue; // MOCK: three weeks off (travel)
    // Two sessions a week (Mon/Thu-ish); three in the latest week.
    const days = w === 0 ? [-6, -4, -1] : [-w * 7 - 6, -w * 7 - 3];
    days.forEach((o, k) => {
      // Estimated max: 86 kg squat 2.5 years ago, easing to about 81 a year ago, then flat (±1%).
      const ageWeeks = w;
      const drift = ageWeeks > 52 ? 81 + ((ageWeeks - 52) / 78) * 5 : 81;
      const noise = wobble(o) * 0.8;
      const bump = w === 0 && k === 2 ? 2.5 : 0; // the latest session: best in a year
      // Back from the break about 5% down, rebuilt over four weeks.
      const rebuild = w < MEI_BREAK[0] && w >= MEI_BREAK[0] - 4 ? -4 * ((w - (MEI_BREAK[0] - 5)) / 4) : 0;
      const squatE = drift + noise + bump + rebuild;
      const kg = (e: number, reps: number) => Math.round((e / (1 + reps / 30)) * 2) / 2;
      const date = isoLocal(o, now);
      const repBest = w === 0 && k === 1;
      out.push({
        date,
        feel: 4,
        title: 'Full Body A',
        durationMin: w === 0 && k === 1 ? 47 : 58,
        sets: [
          ...[0, 1, 2].map(() => ({ exerciseId: 'back-squat', weightKg: kg(squatE, 5), reps: 5, rpe: null })),
          ...[0, 1, 2].map(() => ({ exerciseId: 'romanian-deadlift', weightKg: 50, reps: repBest ? 10 : 8, rpe: null })),
          ...[0, 1, 2].map(() => ({ exerciseId: 'incline-db-press', weightKg: 12, reps: 10, rpe: null })),
        ],
      });
    });
  }
  return out;
}

function meiWearables(now: Date): WearableDay[] {
  const out: WearableDay[] = [];
  for (let o = START; o <= 0; o++) {
    const p = (o - START) / (DEMO_HISTORY_DAYS - 1); // 0 → 1 over the 16 weeks
    out.push({
      date: isoLocal(o, now),
      sleepHours: r1(7 + wobble(o) * (1.1 - 0.6 * p)),
      hrvMs: r1(31 + 4 * p + wobble(o + 2) * 2),
      restingHr: Math.round(66 - 7 * p + wobble(o + 1)),
      activeKcal: Math.round(380 + wobble(o + 3) * 80),
      source: 'apple_health',
    });
  }
  return out;
}

function meiGoals(now: Date): CapabilityGoal[] {
  const h = (pairs: [number, number][]) => pairs.map(([o, value]) => ({ date: isoLocal(o, now), value }));
  return [
    { id: 'single-leg-balance', title: 'Single-leg balance, eyes open', unit: 's', target: 30, direction: 'up', history: h([[-84, 12], [-56, 17], [-28, 24], [-3, 31]]) },
    { id: 'farmer-carry-bodyweight', title: 'Farmer carry, bodyweight total', unit: 'm', target: 40, direction: 'up', history: h([[-70, 20], [-42, 26], [-10, 32]]) },
    { id: 'floor-to-stand', title: 'Floor to standing without hands', unit: 'yes_no', target: 1, direction: 'up', history: h([[-60, 0], [-20, 0]]) },
  ];
}

function jordanGoals(now: Date): CapabilityGoal[] {
  return [{ id: 'dead-hang', title: 'Dead hang', unit: 's', target: 60, direction: 'up', history: [[-60, 35], [-30, 41], [-5, 48]].map(([o, value]) => ({ date: isoLocal(o!, now), value: value! })) }];
}

/* ---------- exports ---------- */

const isJordan = (id: string) => id === DEMO_JORDAN_ID || id === DEMO_CLIENT.id;

export interface DemoDaysOptions {
  /** Include the cycle phase. Only when the client shares it with the coach (Jordan doesn't, by default). */
  includeCycle?: boolean;
}

/** MOCK: the client's last 16 weeks as ClientDays (coach-side id; Jordan's client-side id works too). Empty for clients without demo history. */
export function demoClientDays(clientId: string, now = new Date(), opts: DemoDaysOptions = {}): ClientDay[] {
  const from = isoLocal(START, now);
  const to = isoLocal(0, now);
  if (isJordan(clientId)) {
    const d = jordanData(now);
    return buildTimeline(
      {
        sessions: d.sessions,
        imported: d.imported,
        wearables: d.wearables,
        healthNutrition: d.nutrition,
        targets: { kcal: JORDAN_TARGET_KCAL },
        phaseOn: opts.includeCycle ? phaseOnFor(demoCycleProfile(now)) : null,
        pain: demoPainLogs(now),
        checks: d.checks,
        mobility: d.mobility,
      },
      from,
      to,
    );
  }
  if (clientId === DEMO_MEI_ID) {
    return buildTimeline({ sessions: meiSessions(now), wearables: meiWearables(now) }, from, to);
  }
  return [];
}

/** MOCK: "What works for {client}". The cycle pattern only appears with `includeCycle` (the client shares it). */
export function demoClientPatterns(clientId: string, now = new Date(), opts: DemoDaysOptions = {}): Pattern[] {
  const days = demoClientDays(clientId, now, opts);
  if (!days.length) return [];
  const calibration =
    opts.includeCycle && isJordan(clientId)
      ? // The same calibration the client app shows (demo/cycle.ts sessions), wrapped as a pattern.
        personalBaseline.calibrate({ today: isoLocal(0, now), sessions: demoCycleSessions(now), phaseOn: phaseOnFor(demoCycleProfile(now)) })
      : null;
  return findPatterns(days, { calibration });
}

/** MOCK: masters-motivation input for a demo client, or null. */
export function demoMastersInput(clientId: string, now = new Date()): MastersInput | null {
  if (isJordan(clientId)) {
    const d = jordanData(now);
    return { sessions: d.sessions, wearables: d.wearables, goals: jordanGoals(now), birthDate: isoLocal(-(41 * 365 + 10 + 40), now), coachStart: DEMO_CLIENTS[0]!.startDate };
  }
  if (clientId === DEMO_MEI_ID) {
    return { sessions: meiSessions(now), wearables: meiWearables(now), goals: meiGoals(now), birthDate: meiBirthDate(now), coachStart: DEMO_CLIENTS[5]!.startDate };
  }
  return null;
}

/** MOCK: the coach's three wins to mention, and the client's week. */
export function demoWins(clientId: string, now = new Date()): { mention: MastersWin[]; week: MastersWin[] } {
  const input = demoMastersInput(clientId, now);
  if (!input) return { mention: [], week: [] };
  const today = isoLocal(0, now);
  return { mention: winsToMention(input, today), week: weeklyWins(input, today) };
}
