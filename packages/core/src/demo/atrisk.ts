/*
 * MOCK DATA — physiology the demo clients chose to share with their coach, and twelve weeks of MRR at
 * risk for the Maya Reyes Strength demo tenant. Everything here is invented for the preview build.
 * The live figures on screen are computed from it with the same functions as real data
 * (atRiskRoster, ownerRoster, mrrAtRisk, mrrAtRiskTrend); the earlier weeks are typed in.
 */
import { riskWeekStart, type MrrSnapshot, type PhysiologyInput } from '../atrisk';
import { DEMO_CLIENTS } from './coach';

const DAY = 86_400_000;
const isoAgo = (d: number, now: number) => new Date(now - d * DAY).toISOString().slice(0, 10);

/**
 * Coach-side client id → what that client shares. Clients missing from the map share nothing, and
 * the coach sees engagement reasons only for them.
 * - Jordan shares fuel (one to watch).
 * - Aisha shares pain (left shoulder, 5 of the last 14 days) and progress (no new best in 9 weeks).
 * - Mei shares reads, fuel and progress: running tired 5 of 7 days and the fuel check flagged.
 * - Fatima shares progress only, which has stalled.
 * Priya, Tomás, Chris and Daniel share none of it.
 */
export function demoPhysiology(): Record<string, PhysiologyInput> {
  const c = DEMO_CLIENTS;
  const none = { fuelLevel: null, painOngoing: false, progressStalled: false, runningTired: false } as const;
  return {
    [c[0]!.id]: { ...none, fuelLevel: 'watch', tiredDays: 2 },
    [c[3]!.id]: { ...none, painOngoing: true, pain: { region: 'shoulder', side: 'left', days: 5 }, progressStalled: true, weeksSinceBest: 9 },
    [c[5]!.id]: { ...none, fuelLevel: 'talk_to_someone', runningTired: true, tiredDays: 5 },
    [c[7]!.id]: { ...none, progressStalled: true, weeksSinceBest: 10 },
  };
}

/**
 * MOCK: twelve weekly MRR-at-risk snapshots (USD), oldest first, ending with this week. The page
 * swaps this week's for the live figure. Shaped to rise over the last month, with a dip after
 * check-ins five weeks ago.
 */
export function demoMrrSnapshots(now = Date.now()): MrrSnapshot[] {
  // [high, medium] in dollars, weeks −11 … 0
  const weeks: [number, number][] = [
    [160, 160],
    [160, 320],
    [0, 320],
    [160, 320],
    [320, 320],
    [320, 480],
    [160, 160],
    [160, 205],
    [160, 205],
    [160, 365],
    [320, 365],
    [320, 365],
  ];
  return weeks.map(([high, medium], i) => ({
    weekStart: riskWeekStart(isoAgo((weeks.length - 1 - i) * 7, now)),
    currency: 'usd',
    highCents: high * 100,
    mediumCents: medium * 100,
    members: Math.round(high / 160) + Math.max(1, Math.round(medium / 160)),
  }));
}
