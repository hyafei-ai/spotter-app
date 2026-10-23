import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_STARTERS,
  ageOn,
  capabilityProgress,
  capabilityWins,
  densityBests,
  eraAnchors,
  eraBests,
  healthMarkerWins,
  holdingStrong,
  recentRepBests,
  volumeBests,
  weeklyWins,
  winsToMention,
  type CapabilityGoal,
  type MastersInput,
  type MastersSession,
} from '../src/masters';
import type { WearableDay } from '../src/physiology';
import { DEMO_JORDAN_ID, DEMO_MEI_ID, demoMastersInput, demoWins } from '../src/demo/patterns';

const DAY = 86_400_000;
const add = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const TODAY = '2026-10-23';

/** A squat session at an estimated max of `e1rm` (sets of 5). */
const sq = (date: string, e1rm: number, over: Partial<MastersSession> = {}): MastersSession => ({
  date,
  feel: 4,
  sets: [0, 1, 2].map(() => ({ exerciseId: 'back-squat', weightKg: Math.round((e1rm / (1 + 5 / 30)) * 10) / 10, reps: 5, rpe: null })),
  ...over,
});

/** Twice a week from `weeksAgo` to last week, e1RM from `e(weeksAgo)`. */
function weekly(weeks: number, e: (w: number) => number): MastersSession[] {
  const out: MastersSession[] = [];
  for (let w = weeks; w >= 1; w--) out.push(sq(add(TODAY, -w * 7), e(w)), sq(add(TODAY, -w * 7 + 3), e(w)));
  return out;
}

describe('era bests', () => {
  it('anchors: 2 years, a year, this year, turning 50, coach start (oldest first, past only)', () => {
    const a = eraAnchors({ birthDate: '1974-03-10', coachStart: '2026-02-01' }, TODAY);
    expect(a.map((x) => x.words)).toEqual(['since turning 50', 'in 2 years', 'in a year', 'this year', 'since starting coaching']);
    expect(eraAnchors({ birthDate: '1990-01-01' }, TODAY).some((x) => /turning/.test(x.words))).toBe(false);
  });
  it('ageOn counts birthdays', () => {
    expect(ageOn('1974-10-24', TODAY)).toBe(51);
    expect(ageOn('1974-10-23', TODAY)).toBe(52);
  });
  it('best in 2 years when an older best exists', () => {
    // 100 kg more than two years ago (and since turning 50), 90 since, 93 this week.
    const sessions = [...weekly(130, (w) => (w > 105 ? 100 : 90)), sq(add(TODAY, -2), 93)];
    const wins = eraBests({ sessions, birthDate: '1974-03-10' }, TODAY);
    expect(wins).toHaveLength(1);
    expect(wins[0]!.coachText).toBe('Best Back Squat in 2 years (93 kg est. max)');
  });
  it('picks the oldest anchor that holds', () => {
    // Since turning 50 (Mar 2024) the best was 95, broken now; within 2 years (from Oct 2024) only 90.
    const sessions = [...weekly(150, (w) => (w > 140 ? 110 : w > 95 ? 95 : 90)), sq(add(TODAY, -2), 96)];
    expect(eraBests({ sessions, birthDate: '1974-03-10' }, TODAY)[0]!.text).toBe('Your best Back Squat since turning 50: about 96 kg estimated max');
  });
  it('nothing for an all-time best (that is a raw PR) or with no earlier history', () => {
    expect(eraBests({ sessions: [...weekly(60, () => 90), sq(add(TODAY, -2), 120)] }, TODAY)).toEqual([]);
    expect(eraBests({ sessions: [sq(add(TODAY, -2), 90)] }, TODAY)).toEqual([]);
  });
});

describe('holding strong', () => {
  it('8+ weeks within 3% of the 12-week best is a win', () => {
    const wins = holdingStrong({ sessions: weekly(10, (w) => 100 - (w % 2)) }, TODAY);
    expect(wins).toHaveLength(1);
    // Sessions from 10 weeks ago to 4 days ago span 11 of the 7-day blocks ending today.
    expect(wins[0]!.coachText).toBe('Back Squat strength held for 11 weeks');
    expect(wins[0]!.text).toBe('Held your Back Squat strength for 11 weeks');
  });
  it('a drop of more than 3% ends the streak', () => {
    expect(holdingStrong({ sessions: weekly(10, (w) => (w === 4 || w === 5 ? 90 : 100)) }, TODAY)).toEqual([]);
  });
  it('under 8 weeks is not yet a win; two missed weeks end it', () => {
    expect(holdingStrong({ sessions: weekly(6, () => 100) }, TODAY)).toEqual([]);
    const gap = weekly(12, () => 100).filter((s) => !(s.date > add(TODAY, -53) && s.date < add(TODAY, -28)));
    expect(holdingStrong({ sessions: gap }, TODAY)).toEqual([]);
  });
});

describe('rep, volume and density bests', () => {
  it('rep bests from the last 4 weeks', () => {
    const s = [
      ...[60, 50, 40].map((d) => ({ date: add(TODAY, -d), feel: 4, sets: [{ exerciseId: 'romanian-deadlift', weightKg: 50, reps: 8, rpe: null }] })),
      { date: add(TODAY, -3), feel: 4, sets: [{ exerciseId: 'romanian-deadlift', weightKg: 50, reps: 10, rpe: null }] },
    ];
    expect(recentRepBests({ sessions: s }, TODAY)[0]!.coachText).toBe('Romanian Deadlift: 10 reps at 50 kg, most at that weight');
  });
  it('biggest week in N weeks needs 8+ weeks beaten', () => {
    const sessions = [...weekly(10, () => 100), sq(add(TODAY, -1), 100), sq(add(TODAY, -5), 100), sq(add(TODAY, -3), 100)];
    const w = volumeBests({ sessions }, TODAY).find((x) => x.kind === 'volume_week')!;
    expect(w.coachText).toMatch(/^Biggest week on record: \d/);
    expect(volumeBests({ sessions: weekly(5, () => 100) }, TODAY).filter((x) => x.kind === 'volume_week')).toEqual([]);
  });
  it('most hard sets in a session', () => {
    const big = sq(add(TODAY, -1), 100);
    big.sets = [...big.sets, ...big.sets, ...big.sets];
    const w = volumeBests({ sessions: [...weekly(6, () => 100), big] }, TODAY).find((x) => x.kind === 'session_sets')!;
    expect(w.coachText).toBe('Most hard sets in a session in 13 sessions: 9');
  });
  it('density: the same work in 10%+ less time', () => {
    const sessions = [sq(add(TODAY, -20), 100, { durationMin: 60, title: 'Lower A' }), sq(add(TODAY, -2), 100, { durationMin: 50, title: 'Lower A' })];
    expect(densityBests({ sessions }, TODAY)[0]!.coachText).toMatch(/^Same Lower A work as \d+ \w+, 10 min faster$/);
    sessions[1]!.durationMin = 57;
    expect(densityBests({ sessions }, TODAY)).toEqual([]);
  });
});

describe('capability goals', () => {
  const goal = (history: [number, number][], over: Partial<CapabilityGoal> = {}): CapabilityGoal => ({
    id: 'g',
    title: 'Farmer carry, bodyweight total',
    unit: 'm',
    target: 40,
    direction: 'up',
    history: history.map(([d, value]) => ({ date: add(TODAY, d), value })),
    ...over,
  });
  it('starter goals carry no population norms', () => {
    expect(CAPABILITY_STARTERS.map((g) => g.id)).toEqual(['farmer-carry-bodyweight', 'single-leg-balance', 'floor-to-stand', 'dead-hang', 'sit-and-reach']);
    expect(CAPABILITY_STARTERS.find((g) => g.id === 'dead-hang')!.suggestedTarget).toBeNull();
  });
  it('progress text toward the target', () => {
    expect(capabilityProgress(goal([[-30, 20], [-3, 32]]))).toMatchObject({ latest: 32, best: 32, reached: false, pct: 80, text: '32 of 40 m' });
    expect(capabilityProgress(goal([[-3, 41]])).text).toBe('Reached: 41 m');
    expect(capabilityProgress(goal([], {})).text).toBe('No attempts logged yet');
    expect(capabilityProgress(goal([[-3, 1]], { unit: 'yes_no', target: 1, title: 'Floor to standing without hands' })).text).toBe('Done');
    expect(capabilityProgress(goal([[-3, 50], [-1, 44]], { unit: 's', direction: 'down', target: 45 })).text).toBe('Reached: 44 s');
  });
  it('wins: target reached for the first time, or a new best, in the last 4 weeks', () => {
    const input = (g: CapabilityGoal): MastersInput => ({ sessions: [], goals: [g] });
    expect(capabilityWins(input(goal([[-60, 30], [-2, 41]])), TODAY)[0]!.coachText).toBe('Goal reached: Farmer carry, bodyweight total (41 m)');
    expect(capabilityWins(input(goal([[-60, 30], [-2, 35]])), TODAY)[0]!.coachText).toBe('Farmer carry, bodyweight total: new best (35 m of 40)');
    expect(capabilityWins(input(goal([[-60, 30], [-40, 35]])), TODAY)).toEqual([]);
    expect(capabilityWins(input(goal([[-60, 30], [-2, 25]])), TODAY)).toEqual([]);
  });
});

describe('health-marker wins', () => {
  /** 120 days of watch data; `p` runs 0 → 1 from oldest to today. */
  const days = (f: (p: number, i: number) => Partial<WearableDay>): WearableDay[] =>
    Array.from({ length: 120 }, (_, i) => ({ date: add(TODAY, i - 119), sleepHours: 7, hrvMs: 40, restingHr: 60, activeKcal: 400, source: 'apple_health' as const, ...f(i / 119, i) }));

  it('resting HR down 3+ bpm, HRV baseline up 5%+, steadier sleep', () => {
    const w = days((p, i) => ({ restingHr: Math.round(64 - 10 * p), hrvMs: 36 + 6 * p, sleepHours: 7 + (i % 2 ? 1 : -1) * (1 - 0.7 * p) }));
    const kinds = healthMarkerWins({ sessions: [], wearables: w }, TODAY).map((x) => x.coachText);
    expect(kinds).toEqual([expect.stringMatching(/^Resting HR down \d bpm in 8 weeks$/), expect.stringMatching(/^HRV baseline up \d+% in 8 weeks$/), expect.stringMatching(/^Sleep steadier: nightly swing/)]);
  });
  it('nothing when steady, or with too few readings', () => {
    expect(healthMarkerWins({ sessions: [], wearables: days(() => ({})) }, TODAY)).toEqual([]);
    expect(healthMarkerWins({ sessions: [], wearables: days((p) => ({ restingHr: 70 - 10 * p })).slice(-20) }, TODAY)).toEqual([]);
  });
  it('never compares across sources', () => {
    // The last 19 days came from another source: the main source has no recent readings, so no claim.
    const w = days((p) => ({ restingHr: 64 - 10 * p })).map((d, i) => (i > 100 ? { ...d, source: 'health_connect' as const } : d));
    expect(healthMarkerWins({ sessions: [], wearables: w }, TODAY).some((x) => x.kind === 'resting_hr')).toBe(false);
    expect(healthMarkerWins({ sessions: [], wearables: w.slice(0, 101) }, add(TODAY, -19)).some((x) => x.kind === 'resting_hr')).toBe(true);
  });
});

describe('winsToMention and weeklyWins', () => {
  const now = new Date(2026, 9, 23, 12);
  it('Mei (52, MOCK): flat raw strength, but a top 3 of different kinds', () => {
    const { mention, week } = demoWins(DEMO_MEI_ID, now);
    expect(mention).toHaveLength(3);
    expect(new Set(mention.map((w) => w.kind)).size).toBe(3);
    expect(mention[0]!.kind).toBe('capability_reached');
    const kinds = new Set(week.map((w) => w.kind));
    for (const k of ['era_best', 'holding_strong', 'rep_best', 'volume_week', 'density', 'resting_hr', 'hrv_baseline']) expect(kinds.has(k as never)).toBe(true);
    for (const w of mention) expect(w.coachText).not.toMatch(/\b(she|he|her|his|him)\b/i);
  });
  it('Jordan (41, MOCK) has a few wins too', () => {
    expect(demoWins(DEMO_JORDAN_ID, now).mention.length).toBeGreaterThanOrEqual(2);
  });
  it('weeklyWins only covers the last 7 days', () => {
    const input = demoMastersInput(DEMO_MEI_ID, now)!;
    const today = '2026-10-23';
    expect(weeklyWins(input, today).every((w) => w.date >= '2026-10-17')).toBe(true);
    expect(winsToMention({ sessions: [] }, today)).toEqual([]);
  });
});
