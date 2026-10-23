/*
 * MOCK DATA — member activity and coach check-ins for the Maya Reyes Strength demo tenant.
 * Everything here is invented for the preview build. It runs through the same functions as real
 * data (membersToTalkTo, keptSummary), so the numbers on screen are computed, not typed in.
 */
import { monthlyRevenueCents, type SubscriptionLike } from '../grow';
import type { Intervention, MemberActivity } from '../retention';
import { DEMO_CLIENTS } from './coach';
import { DEMO_PLANS, demoSubscriptions } from './grow';

const DAY = 86_400_000;
const daysAgo = (d: number, now: number) => new Date(now - d * DAY).toISOString();
const dateAgo = (d: number, now: number) => daysAgo(d, now).slice(0, 10);

const DEMO_OWNER_ID = '0192f0a4-0000-7000-8000-000000000001';
const DEMO_ASSISTANT_ID = '0192f0a4-0000-7000-8000-000000000002';

type Shape = Omit<MemberActivity, 'clientId' | 'name' | 'planName' | 'coachId' | 'subscription' | 'joinedAt' | 'lastAppOpenAt' | 'lastSessionAt'> & {
  openedDaysAgo: number | null;
  sessionDaysAgo: number | null;
};

const steady = (planned: number, done: number) => Array.from({ length: 4 }, () => ({ planned, done }));

/**
 * One row per demo client. Chris has dropped off (high) and Priya's card failed with check-ins
 * skipped (medium). Mei has had a rough few weeks: easy-day reads come from the athlete daily check,
 * so they reach only the coach (as shared "running tired"), never the owner's list.
 */
const SHAPES: Shape[] = [
  { weeks: steady(3, 3), openedDaysAgo: 1, sessionDaysAgo: 7, easeReadsRecent: 0, easeReadsBefore: 0, checkInsMissed: 0 },
  { weeks: steady(4, 3), openedDaysAgo: 1, sessionDaysAgo: 1, easeReadsRecent: 1, easeReadsBefore: 1, checkInsMissed: 2 },
  { weeks: [{ planned: 0, done: 0 }, { planned: 0, done: 0 }, { planned: 0, done: 0 }, { planned: 2, done: 0 }], openedDaysAgo: 0, sessionDaysAgo: null, easeReadsRecent: 0, easeReadsBefore: 0, checkInsMissed: 0 },
  { weeks: steady(3, 3), openedDaysAgo: 0, sessionDaysAgo: 0, easeReadsRecent: 2, easeReadsBefore: 2, checkInsMissed: 0 },
  { weeks: [{ planned: 3, done: 3 }, { planned: 3, done: 2 }, { planned: 3, done: 1 }, { planned: 3, done: 0 }], openedDaysAgo: 8, sessionDaysAgo: 9, easeReadsRecent: 0, easeReadsBefore: 0, checkInsMissed: 1 },
  { weeks: steady(4, 3), openedDaysAgo: 0, sessionDaysAgo: 2, easeReadsRecent: 5, easeReadsBefore: 1, checkInsMissed: 2 },
  { weeks: steady(0, 0), openedDaysAgo: 20, sessionDaysAgo: 35, easeReadsRecent: 0, easeReadsBefore: 0, checkInsMissed: 0 },
  { weeks: steady(3, 2), openedDaysAgo: 2, sessionDaysAgo: 2, easeReadsRecent: 1, easeReadsBefore: 0, checkInsMissed: 0 },
];

const planName = (planId: string) => DEMO_PLANS.find((p) => p.id === planId)?.name ?? null;

export function demoMemberActivity(now = Date.now(), coachOf: Record<string, string> = {}): MemberActivity[] {
  const subs = demoSubscriptions(now);
  return DEMO_CLIENTS.map((c, i) => {
    const s = SHAPES[i]!;
    const sub = subs.find((x) => x.clientId === c.id) ?? null;
    return {
      clientId: c.id,
      name: c.name,
      planName: sub ? planName(sub.planId) : null,
      coachId: coachOf[c.id] ?? null,
      weeks: s.weeks,
      lastAppOpenAt: s.openedDaysAgo == null ? null : daysAgo(s.openedDaysAgo, now),
      lastSessionAt: s.sessionDaysAgo == null ? null : daysAgo(s.sessionDaysAgo, now),
      easeReadsRecent: s.easeReadsRecent,
      easeReadsBefore: s.easeReadsBefore,
      checkInsMissed: s.checkInsMissed,
      joinedAt: `${c.startDate}T09:00:00Z`,
      subscription: sub,
    };
  });
}

/** Subscriptions including the former member whose check-in didn't keep them. */
export function demoRetentionSubscriptions(now = Date.now()): SubscriptionLike[] {
  return [
    ...demoSubscriptions(now),
    { clientId: 'former-sam', planKind: 'monthly', priceCents: 16000, status: 'canceled', startedAt: daysAgo(200, now), trialEndsAt: null, canceledAt: daysAgo(30, now) },
  ];
}

/** Earlier check-ins: three still with Maya after 60 days, one who left, one too recent to tell. */
export function demoInterventions(now = Date.now()): Intervention[] {
  const c = DEMO_CLIENTS;
  const subs = demoRetentionSubscriptions(now);
  const monthly = (clientId: string) => {
    const s = subs.find((x) => x.clientId === clientId);
    return s ? monthlyRevenueCents(s) : 0;
  };
  const row = (
    n: number,
    client: { id: string; name: string },
    coachId: string,
    reason: string,
    requested: number,
    done: number,
    action: Intervention['action'],
    actionNote: string | null,
  ): Intervention => ({
    id: `0192f0a5-0000-7000-8000-${String(n).padStart(12, '0')}`,
    clientId: client.id,
    clientName: client.name,
    coachId,
    coachName: coachId === DEMO_OWNER_ID ? 'Maya Reyes' : 'Leo Park',
    reason,
    note: null,
    requestedOn: dateAgo(requested, now),
    doneOn: dateAgo(done, now),
    action,
    actionNote,
    monthlyCents: monthly(client.id),
  });
  return [
    row(1, c[3]!, DEMO_OWNER_ID, 'No session in 12 days', 152, 151, 'call', 'Shoulder was bothering her. Swapped pressing for landmine work.'),
    row(2, c[1]!, DEMO_OWNER_ID, 'Hasn’t opened the app in 9 days', 96, 95, 'session', null),
    row(3, c[0]!, DEMO_ASSISTANT_ID, 'Hasn’t opened the app in 8 days', 66, 64, 'message', 'New job, mornings gone. Moved sessions to evenings.'),
    row(4, { id: 'former-sam', name: 'Sam Whitford' }, DEMO_ASSISTANT_ID, 'Missed 3 weekly check-ins', 82, 80, 'message', 'Moving cities. Offered online-only.'),
    row(5, c[7]!, DEMO_ASSISTANT_ID, 'Sessions fell from 67% to 33% of plan', 23, 21, 'call', null),
  ];
}
