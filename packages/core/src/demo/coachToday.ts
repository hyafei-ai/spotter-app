/*
 * MOCK DATA for the coach's Today, the all-clients grid and the first-login sample client
 * (docs/ux/coach-experience.md). Invented numbers, labelled as such, deterministic for a given date.
 *
 * - SAMPLE_CLIENT: the clearly labelled sample a new coach sees before inviting anyone. Their history is the
 *   demo Jordan Ellis history (demo/patterns.ts), with the cycle shared so every lane shows.
 * - demoRosterDays: Jordan and Mei use their 16-week histories; the other demo clients get a light 8-week
 *   history built here so the grid and timelines have something honest to draw (no patterns are claimed
 *   for them: the pattern finder isn't run on these).
 * - demoPlannedToday: today's planned session for clients without a program in the demo program store.
 */
import { DEMO_CLIENTS, type DemoClient } from './coach';
import {
  DEMO_JORDAN_ID,
  DEMO_MEI_ID,
  demoClientDays,
  demoClientPatterns,
  demoWins,
} from './patterns';
import type { ClientDay } from '../timeline';
import type { PlannedDay } from '../coachToday';
import type { Pattern } from '../patterns';
import type { MastersWin } from '../masters';

function isoLocal(offsetDays: number, base: Date): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const wobble = (o: number) => Math.round(Math.sin(o * 2.17 + 0.6) * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** MOCK: the first-login sample client. Always shown with a "Sample" tag; never counted as a real client. */
export const SAMPLE_CLIENT: DemoClient = {
  id: '0192f0a2-0000-7000-8000-000000000099',
  name: 'Sam Sample',
  plan: 'Sample client · MOCK data',
  startDate: '2026-06-01',
  status: 'active',
  flags: [],
  thisWeek: { planned: 3, done: 2 },
  lastSession: 'Upper A · 2 days ago',
};
export const isSampleClient = (id: string) => id === SAMPLE_CLIENT.id;

const C = DEMO_CLIENTS;

/** MOCK profiles for the lighter histories: days per week trained, sleep, last trained, pain. */
interface Profile {
  /** Weekday offsets (0–6) they usually train on. */
  days: number[];
  sleep: number;
  /** No training in the last n days (Chris: 9; Daniel: paused 35). */
  quietDays?: number;
  /** Only this many days of history (Tomás joined recently, no health app). */
  historyDays?: number;
  wearable?: boolean;
  pain?: { region: 'shoulder'; fromDay: number; level: number };
  food?: boolean;
  title: string;
}

const PROFILES: Record<string, Profile> = {
  [C[1]!.id]: { days: [0, 2, 4, 5], sleep: 7.3, wearable: true, food: true, title: 'Upper B' },
  [C[2]!.id]: { days: [], sleep: 7, historyDays: 10, wearable: false, title: 'Full Body' },
  [C[3]!.id]: {
    days: [1, 3, 5],
    sleep: 7.1,
    wearable: true,
    pain: { region: 'shoulder', fromDay: -13, level: 4 },
    title: 'Full Body C',
  },
  [C[4]!.id]: { days: [0, 2, 4], sleep: 6.9, quietDays: 9, wearable: true, title: 'Lower B' },
  [C[6]!.id]: { days: [1, 4], sleep: 7.4, quietDays: 35, wearable: true, title: 'Upper A' },
  [C[7]!.id]: { days: [0, 2, 5], sleep: 7.6, wearable: true, title: 'Lower A' },
};

function lightDays(id: string, now: Date, n: number): ClientDay[] {
  const p = PROFILES[id];
  if (!p) return [];
  const seed = Number(id.slice(-2)) || 1;
  const out: ClientDay[] = [];
  for (let o = -(n - 1); o <= 0; o++) {
    const date = isoLocal(o, now);
    const inHistory = p.historyDays == null || o > -p.historyDays;
    const wd = (((o + seed) % 7) + 7) % 7;
    const trains = inHistory && p.days.includes(wd) && !(p.quietDays != null && o > -p.quietDays);
    const sleepHours =
      inHistory && p.wearable !== false
        ? r1(p.sleep + wobble(o * 3 + seed) * 0.6 - (p.quietDays === 9 && o > -9 ? 0.5 : 0))
        : null;
    const ratio = r1(1 + wobble(o * 5 + seed) * 0.08);
    const hasHrv = sleepHours != null;
    const pain =
      p.pain && o >= p.pain.fromDay && (o * 7 + seed) % 3 !== 0
        ? [{ region: p.pain.region, level: p.pain.level + (o > -3 ? 1 : 0) }]
        : [];
    const kcal =
      p.food && inHistory && (o + seed) % 4 !== 0
        ? Math.round(2100 + wobble(o * 7 + seed) * 220)
        : null;
    out.push({
      date,
      training: {
        sessions: trains
          ? [
              {
                source: 'spotter',
                title: p.title,
                minutes: 50,
                load: 50 * 6,
                hardSets: 14,
                rpe: 7,
                hour: 18,
                deltaPct: null,
                bests: {},
                groupSets: {},
                muscles: [],
              },
            ]
          : [],
        load: trains ? 300 : 0,
      },
      recovery: {
        sleepHours,
        hrvMs: hasHrv ? r1(44 * ratio) : null,
        restingHr: hasHrv ? Math.round(60 - (ratio - 1) * 20) : null,
        hrvVsBaseline: hasHrv ? ratio : null,
        rhrVsBaseline: hasHrv ? Math.round(-(ratio - 1) * 20) : null,
        hrvLow: hasHrv ? ratio < 0.9 : null,
      },
      mobility: { minutes: 0, sessions: 0 },
      nutrition: {
        kcal,
        proteinG: kcal ? Math.round((kcal * 0.25) / 4) : null,
        carbsG: null,
        vsTarget: kcal ? Math.round((kcal / 2200) * 100) / 100 : null,
        source: kcal ? 'From MyMacros via Apple Health' : null,
      },
      cycle: null,
      pain,
      check: null,
    });
  }
  return out;
}

export interface RosterDaysOptions {
  /** Days to return, ending today (default 56: the 8-week timeline). */
  days?: number;
  /** The client shares the cycle with this coach. */
  includeCycle?: boolean;
}

/** MOCK: a demo client's daily history for the timeline and the grid, oldest first. */
export function demoRosterDays(
  clientId: string,
  now = new Date(),
  opts: RosterDaysOptions = {},
): ClientDay[] {
  const n = opts.days ?? 56;
  if (isSampleClient(clientId))
    return demoClientDays(DEMO_JORDAN_ID, now, { includeCycle: true }).slice(-n);
  if (clientId === DEMO_JORDAN_ID || clientId === DEMO_MEI_ID)
    return demoClientDays(clientId, now, { includeCycle: opts.includeCycle }).slice(-n);
  return lightDays(clientId, now, n);
}

/** MOCK: "What works" for a demo client (the sample client shares the cycle, so its cycle pattern shows). */
export function demoRosterPatterns(
  clientId: string,
  now = new Date(),
  opts: { includeCycle?: boolean } = {},
): Pattern[] {
  if (isSampleClient(clientId))
    return demoClientPatterns(DEMO_JORDAN_ID, now, { includeCycle: true });
  return demoClientPatterns(clientId, now, opts);
}

/** MOCK: wins to mention for a demo client. */
export function demoRosterWins(clientId: string, now = new Date()): MastersWin[] {
  return demoWins(isSampleClient(clientId) ? DEMO_JORDAN_ID : clientId, now).mention;
}

/** MOCK: today's planned session for clients without a program in the demo program store. */
export function demoPlannedToday(clientId: string): PlannedDay | null {
  const sets = (n: number) => Array.from({ length: n }, () => ({}));
  if (isSampleClient(clientId)) {
    return {
      title: 'Lower A',
      exercises: ['back-squat', 'romanian-deadlift', 'bulgarian-split-squat', 'hanging-knee-raise']
        .map((exerciseId) => ({ exerciseId, sets: sets(3) }))
        .concat([{ exerciseId: 'farmer-carry', sets: sets(2) }]),
    };
  }
  if (clientId === C[3]!.id) {
    // Aisha: an upper day while the left shoulder is sore.
    return {
      title: 'Full Body C',
      exercises: [
        { exerciseId: 'goblet-squat', sets: sets(3) },
        { exerciseId: 'db-row', sets: sets(3) },
        { exerciseId: 'incline-db-press', sets: sets(3) },
      ],
    };
  }
  if (clientId === DEMO_MEI_ID) {
    return {
      title: 'Full Body A',
      exercises: [
        { exerciseId: 'back-squat', sets: sets(3) },
        { exerciseId: 'romanian-deadlift', sets: sets(3) },
        { exerciseId: 'incline-db-press', sets: sets(3) },
      ],
    };
  }
  if (clientId === C[1]!.id)
    return {
      title: 'Upper B',
      exercises: [
        { exerciseId: 'bench-press', sets: sets(4) },
        { exerciseId: 'db-row', sets: sets(4) },
      ],
    };
  return null;
}
