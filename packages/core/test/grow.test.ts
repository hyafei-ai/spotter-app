import { describe, expect, it } from 'vitest';
import {
  applicationFeeCents,
  applyCoupon,
  businessStats,
  canLinkToPurchase,
  checkInSession,
  formatMoney,
  landingProblems,
  monthlyRevenueCents,
  moveBlock,
  newBlock,
  priceLabel,
  referralCode,
  rewardLabel,
  trialEndsAt,
  LandingPage,
  Plan,
  type Coupon,
  type SubscriptionLike,
} from '../src/grow';
import { DEMO_LANDING_PAGE, DEMO_PLANS, demoSubscriptions } from '../src/demo/grow';

const NOW = new Date('2026-10-21T12:00:00Z');
const iso = (s: string) => new Date(s).toISOString();

const coupon = (c: Partial<Coupon>): Coupon => ({
  code: 'TEST',
  percentOff: null,
  amountOffCents: null,
  durationMonths: null,
  expiresAt: null,
  maxRedemptions: null,
  redemptions: 0,
  ...c,
});

describe('money', () => {
  it('formats whole and fractional amounts with grouping', () => {
    expect(formatMoney(16000, 'usd')).toBe('$160');
    expect(formatMoney(4599, 'gbp')).toBe('£45.99');
    expect(formatMoney(1234500, 'eur')).toBe('€12,345');
    expect(formatMoney(-500, 'usd')).toBe('-$5');
  });

  it('labels each plan kind plainly', () => {
    expect(priceLabel({ kind: 'monthly', priceCents: 16000, currency: 'usd', durationWeeks: null, sessions: null })).toBe('$160 / month');
    expect(priceLabel({ kind: 'weekly', priceCents: 4500, currency: 'usd', durationWeeks: null, sessions: null })).toBe('$45 / week');
    expect(priceLabel({ kind: 'pay_in_full', priceCents: 42000, currency: 'usd', durationWeeks: 12, sessions: null })).toBe('$420 for 12 weeks');
    expect(priceLabel({ kind: 'session_pack', priceCents: 64000, currency: 'usd', durationWeeks: null, sessions: 8 })).toBe('$640 for 8 sessions');
  });
});

describe('coupons and fees', () => {
  it('applies percent and fixed discounts', () => {
    expect(applyCoupon(16000, coupon({ percentOff: 20 }))).toEqual({ ok: true, discountCents: 3200 });
    expect(applyCoupon(16000, coupon({ amountOffCents: 2500 }))).toEqual({ ok: true, discountCents: 2500 });
    expect(applyCoupon(16000, null)).toEqual({ ok: true, discountCents: 0 });
  });

  it('never discounts below zero and allows a full discount', () => {
    expect(applyCoupon(1000, coupon({ amountOffCents: 5000 }))).toEqual({ ok: true, discountCents: 1000 });
    expect(applyCoupon(1000, coupon({ percentOff: 100 }))).toEqual({ ok: true, discountCents: 1000 });
  });

  it('refuses expired, used-up and below-minimum codes', () => {
    expect(applyCoupon(16000, coupon({ percentOff: 10, expiresAt: '2026-01-01T00:00:00Z' }), NOW.getTime())).toMatchObject({ ok: false, reason: 'This code has expired.' });
    expect(applyCoupon(16000, coupon({ percentOff: 10, maxRedemptions: 3, redemptions: 3 }))).toMatchObject({ ok: false });
    expect(applyCoupon(1000, coupon({ amountOffCents: 980 }))).toMatchObject({ ok: false, reason: 'This code takes the price below the minimum charge.' });
  });

  it('computes the platform fee in basis points, rounding down', () => {
    expect(applicationFeeCents(16000, 300)).toBe(480);
    expect(applicationFeeCents(999, 250)).toBe(24);
    expect(applicationFeeCents(16000, 0)).toBe(0);
  });
});

describe('trials', () => {
  it('ends after the trial days, or not at all', () => {
    expect(trialEndsAt(NOW, 7)).toBe('2026-10-28T12:00:00.000Z');
    expect(trialEndsAt(NOW, 0)).toBeNull();
  });
});

describe('business stats', () => {
  const sub = (s: Partial<SubscriptionLike>): SubscriptionLike => ({
    clientId: 'c',
    planKind: 'monthly',
    priceCents: 10000,
    status: 'active',
    startedAt: iso('2026-01-01'),
    trialEndsAt: null,
    canceledAt: null,
    ...s,
  });

  it('normalises recurring revenue to a month', () => {
    expect(monthlyRevenueCents(sub({}))).toBe(10000);
    expect(monthlyRevenueCents(sub({ planKind: 'weekly', priceCents: 4500 }))).toBe(19500);
    expect(monthlyRevenueCents(sub({ planKind: 'pay_in_full', priceCents: 42000, durationWeeks: 12 }))).toBe(15167);
    expect(monthlyRevenueCents(sub({ planKind: 'session_pack', priceCents: 64000 }))).toBe(0);
    expect(monthlyRevenueCents(sub({ discountCents: 2000 }))).toBe(8000);
  });

  it('reports nothing it can’t back up when there is no data', () => {
    const s = businessStats([], NOW);
    expect(s).toEqual({
      activeClients: 0,
      mrrCents: 0,
      churnThisMonth: { count: 0, rate: null },
      averageLifetimeDays: null,
      trialToPaid: { converted: 0, ended: 0, rate: null },
    });
  });

  it('counts paying clients once, excludes trials and cancellations from MRR', () => {
    const s = businessStats(
      [
        sub({ clientId: 'a' }),
        sub({ clientId: 'a', planKind: 'session_pack' }),
        sub({ clientId: 'b', status: 'past_due' }),
        sub({ clientId: 'c', status: 'trialing', trialEndsAt: iso('2026-10-25') }),
        sub({ clientId: 'd', status: 'canceled', canceledAt: iso('2026-10-05') }),
      ],
      NOW,
    );
    expect(s.activeClients).toBe(2);
    expect(s.mrrCents).toBe(20000);
  });

  it('computes churn this month only with enough subscriptions at month start', () => {
    const base = [1, 2, 3, 4].map((i) => sub({ clientId: `p${i}` }));
    const withChurn = [...base, sub({ clientId: 'x', status: 'canceled', canceledAt: iso('2026-10-10') })];
    expect(businessStats(withChurn, NOW).churnThisMonth).toEqual({ count: 1, rate: 0.2 });
    expect(businessStats(base.slice(0, 2), NOW).churnThisMonth.rate).toBeNull();
    // Cancelled last month doesn't count as churn this month.
    expect(businessStats([...base, sub({ clientId: 'y', status: 'canceled', canceledAt: iso('2026-09-20') })], NOW).churnThisMonth.count).toBe(0);
  });

  it('averages lifetime over ended subscriptions and measures trial conversion', () => {
    const subs = [
      sub({ clientId: 'a', startedAt: iso('2026-01-01'), canceledAt: iso('2026-01-31'), status: 'canceled' }),
      sub({ clientId: 'b', startedAt: iso('2026-02-01'), canceledAt: iso('2026-04-02'), status: 'canceled' }),
      sub({ clientId: 'c', startedAt: iso('2026-03-01'), canceledAt: iso('2026-05-30'), status: 'canceled' }),
      sub({ clientId: 't1', startedAt: iso('2026-09-01'), trialEndsAt: iso('2026-09-08') }),
      sub({ clientId: 't2', startedAt: iso('2026-09-01'), trialEndsAt: iso('2026-09-08'), canceledAt: iso('2026-09-05'), status: 'canceled' }),
      sub({ clientId: 't3', startedAt: iso('2026-10-01'), trialEndsAt: iso('2026-10-08') }),
      sub({ clientId: 't4', startedAt: iso('2026-10-18'), trialEndsAt: iso('2026-10-25'), status: 'trialing' }),
    ];
    const s = businessStats(subs, NOW);
    // The trial cancelled after 4 days is also an ended subscription.
    expect(s.averageLifetimeDays).toBe(Math.round((30 + 60 + 90 + 4) / 4));
    expect(s.trialToPaid).toEqual({ converted: 2, ended: 3, rate: 2 / 3 });
  });

  it('works on the demo data', () => {
    const s = businessStats(demoSubscriptions(NOW.getTime()), NOW);
    expect(s.activeClients).toBe(10); // 8 original demo clients minus the paused one, plus the 3 multisport ones (demo/multisport.ts)
    expect(s.mrrCents).toBeGreaterThan(0);
  });
});

describe('referrals', () => {
  it('makes readable codes from the first name', () => {
    const r = () => 0;
    expect(referralCode('Jordan Ellis', r)).toBe('JORDAN-AAAA');
    expect(referralCode('Tomás Herrera-Vidal', r)).toBe('TOMAS-AAAA');
    expect(referralCode('李', r)).toBe('FRIEND-AAAA');
    expect(referralCode('Fatima', () => 0.999999)).toBe('FATIMA-9999');
  });

  it('labels rewards', () => {
    expect(rewardLabel({ kind: 'free_weeks', value: 1 })).toBe('One week free');
    expect(rewardLabel({ kind: 'percent_off_month', value: 25 })).toBe('25% off a month');
  });
});

describe('session packs', () => {
  it('decrements on check-in and stops at zero', () => {
    const a = checkInSession({ sessionsTotal: 2, sessionsUsed: 1 });
    expect(a).toEqual({ ok: true, pack: { sessionsTotal: 2, sessionsUsed: 2 }, remaining: 0 });
    expect(checkInSession({ sessionsTotal: 2, sessionsUsed: 2 })).toEqual({ ok: false, reason: 'No sessions left on this pack.' });
  });
});

describe('landing pages', () => {
  it('demo page and plans are valid and publishable', () => {
    expect(() => LandingPage.parse(DEMO_LANDING_PAGE)).not.toThrow();
    for (const p of DEMO_PLANS) expect(() => Plan.parse(p)).not.toThrow();
    expect(landingProblems(DEMO_LANDING_PAGE, DEMO_PLANS)).toEqual([]);
  });

  it('explains what blocks publishing', () => {
    const page = { ...DEMO_LANDING_PAGE, blocks: [newBlock('hero', 'h'), newBlock('plans', 'p')] };
    expect(landingProblems(page, DEMO_PLANS)).toEqual(['Add an intro with a headline.', 'Pick at least one active plan for the plans section.']);
    expect(landingProblems({ ...page, blocks: [] }, DEMO_PLANS)).toContain('Add a plans section or a contact form so visitors can get in touch.');
  });

  it('reorders blocks within bounds', () => {
    const blocks = DEMO_LANDING_PAGE.blocks;
    expect(moveBlock(blocks, 'about', -1).map((b) => b.id).slice(0, 2)).toEqual(['about', 'hero']);
    expect(moveBlock(blocks, 'hero', -1)).toBe(blocks);
  });
});

describe('purchase link policy', () => {
  it('defaults to no purchase link on iOS', () => {
    expect(canLinkToPurchase('ios', 'US')).toBe(false);
    expect(canLinkToPurchase('android', 'US')).toBe(true);
    expect(canLinkToPurchase('web', null)).toBe(true);
    expect(canLinkToPurchase('ios', 'us', { ios: { allowedRegions: ['US'] }, android: { allowed: true }, web: { allowed: true } })).toBe(true);
  });
});
