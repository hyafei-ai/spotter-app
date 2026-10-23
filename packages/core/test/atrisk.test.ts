import { describe, expect, it } from 'vitest';
import {
  COACH_LEVEL_TEXT,
  OWNER_NEUTRAL_REASON,
  RISK_POINTS_TABLE,
  athleteDropoutRisk,
  atRiskRoster,
  engagementPoints,
  memberRisk,
  mrrAtRisk,
  mrrAtRiskTrend,
  mrrFromRow,
  mrrKept,
  ownerRoster,
  ownerView,
  riskWeekStart,
  toSignals,
  type Intervention,
  type MemberActivity,
  type PhysiologyInput,
} from '../src';
import { DEMO_CLIENTS, demoMemberActivity, demoMrrSnapshots, demoPhysiology } from '../src/demo';

const today = '2026-10-23';
const NOW = Date.parse(`${today}T12:00:00Z`);

const activity = (over: Partial<MemberActivity> = {}): MemberActivity => ({
  clientId: 'c1',
  name: 'Ana',
  planName: 'Online coaching',
  coachId: null,
  weeks: Array.from({ length: 4 }, () => ({ planned: 3, done: 3 })),
  lastAppOpenAt: '2026-10-22T08:00:00Z',
  lastSessionAt: '2026-10-21T08:00:00Z',
  easeReadsRecent: 0,
  easeReadsBefore: 0,
  checkInsMissed: 0,
  joinedAt: '2026-01-10T09:00:00Z',
  subscription: { clientId: 'c1', planKind: 'monthly', priceCents: 16000, status: 'active', startedAt: '2026-01-10', trialEndsAt: null, canceledAt: null },
  ...over,
});
const quiet: PhysiologyInput = { fuelLevel: null, painOngoing: false, progressStalled: false, runningTired: false };
const physio = (over: Partial<PhysiologyInput> = {}): PhysiologyInput => ({ ...quiet, ...over });

describe('athleteDropoutRisk', () => {
  it('is memberRisk (without easy-day reads) when nothing is shared', () => {
    const a = activity({ lastSessionAt: '2026-10-10T08:00:00Z', checkInsMissed: 2 });
    const r = athleteDropoutRisk(a, null, today);
    const base = memberRisk(toSignals(a, today));
    expect(r.points).toBe(base.points);
    expect(r.level).toBe(base.level);
    expect(new Set(r.reasons)).toEqual(new Set(base.reasons));
    expect(r.factors.every((f) => f.kind === 'engagement')).toBe(true);
  });

  it('adds transparent points for each shared physiology signal', () => {
    expect(athleteDropoutRisk(activity(), physio({ runningTired: true }), today).points).toBe(2);
    expect(athleteDropoutRisk(activity(), physio({ fuelLevel: 'talk_to_someone' }), today).points).toBe(2);
    expect(athleteDropoutRisk(activity(), physio({ fuelLevel: 'watch' }), today).points).toBe(1);
    expect(athleteDropoutRisk(activity(), physio({ fuelLevel: 'none' }), today).points).toBe(0);
    expect(athleteDropoutRisk(activity(), physio({ painOngoing: true }), today).points).toBe(2);
    expect(athleteDropoutRisk(activity(), physio({ progressStalled: true }), today).points).toBe(1);
  });

  it('uses the same thresholds as memberRisk: 3–4 medium, 5+ high', () => {
    expect(athleteDropoutRisk(activity(), physio({ runningTired: true }), today).level).toBe('low');
    expect(athleteDropoutRisk(activity(), physio({ runningTired: true, progressStalled: true }), today).level).toBe('medium');
    expect(athleteDropoutRisk(activity(), physio({ runningTired: true, painOngoing: true }), today).level).toBe('medium');
    expect(athleteDropoutRisk(activity(), physio({ runningTired: true, painOngoing: true, progressStalled: true }), today).level).toBe('high');
  });

  it('writes reasons in coach language, specific when detail is there', () => {
    const general = athleteDropoutRisk(activity(), physio({ runningTired: true, fuelLevel: 'talk_to_someone', painOngoing: true, progressStalled: true }), today);
    expect(general.reasons).toEqual(['Running tired most of this week', 'Fuel check flagged', 'Ongoing pain logged', 'No new best in 8 weeks']);
    const specific = athleteDropoutRisk(
      activity(),
      physio({ runningTired: true, tiredDays: 5, painOngoing: true, pain: { region: 'knee', side: null, days: 4 }, progressStalled: true, weeksSinceBest: 11 }),
      today,
    );
    expect(specific.reasons).toEqual(['Running tired 5 of the last 7 days', 'Knee pain for 4 days', 'No new best in 11 weeks']);
    expect(athleteDropoutRisk(activity(), physio({ painOngoing: true, pain: { region: 'lower_back', side: 'left', days: 1 } }), today).reasons).toEqual([
      'Left lower back pain for 1 day',
    ]);
    for (const r of [...general.reasons, ...specific.reasons]) expect(r).not.toMatch(/churn|risk/i);
  });

  it('orders reasons strongest first and keeps the +1 for new members once', () => {
    const r = athleteDropoutRisk(activity({ joinedAt: '2026-09-15T09:00:00Z', checkInsMissed: 2 }), physio({ progressStalled: true, runningTired: true }), today);
    expect(r.reasons[0]).toBe('Running tired most of this week');
    expect(r.reasons.filter((x) => x === 'In their first two months')).toHaveLength(1);
    expect(r.points).toBe(1 + 1 + 2 + 1); // missed, tenure, tired, stalled
    // Physiology alone also earns the new-member point.
    const p = athleteDropoutRisk(activity({ joinedAt: '2026-09-15T09:00:00Z' }), physio({ runningTired: true }), today);
    expect(p.points).toBe(3);
    expect(p.level).toBe('medium');
  });

  it('ignores easy-day reads on the engagement side (they count only as shared "running tired")', () => {
    const a = activity({ easeReadsRecent: 6, easeReadsBefore: 1 });
    expect(memberRisk(toSignals(a, today)).points).toBe(0); // owner path drops them too
    expect(athleteDropoutRisk(a, null, today).points).toBe(0);
  });

  it('knows the points behind every memberRisk reason', () => {
    const r = memberRisk({
      weeks: [{ planned: 4, done: 4 }, { planned: 4, done: 4 }, { planned: 4, done: 1 }, { planned: 4, done: 0 }],
      daysSinceLastOpen: 9,
      daysSinceLastSession: 12,
      easeReadsRecent: 5,
      easeReadsBefore: 1,
      checkInsMissed: 3,
      paymentIssue: true,
      tenureDays: 30,
    });
    expect(r.reasons.reduce((n, x) => n + engagementPoints(x), 0)).toBe(r.points);
  });
});

describe('ownerView', () => {
  it('replaces every physiology reason with one neutral line and keeps engagement reasons', () => {
    const risk = athleteDropoutRisk(
      activity({ lastSessionAt: '2026-10-10T08:00:00Z' }),
      physio({ runningTired: true, fuelLevel: 'talk_to_someone', painOngoing: true, pain: { region: 'knee', side: 'left', days: 4 }, progressStalled: true }),
      today,
    );
    const owner = ownerView(risk);
    expect(owner.level).toBe(risk.level);
    expect(owner.points).toBe(risk.points);
    expect(owner.reasons.filter((r) => r === OWNER_NEUTRAL_REASON)).toHaveLength(1);
    expect(owner.reasons).toContain('No session in 13 days');
    const text = owner.reasons.join(' ').toLowerCase();
    for (const word of ['tired', 'fuel', 'pain', 'knee', 'best', 'cycle', 'sleep', 'period']) expect(text).not.toContain(word);
    expect(owner.factors.reduce((n, f) => n + f.points, 0)).toBe(owner.points);
  });

  it('adds nothing when no physiology was shared', () => {
    const risk = athleteDropoutRisk(activity({ checkInsMissed: 2 }), null, today);
    expect(ownerView(risk).reasons).toEqual(risk.reasons);
  });
});

describe('rosters', () => {
  const now = NOW;
  const act = demoMemberActivity(now).map((a) => ({ ...a, currency: 'usd' }));
  const c = DEMO_CLIENTS;

  it('coach roster: high then medium, physiology reasons for what was shared', () => {
    const roster = atRiskRoster(act, demoPhysiology(), today);
    expect(roster.map((m) => [m.name, m.risk.level])).toEqual([
      ['Mei Tanaka', 'high'],
      ['Chris Lindqvist', 'high'],
      ['Aisha Bello', 'medium'],
      ['Priya Natarajan', 'medium'],
    ]);
    expect(roster[0]!.risk.reasons.slice(0, 2)).toEqual(['Running tired 5 of the last 7 days', 'Fuel check flagged']);
    expect(roster[2]!.risk.reasons).toEqual(['Left shoulder pain for 5 days', 'No new best in 9 weeks']);
    // Priya shares nothing: engagement only.
    expect(roster[3]!.risk.factors.every((f) => f.kind === 'engagement')).toBe(true);
    // Tomás is too new, Daniel is paused.
    expect(roster.find((m) => m.clientId === c[2]!.id || m.clientId === c[6]!.id)).toBeUndefined();
  });

  it('owner roster: same members and levels, no health detail anywhere', () => {
    const owner = ownerRoster(act, demoPhysiology(), today);
    expect(owner.map((m) => m.name).sort()).toEqual(['Aisha Bello', 'Chris Lindqvist', 'Mei Tanaka', 'Priya Natarajan']);
    const text = JSON.stringify(owner.map((m) => m.risk)).toLowerCase();
    for (const word of ['tired', 'fuel', 'shoulder', 'pain', 'best']) expect(text).not.toContain(word);
    expect(owner.find((m) => m.name === 'Aisha Bello')!.risk.reasons).toEqual([OWNER_NEUTRAL_REASON]);
  });

  it('coach copy never says churn or risk', () => {
    for (const t of Object.values(COACH_LEVEL_TEXT)) expect(t).not.toMatch(/churn|risk/i);
  });
});

describe('mrrAtRisk', () => {
  it('splits high and medium and counts members', () => {
    const rows = mrrAtRisk([
      { monthlyCents: 16000, level: 'high', currency: 'usd' },
      { monthlyCents: 19500, level: 'medium', currency: 'usd' },
      { monthlyCents: 0, level: 'medium', currency: 'usd' },
      { monthlyCents: 99999, level: 'low', currency: 'usd' },
    ]);
    expect(rows).toEqual([{ currency: 'usd', highCents: 16000, mediumCents: 19500, totalCents: 35500, count: 3, highCount: 1, mediumCount: 2 }]);
  });

  it('never adds across currencies', () => {
    const rows = mrrAtRisk([
      { monthlyCents: 16000, level: 'high', currency: 'usd' },
      { monthlyCents: 20000, level: 'high', currency: 'gbp' },
      { monthlyCents: 5000, level: 'medium', currency: 'gbp' },
    ]);
    expect(rows.map((r) => [r.currency, r.totalCents])).toEqual([
      ['gbp', 25000],
      ['usd', 16000],
    ]);
  });

  it('is empty when nobody is high or medium', () => {
    expect(mrrAtRisk([{ monthlyCents: 16000, level: 'low', currency: 'usd' }])).toEqual([]);
  });

  it('reads database rows', () => {
    expect(mrrFromRow({ currency: 'eur', high_cents: 100, medium_cents: 50, total_cents: 150, members: 2, high_members: 1, medium_members: 1 }).totalCents).toBe(150);
  });
});

describe('mrrAtRiskTrend', () => {
  it('weeks start on Monday', () => {
    expect(riskWeekStart('2026-10-23')).toBe('2026-10-19'); // Friday
    expect(riskWeekStart('2026-10-19')).toBe('2026-10-19');
    expect(riskWeekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
  });

  it('gives exactly 12 weeks per currency, gaps as null, this week from the live figure', () => {
    const snaps = [
      { weekStart: '2026-08-03', currency: 'usd', highCents: 16000, mediumCents: 0, members: 1 },
      { weekStart: '2026-10-12', currency: 'usd', highCents: 16000, mediumCents: 16000, members: 2 },
      { weekStart: '2026-10-19', currency: 'usd', highCents: 1, mediumCents: 1, members: 9 },
      { weekStart: '2026-10-12', currency: 'gbp', highCents: 9000, mediumCents: 0, members: 1 },
    ];
    const live = mrrAtRisk([{ monthlyCents: 48000, level: 'high', currency: 'usd' }]);
    const trend = mrrAtRiskTrend(snaps, today, { current: live });
    expect(trend.map((t) => t.currency)).toEqual(['gbp', 'usd']);
    const usd = trend.find((t) => t.currency === 'usd')!;
    expect(usd.points).toHaveLength(12);
    expect(usd.points[0]!.weekStart).toBe('2026-08-03');
    expect(usd.points[11]!.totalCents).toBe(48000);
    expect(usd.points[5]!.totalCents).toBeNull();
    expect(usd.changeCents).toBe(48000 - 16000);
    // GBP has no live members this week: zero, not missing.
    expect(trend.find((t) => t.currency === 'gbp')!.points[11]!.totalCents).toBe(0);
  });

  it('demo snapshots cover 12 weeks', () => {
    const trend = mrrAtRiskTrend(demoMrrSnapshots(NOW), today);
    expect(trend).toHaveLength(1);
    expect(trend[0]!.points.every((p) => p.totalCents != null)).toBe(true);
  });
});

describe('mrrKept', () => {
  const iv = (over: Partial<Intervention & { currency: string }>): Intervention & { currency?: string } => ({
    id: 'i1',
    clientId: 'c1',
    clientName: 'Ana',
    coachId: 'k1',
    coachName: 'Leo Park',
    reason: 'No session in 12 days',
    note: null,
    requestedOn: '2026-03-01',
    doneOn: '2026-03-02',
    action: 'call',
    actionNote: null,
    monthlyCents: 16000,
    ...over,
  });

  it('sums the monthly value of members still active 60 days after the check-in, per currency', () => {
    const rows = mrrKept(
      [
        iv({}),
        iv({ id: 'i2', clientId: 'c2', currency: 'gbp', monthlyCents: 12000 }),
        iv({ id: 'i3', clientId: 'c3', doneOn: '2026-10-01' }), // pending
        iv({ id: 'i4', clientId: 'c4' }), // left
        iv({ id: 'i5', clientId: 'c5', doneOn: null }), // not done
        iv({ id: 'i6', clientId: 'c1', doneOn: '2026-05-01' }), // same member again: counted once
      ],
      {
        c1: { active: true, leftOn: null },
        c2: { active: true, leftOn: null },
        c3: { active: true, leftOn: null },
        c4: { active: false, leftOn: '2026-06-01' },
        c5: { active: true, leftOn: null },
      },
      today,
      { year: 2026 },
    );
    expect(rows).toEqual([
      { currency: 'usd', monthlyCents: 16000, count: 1 },
      { currency: 'gbp', monthlyCents: 12000, count: 1 },
    ]);
  });

  it('filters by the year the check-in was done', () => {
    expect(mrrKept([iv({ doneOn: '2025-03-02' })], { c1: { active: true, leftOn: null } }, today, { year: 2026 })).toEqual([]);
  });
});

describe('points table', () => {
  it('lists every physiology signal as neutral for the owner', () => {
    expect(RISK_POINTS_TABLE.filter((r) => r.owner === 'neutral')).toHaveLength(5);
  });
});
