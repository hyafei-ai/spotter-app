/*
 * MOCK DATA — plans, landing page, subscriptions and leads for the Maya Reyes Strength demo tenant.
 * All of it is sample data for the preview build: prices are placeholders, the page copy describes
 * what the app does (no results, testimonials or client counts), and the people are fictional.
 */
import type { Coupon, LandingPage, Lead, Plan, ReferralReward, SubscriptionLike } from '../grow';
import { DEMO_CLIENTS } from './coach';

export const DEMO_PLANS: Plan[] = [
  {
    id: 'plan-online-monthly',
    name: 'Online coaching',
    description: 'A program written for your schedule and equipment, weekly check-ins, form checks and messaging.',
    kind: 'monthly',
    priceCents: 16000,
    currency: 'usd',
    durationWeeks: null,
    sessions: null,
    trialDays: 7,
    active: true,
  },
  {
    id: 'plan-12-weeks',
    name: '12-week block',
    description: 'Everything in online coaching, paid once for twelve weeks.',
    kind: 'pay_in_full',
    priceCents: 42000,
    currency: 'usd',
    durationWeeks: 12,
    sessions: null,
    trialDays: 0,
    active: true,
  },
  {
    id: 'plan-hybrid-8',
    name: 'Hybrid · 8 sessions',
    description: 'Eight in-person sessions plus the app between them.',
    kind: 'session_pack',
    priceCents: 64000,
    currency: 'usd',
    durationWeeks: null,
    sessions: 8,
    trialDays: 0,
    active: true,
  },
];

export const DEMO_COUPONS: Coupon[] = [
  { code: 'NEWYEAR', percentOff: 20, amountOffCents: null, durationMonths: 1, expiresAt: null, maxRedemptions: 20, redemptions: 0 },
];

export const DEMO_REFERRAL_REWARD: ReferralReward = { kind: 'free_weeks', value: 1 };

export const DEMO_LANDING_PAGE: LandingPage = {
  tenantSlug: 'maya-reyes-strength',
  published: true,
  customDomain: null,
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      heading: 'Strength coaching with Maya Reyes',
      subheading: 'Sample page. Programs written for your week and your gym, logged in an app with Maya’s name on it.',
      ctaLabel: 'See plans',
    },
    {
      id: 'about',
      type: 'about',
      heading: 'How it works',
      body:
        'Sample text, replaced by the trainer’s own words.\n\nYou fill in a short intake. Maya writes your first block around your goals, schedule and equipment. You log sessions in the app, send form-check videos, and check in once a week. Maya adjusts the plan as you go.',
    },
    { id: 'plans', type: 'plans', heading: 'Plans', planIds: ['plan-online-monthly', 'plan-12-weeks', 'plan-hybrid-8'] },
    {
      id: 'faq',
      type: 'faq',
      heading: 'Questions',
      items: [
        { q: 'Do I need a gym?', a: 'No. Your program is written for the equipment you have, including dumbbells only.' },
        { q: 'Can I cancel?', a: 'Monthly coaching can be cancelled any time from the billing page. It stops at the end of the period you paid for.' },
        { q: 'What happens after I pay?', a: 'You get an invite to the app, fill in the intake and sign the waiver. Your first session follows.' },
      ],
    },
    { id: 'contact', type: 'lead_form', heading: 'Not sure yet?', body: 'Send a message and Maya will get back to you.' },
  ],
};

const daysAgo = (d: number, now = Date.now()) => new Date(now - d * 86_400_000).toISOString();

/** Subscriptions behind the coach's business stats. Statuses match DEMO_CLIENTS (Priya past due, Daniel paused). */
export function demoSubscriptions(now = Date.now()): (SubscriptionLike & { planId: string })[] {
  const c = DEMO_CLIENTS;
  const monthly = (clientId: string, startedDays: number, extra: Partial<SubscriptionLike> = {}) => ({
    planId: 'plan-online-monthly',
    clientId,
    planKind: 'monthly' as const,
    priceCents: 16000,
    status: 'active' as const,
    startedAt: daysAgo(startedDays, now),
    trialEndsAt: daysAgo(startedDays - 7, now),
    canceledAt: null,
    ...extra,
  });
  return [
    monthly(c[0]!.id, 78),
    monthly(c[1]!.id, 126, { status: 'past_due' }),
    { planId: 'plan-hybrid-8', clientId: c[2]!.id, planKind: 'session_pack', priceCents: 64000, status: 'active', startedAt: daysAgo(8, now), trialEndsAt: null, canceledAt: null },
    monthly(c[3]!.id, 233),
    monthly(c[4]!.id, 149),
    { planId: 'plan-12-weeks', clientId: c[5]!.id, planKind: 'pay_in_full', priceCents: 42000, durationWeeks: 12, status: 'active', startedAt: daysAgo(50, now), trialEndsAt: null, canceledAt: null },
    monthly(c[6]!.id, 282, { status: 'paused' }),
    { ...monthly(c[7]!.id, 83), planKind: 'weekly', priceCents: 4500 },
    // Multisport demo clients (demo/multisport.ts).
    ...[c[8], c[9], c[10]].filter((x): x is NonNullable<typeof x> => !!x).map((x, i) => monthly(x.id, [172, 249, 354][i]!)),
    // Former clients (ended subscriptions) and trials that didn't convert.
    monthly('former-1', 300, { status: 'canceled', canceledAt: daysAgo(120, now) }),
    monthly('former-2', 210, { status: 'canceled', canceledAt: daysAgo(40, now) }),
    monthly('former-3', 60, { status: 'canceled', canceledAt: daysAgo(55, now) }),
  ];
}

export interface StorefrontProduct {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  currency: Plan['currency'];
  active: boolean;
  /** Program it unlocks in the app (no coach messaging). */
  programName: string;
}

/** MOCK: one-off programs for non-coached buyers (K-6 storefront). */
export const DEMO_PRODUCTS: StorefrontProduct[] = [
  {
    id: 'prod-strength-base',
    title: 'Strength Base · 8 weeks',
    description: 'Three full-body sessions a week for a barbell gym. Logged in the app, with demo videos. No coach messaging.',
    priceCents: 7900,
    currency: 'usd',
    active: true,
    programName: 'Strength Base',
  },
  {
    id: 'prod-dumbbell-only',
    title: 'Dumbbells Only · 6 weeks',
    description: 'Four sessions a week using a pair of adjustable dumbbells and a bench.',
    priceCents: 4900,
    currency: 'usd',
    active: true,
    programName: 'Dumbbells Only',
  },
];

export function demoLeads(now = Date.now()): Lead[] {
  return [
    { id: 'lead-1', tenantSlug: 'maya-reyes-strength', name: 'Alex Moreno', email: 'alex.moreno@example.com', message: 'I train at home with dumbbells. Is that enough?', source: 'landing_page', referralCode: null, status: 'new', createdAt: daysAgo(0.3, now) },
    { id: 'lead-2', tenantSlug: 'maya-reyes-strength', name: 'Sam Whitfield', email: 'sam.w@example.com', message: '', source: 'referral', referralCode: 'JORDAN-7KQ2', status: 'contacted', createdAt: daysAgo(3, now) },
    { id: 'lead-3', tenantSlug: 'maya-reyes-strength', name: 'Rina Osei', email: 'rina.osei@example.com', message: 'Coming back after a shoulder injury.', source: 'landing_page', referralCode: null, status: 'trial', createdAt: daysAgo(9, now) },
  ];
}

/** Everything the Grow screens edit for one trainer. Mirrors plans, coupons, leads, landing_pages, … */
export interface GrowState {
  page: LandingPage;
  plans: Plan[];
  coupons: Coupon[];
  leads: Lead[];
  products: StorefrontProduct[];
  referral: { enabled: boolean; reward: ReferralReward };
  stripe: { connected: boolean; chargesEnabled: boolean };
  /** MOCK: purchases made through the simulated checkout. */
  purchases: { id: string; item: string; amountCents: number; currency: Plan['currency']; email: string; at: string; status: 'succeeded' | 'failed' }[];
}

/**
 * MOCK: starting state for the demo tenants. Maya has a published page and test-mode payments;
 * any other tenant has nothing set up, which shows the "no page yet" and "Stripe not connected" states.
 */
export function defaultGrow(slug: string): GrowState {
  if (slug === 'maya-reyes-strength') {
    return {
      page: DEMO_LANDING_PAGE,
      plans: DEMO_PLANS,
      coupons: DEMO_COUPONS,
      leads: demoLeads(),
      products: DEMO_PRODUCTS,
      referral: { enabled: true, reward: DEMO_REFERRAL_REWARD },
      stripe: { connected: true, chargesEnabled: true },
      purchases: [],
    };
  }
  return {
    page: { tenantSlug: slug, published: false, customDomain: null, blocks: [] },
    plans: [],
    coupons: [],
    leads: [],
    products: [],
    referral: { enabled: false, reward: { kind: 'free_weeks', value: 1 } },
    stripe: { connected: false, chargesEnabled: false },
    purchases: [],
  };
}

/** localStorage key shared by the demo web dashboard, landing page and coach app (web preview). */
export const growKey = (slug: string) => `spotter.grow.${slug}`;
