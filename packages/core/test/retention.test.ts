import { describe, expect, it } from 'vitest';
import {
  activityFromRow,
  buildTriage,
  checkInRequestText,
  keptSummary,
  memberStatus,
  membersToTalkTo,
  reasonText,
  toSignals,
  type Intervention,
  type MemberActivity,
} from '../src';
import { DEMO_CLIENTS, demoInterventions, demoMemberActivity, demoRetentionSubscriptions } from '../src/demo';

const today = '2026-10-21';
const NOW = Date.parse(`${today}T12:00:00Z`);

const activity = (over: Partial<MemberActivity> = {}): MemberActivity => ({
  clientId: 'c1',
  name: 'Ana',
  planName: 'Online coaching',
  coachId: null,
  weeks: Array.from({ length: 4 }, () => ({ planned: 3, done: 3 })),
  lastAppOpenAt: '2026-10-20T08:00:00Z',
  lastSessionAt: '2026-10-19T08:00:00Z',
  easeReadsRecent: 0,
  easeReadsBefore: 0,
  checkInsMissed: 0,
  joinedAt: '2026-01-10T09:00:00Z',
  subscription: { clientId: 'c1', planKind: 'monthly', priceCents: 16000, status: 'active', startedAt: '2026-01-10', trialEndsAt: null, canceledAt: null },
  ...over,
});

describe('toSignals', () => {
  it('turns timestamps into days and reads payment status from the subscription', () => {
    const s = toSignals(activity({ lastAppOpenAt: '2026-10-11T08:00:00Z', subscription: { ...activity().subscription!, status: 'past_due' } }), today);
    expect(s.daysSinceLastOpen).toBe(10);
    expect(s.daysSinceLastSession).toBe(2);
    expect(s.paymentIssue).toBe(true);
    expect(s.tenureDays).toBe(284);
  });
  it('keeps unknowns as null', () => {
    const s = toSignals(activity({ lastAppOpenAt: null, lastSessionAt: null }), today);
    expect(s.daysSinceLastOpen).toBeNull();
    expect(s.daysSinceLastSession).toBeNull();
  });
});

describe('membersToTalkTo', () => {
  it('leaves out steady members, paused members and members too new to read', () => {
    const r = membersToTalkTo(
      [
        activity(),
        activity({ clientId: 'p', subscription: { ...activity().subscription!, clientId: 'p', status: 'paused' }, lastAppOpenAt: null }),
        activity({ clientId: 'n', joinedAt: '2026-10-15T09:00:00Z', lastAppOpenAt: null }),
      ],
      today,
    );
    expect(r.members).toEqual([]);
    expect(r.tooNew).toBe(1);
    expect(r.considered).toBe(2);
  });

  it('sorts by level, then by yearly value, and shows no yearly figure for session packs', () => {
    const dropped = { weeks: [{ planned: 3, done: 3 }, { planned: 3, done: 3 }, { planned: 3, done: 0 }, { planned: 3, done: 0 }] };
    const r = membersToTalkTo(
      [
        activity({ clientId: 'med-cheap', name: 'Med cheap', ...dropped, subscription: { ...activity().subscription!, priceCents: 9000 } }),
        activity({ clientId: 'med-dear', name: 'Med dear', ...dropped }),
        activity({ clientId: 'high-pack', name: 'High pack', ...dropped, lastAppOpenAt: '2026-10-01T00:00:00Z', subscription: { ...activity().subscription!, planKind: 'session_pack', priceCents: 64000 } }),
      ],
      today,
    );
    expect(r.members.map((m) => m.clientId)).toEqual(['high-pack', 'med-dear', 'med-cheap']);
    expect(r.members[0]!.yearlyCents).toBeNull();
    expect(r.members[1]!.yearlyCents).toBe(192000);
    expect(r.members[2]!.yearlyCents).toBe(108000);
  });

  it('flags the demo members the way the demo describes', () => {
    const r = membersToTalkTo(demoMemberActivity(NOW), today);
    const by = Object.fromEntries(r.members.map((m) => [m.name, m.risk.level]));
    expect(by['Chris Lindqvist']).toBe('high');
    expect(by['Priya Natarajan']).toBe('medium');
    // Mei's rough weeks show up only through what Mei shared with the coach (atrisk.ts), never here.
    expect(by['Mei Tanaka']).toBeUndefined();
    expect(r.members[0]!.name).toBe('Chris Lindqvist');
    expect(r.members.some((m) => m.name.startsWith('Daniel'))).toBe(false); // paused
  });
});

describe('check-in requests', () => {
  it('is worded as a request with the reason, never as risk', () => {
    const text = checkInRequestText('Maya', 'No session in 12 days');
    expect(text).toBe('Maya asked you to check in: no session in 12 days');
    expect(text).not.toMatch(/churn|risk/i);
  });
  it('shows the request text in the coach list, above messages and missed sessions', () => {
    const since = new Date(NOW).toISOString();
    const rows = buildTriage(
      [
        { id: '1', clientId: 'c', reason: 'unread_message', since, snoozedUntil: null, handledAt: null },
        { id: '2', clientId: 'c', reason: 'check_in_request', detail: 'Maya asked you to check in: payment failed', since, snoozedUntil: null, handledAt: null },
      ],
      NOW,
    );
    expect(reasonText(rows[0]!.top)).toBe('Maya asked you to check in: payment failed');
  });
});

describe('keptSummary', () => {
  const base: Intervention = {
    id: 'i',
    clientId: 'c1',
    clientName: 'Ana',
    coachId: 'k',
    coachName: 'Leo',
    reason: 'No session in 12 days',
    note: null,
    requestedOn: '2026-05-01',
    doneOn: '2026-05-02',
    action: 'call',
    actionNote: null,
    monthlyCents: 16000,
  };

  it('counts kept only after 60 days still active, and adds up monthly × 12', () => {
    const s = keptSummary(
      [
        base,
        { ...base, id: 'j', clientId: 'c2', doneOn: '2026-09-01' }, // 50 days: pending
        { ...base, id: 'k', clientId: 'c3' }, // left
        { ...base, id: 'w', clientId: 'c4', doneOn: null }, // coach hasn't checked in yet
        { ...base, id: 'old', doneOn: '2025-06-01', requestedOn: '2025-06-01' }, // last year
      ],
      { c1: { active: true, leftOn: null }, c2: { active: true, leftOn: null }, c3: { active: false, leftOn: '2026-06-10' }, c4: { active: true, leftOn: null } },
      2026,
      today,
    );
    expect(s.kept.map((r) => r.id)).toEqual(['i']);
    expect(s.pending.map((r) => r.id)).toEqual(['j']);
    expect(s.left.map((r) => r.id)).toEqual(['k']);
    expect(s.waiting.map((r) => r.id)).toEqual(['w']);
    expect(s.keptYearlyCents).toBe(192000);
  });

  it('flips from pending to kept on day 60 exactly', () => {
    const at = (d: string) => keptSummary([{ ...base, doneOn: '2026-08-22' }], { c1: { active: true, leftOn: null } }, 2026, d);
    expect(at('2026-10-20').pending).toHaveLength(1);
    expect(at('2026-10-21').kept).toHaveLength(1);
  });

  it('gives the demo three kept members worth ≈ $5,760 a year', () => {
    const s = keptSummary(demoInterventions(NOW), memberStatus(demoRetentionSubscriptions(NOW)), 2026, today);
    expect(s.kept).toHaveLength(3);
    expect(s.keptYearlyCents).toBe(576000);
    expect(s.left.map((r) => r.clientName)).toEqual(['Sam Whitford']);
    expect(s.pending).toHaveLength(1);
  });
});

describe('memberStatus', () => {
  it('treats past-due as still a member and cancelled as left on the cancel date', () => {
    const sub = { planKind: 'monthly' as const, priceCents: 1, startedAt: '2026-01-01', trialEndsAt: null };
    const s = memberStatus([
      { ...sub, clientId: 'a', status: 'past_due', canceledAt: null },
      { ...sub, clientId: 'b', status: 'canceled', canceledAt: '2026-07-04T10:00:00Z' },
      { ...sub, clientId: 'c', status: 'canceled', canceledAt: '2026-01-04T10:00:00Z' },
      { ...sub, clientId: 'c', status: 'active', canceledAt: null },
    ]);
    expect(s).toEqual({ a: { active: true, leftOn: null }, b: { active: false, leftOn: '2026-07-04' }, c: { active: true, leftOn: null } });
  });
  it('covers every demo client', () => {
    const s = memberStatus(demoRetentionSubscriptions(NOW));
    for (const c of DEMO_CLIENTS) expect(s[c.id]).toBeDefined();
  });
});

describe('activityFromRow', () => {
  it('maps a members_at_risk row, with or without a subscription', () => {
    const row = {
      client_id: 'c', full_name: 'Ana', coach_id: null, joined_at: '2026-01-01T00:00:00Z', weeks: null,
      last_app_open_at: null, last_session_at: null, ease_reads_recent: 0, ease_reads_before: 0, check_ins_missed: 2,
      plan_name: 'Online coaching', plan_kind: 'monthly' as const, price_cents: 16000, discount_cents: 0, duration_weeks: null,
      sub_status: 'past_due' as const, started_at: '2026-01-01T00:00:00Z', trial_ends_at: null, canceled_at: null,
    };
    const a = activityFromRow(row);
    expect(a.subscription?.status).toBe('past_due');
    expect(a.weeks).toEqual([]);
    expect(activityFromRow({ ...row, plan_kind: null, sub_status: null, price_cents: null }).subscription).toBeNull();
  });
});
