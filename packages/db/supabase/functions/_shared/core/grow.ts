// GENERATED from packages/core/src/grow.ts by scripts/sync-schemas.mjs. Do not edit.
import { z } from 'zod';

/**
 * Payments and client acquisition (K-6, K-7, C-11). Money is always integer minor units (cents)
 * in the plan's currency; nothing here touches Stripe directly. The trainer is merchant of record
 * (Stripe Connect Express); the platform takes an application fee in basis points.
 */

export const Currency = z.enum(['usd', 'gbp', 'eur', 'cad', 'aud']);
export type Currency = z.infer<typeof Currency>;

export const PlanKind = z.enum(['monthly', 'weekly', 'pay_in_full', 'session_pack']);
export type PlanKind = z.infer<typeof PlanKind>;

export const PLAN_KIND_LABEL: Record<PlanKind, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  pay_in_full: 'Pay in full',
  session_pack: 'Session pack',
};

export const Plan = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
  description: z.string().max(400),
  kind: PlanKind,
  priceCents: z.number().int().min(50).max(1_000_000),
  currency: Currency,
  /** pay_in_full: how many weeks the package covers. */
  durationWeeks: z.number().int().min(1).max(104).nullable(),
  /** session_pack: in-person sessions included. */
  sessions: z.number().int().min(1).max(200).nullable(),
  trialDays: z.number().int().min(0).max(60),
  active: z.boolean(),
});
export type Plan = z.infer<typeof Plan>;

export const Coupon = z.object({
  code: z.string().regex(/^[A-Z0-9-]{3,24}$/),
  percentOff: z.number().int().min(1).max(100).nullable(),
  amountOffCents: z.number().int().min(1).nullable(),
  /** Months a subscription discount repeats for; null = first payment only. */
  durationMonths: z.number().int().min(1).max(24).nullable(),
  expiresAt: z.string().nullable(),
  maxRedemptions: z.number().int().min(1).nullable(),
  redemptions: z.number().int().min(0),
});
export type Coupon = z.infer<typeof Coupon>;

export const SubscriptionStatus = z.enum(['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export interface SubscriptionLike {
  clientId: string;
  planKind: PlanKind;
  priceCents: number;
  /** Ongoing discount per period from a coupon, if any. */
  discountCents?: number;
  status: SubscriptionStatus;
  startedAt: string;
  trialEndsAt: string | null;
  canceledAt: string | null;
  /** For pay_in_full packages, how many weeks the payment covers. */
  durationWeeks?: number | null;
}

/* ---------- formatting ---------- */

const SYMBOL: Record<Currency, string> = { usd: '$', gbp: '£', eur: '€', cad: 'CA$', aud: 'A$' };

export function formatMoney(cents: number, currency: Currency): string {
  const abs = Math.abs(cents);
  const text = abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2);
  const [int, dec] = text.split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}${SYMBOL[currency]}${grouped}${dec ? `.${dec}` : ''}`;
}

export function priceLabel(p: Pick<Plan, 'kind' | 'priceCents' | 'currency' | 'durationWeeks' | 'sessions'>): string {
  const m = formatMoney(p.priceCents, p.currency);
  switch (p.kind) {
    case 'monthly':
      return `${m} / month`;
    case 'weekly':
      return `${m} / week`;
    case 'pay_in_full':
      return p.durationWeeks ? `${m} for ${p.durationWeeks} weeks` : `${m} once`;
    case 'session_pack':
      return p.sessions ? `${m} for ${p.sessions} sessions` : m;
  }
}

/* ---------- coupons and fees ---------- */

export type CouponCheck = { ok: true; discountCents: number } | { ok: false; reason: string };

export function applyCoupon(priceCents: number, coupon: Coupon | null, now: number = Date.now()): CouponCheck {
  if (!coupon) return { ok: true, discountCents: 0 };
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) < now) return { ok: false, reason: 'This code has expired.' };
  if (coupon.maxRedemptions != null && coupon.redemptions >= coupon.maxRedemptions) {
    return { ok: false, reason: 'This code has been used up.' };
  }
  const raw = coupon.percentOff != null ? Math.round((priceCents * coupon.percentOff) / 100) : (coupon.amountOffCents ?? 0);
  const discountCents = Math.min(priceCents, raw);
  // Stripe won't charge below 50 cents; only a full discount may take the price to zero.
  const left = priceCents - discountCents;
  if (left > 0 && left < 50) return { ok: false, reason: 'This code takes the price below the minimum charge.' };
  return { ok: true, discountCents };
}

/** Platform application fee in cents (basis points, rounded down so the trainer never pays a fraction more). */
export function applicationFeeCents(amountCents: number, feeBps: number): number {
  if (feeBps <= 0 || amountCents <= 0) return 0;
  return Math.floor((amountCents * feeBps) / 10_000);
}

/* ---------- trials ---------- */

export function trialEndsAt(start: Date, trialDays: number): string | null {
  if (trialDays <= 0) return null;
  return new Date(start.getTime() + trialDays * 86_400_000).toISOString();
}

/* ---------- business stats (real data only) ---------- */

const WEEKS_PER_MONTH = 52 / 12;

/** Normalised monthly revenue for one subscription; one-off packages spread over their duration. */
export function monthlyRevenueCents(s: SubscriptionLike): number {
  const net = Math.max(0, s.priceCents - (s.discountCents ?? 0));
  switch (s.planKind) {
    case 'monthly':
      return net;
    case 'weekly':
      return Math.round(net * WEEKS_PER_MONTH);
    case 'pay_in_full':
      return s.durationWeeks ? Math.round((net / s.durationWeeks) * WEEKS_PER_MONTH) : 0;
    case 'session_pack':
      return 0; // pay as you go, not recurring revenue
  }
}

const PAYING: SubscriptionStatus[] = ['active', 'past_due'];

export interface BusinessStats {
  activeClients: number;
  mrrCents: number;
  /** rate is null until at least 5 subscriptions were paying at the start of the month. */
  churnThisMonth: { count: number; rate: number | null };
  /** null until at least 3 subscriptions have ended. */
  averageLifetimeDays: number | null;
  /** rate is null until at least 3 trials have finished. */
  trialToPaid: { converted: number; ended: number; rate: number | null };
}

/**
 * Stats from the trainer's own subscription records. A value is null when there isn't enough data to
 * say anything honest; the UI shows "Not enough data yet" rather than a number.
 */
export function businessStats(subs: SubscriptionLike[], now: Date = new Date()): BusinessStats {
  const t = now.getTime();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const paying = subs.filter((s) => PAYING.includes(s.status));
  const activeClients = new Set(paying.map((s) => s.clientId)).size;
  const mrrCents = paying.reduce((sum, s) => sum + monthlyRevenueCents(s), 0);

  // Churn: paying (past any trial) at the start of the month, cancelled since.
  const atStart = subs.filter(
    (s) =>
      Date.parse(s.startedAt) < monthStart &&
      (!s.trialEndsAt || Date.parse(s.trialEndsAt) < monthStart) &&
      (!s.canceledAt || Date.parse(s.canceledAt) >= monthStart),
  );
  const churned = atStart.filter((s) => s.canceledAt && Date.parse(s.canceledAt) <= t);
  const churnThisMonth = { count: churned.length, rate: atStart.length >= 5 ? churned.length / atStart.length : null };

  const ended = subs.filter((s) => s.canceledAt);
  const averageLifetimeDays =
    ended.length >= 3
      ? Math.round(ended.reduce((d, s) => d + (Date.parse(s.canceledAt!) - Date.parse(s.startedAt)) / 86_400_000, 0) / ended.length)
      : null;

  // Trial → paid: trials that have finished; converted if not cancelled before the trial ended.
  const trialsOver = subs.filter((s) => s.trialEndsAt && Date.parse(s.trialEndsAt) <= t);
  const converted = trialsOver.filter((s) => !s.canceledAt || Date.parse(s.canceledAt) > Date.parse(s.trialEndsAt!)).length;
  const trialToPaid = { converted, ended: trialsOver.length, rate: trialsOver.length >= 3 ? converted / trialsOver.length : null };

  return { activeClients, mrrCents, churnThisMonth, averageLifetimeDays, trialToPaid };
}

/* ---------- referrals ---------- */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** Short, readable referral code: first-name prefix + 4 random characters, e.g. JORDAN-7KQ2. */
export function referralCode(name: string, random: () => number = Math.random): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  const prefix =
    first
      .normalize('NFKD')
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase()
      .slice(0, 8) || 'FRIEND';
  let tail = '';
  for (let i = 0; i < 4; i++) tail += ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(random() * ALPHABET.length))];
  return `${prefix}-${tail}`;
}

export const ReferralReward = z.object({
  kind: z.enum(['free_weeks', 'percent_off_month', 'none']),
  value: z.number().int().min(0).max(100),
});
export type ReferralReward = z.infer<typeof ReferralReward>;

export function rewardLabel(r: ReferralReward): string {
  switch (r.kind) {
    case 'free_weeks':
      return r.value === 1 ? 'One week free' : `${r.value} weeks free`;
    case 'percent_off_month':
      return `${r.value}% off a month`;
    case 'none':
      return 'No reward';
  }
}

/* ---------- session packs ---------- */

export interface SessionPack {
  sessionsTotal: number;
  sessionsUsed: number;
}

export type PackCheckIn = { ok: true; pack: SessionPack; remaining: number } | { ok: false; reason: string };

/** Decrements a pack when an in-person session is checked in (K-7). */
export function checkInSession(pack: SessionPack): PackCheckIn {
  if (pack.sessionsUsed >= pack.sessionsTotal) return { ok: false, reason: 'No sessions left on this pack.' };
  const next = { ...pack, sessionsUsed: pack.sessionsUsed + 1 };
  return { ok: true, pack: next, remaining: next.sessionsTotal - next.sessionsUsed };
}

/* ---------- leads ---------- */

export const LeadStatus = z.enum(['new', 'contacted', 'trial', 'won', 'lost']);
export type LeadStatus = z.infer<typeof LeadStatus>;
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  trial: 'Trial',
  won: 'Won',
  lost: 'Lost',
};

export const LeadInput = z.object({
  tenantSlug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  message: z.string().trim().max(2000),
  source: z.string().max(60),
  referralCode: z.string().max(40).nullable(),
});
export type LeadInput = z.infer<typeof LeadInput>;

export interface Lead extends LeadInput {
  id: string;
  status: LeadStatus;
  createdAt: string;
}

/* ---------- landing page blocks ---------- */

export const LandingBlock = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('hero'),
    heading: z.string().max(120),
    subheading: z.string().max(300),
    ctaLabel: z.string().max(40),
  }),
  z.object({ id: z.string(), type: z.literal('about'), heading: z.string().max(120), body: z.string().max(3000) }),
  z.object({ id: z.string(), type: z.literal('plans'), heading: z.string().max(120), planIds: z.array(z.string()) }),
  z.object({
    id: z.string(),
    type: z.literal('faq'),
    heading: z.string().max(120),
    items: z.array(z.object({ q: z.string().max(200), a: z.string().max(1000) })).max(20),
  }),
  z.object({ id: z.string(), type: z.literal('lead_form'), heading: z.string().max(120), body: z.string().max(300) }),
]);
export type LandingBlock = z.infer<typeof LandingBlock>;
export type LandingBlockType = LandingBlock['type'];

export const LandingPage = z.object({
  tenantSlug: z.string(),
  published: z.boolean(),
  customDomain: z.string().nullable(),
  blocks: z.array(LandingBlock).max(20),
});
export type LandingPage = z.infer<typeof LandingPage>;

export const BLOCK_LABEL: Record<LandingBlockType, string> = {
  hero: 'Intro',
  about: 'About you',
  plans: 'Plans and prices',
  faq: 'Questions',
  lead_form: 'Contact form',
};

export function newBlock(type: LandingBlockType, id: string): LandingBlock {
  switch (type) {
    case 'hero':
      return { id, type, heading: '', subheading: '', ctaLabel: 'See plans' };
    case 'about':
      return { id, type, heading: 'About me', body: '' };
    case 'plans':
      return { id, type, heading: 'Plans', planIds: [] };
    case 'faq':
      return { id, type, heading: 'Questions', items: [] };
    case 'lead_form':
      return { id, type, heading: 'Not sure yet?', body: 'Send a message and I’ll get back to you.' };
  }
}

export function moveBlock(blocks: LandingBlock[], id: string, delta: -1 | 1): LandingBlock[] {
  const i = blocks.findIndex((b) => b.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= blocks.length) return blocks;
  const out = [...blocks];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** Problems that stop a page being published, in plain words. Empty when it can go live. */
export function landingProblems(page: LandingPage, plans: Plan[]): string[] {
  const out: string[] = [];
  const hero = page.blocks.find((b) => b.type === 'hero');
  if (!hero || hero.type !== 'hero' || !hero.heading.trim()) out.push('Add an intro with a headline.');
  const plansBlock = page.blocks.find((b) => b.type === 'plans');
  if (plansBlock && plansBlock.type === 'plans') {
    const live = new Set(plans.filter((p) => p.active).map((p) => p.id));
    if (!plansBlock.planIds.some((id) => live.has(id))) out.push('Pick at least one active plan for the plans section.');
  }
  if (!page.blocks.some((b) => b.type === 'plans' || b.type === 'lead_form')) {
    out.push('Add a plans section or a contact form so visitors can get in touch.');
  }
  return out;
}

/* ---------- store rules for purchase links (C-11) ---------- */

/**
 * Whether the app may show a link to web checkout or the billing portal. App Store rules on external
 * purchase links vary by region and change often (an open question in the spec), so this is config.
 * Default: Android and web may link; iOS shows plan status only unless a region is explicitly allowed.
 */
export interface PurchaseLinkPolicy {
  ios: { allowedRegions: string[] };
  android: { allowed: boolean };
  web: { allowed: boolean };
}

export const DEFAULT_PURCHASE_LINK_POLICY: PurchaseLinkPolicy = {
  ios: { allowedRegions: [] }, // CLIENT INPUT REQUIRED: confirm current App Store rules per launch region
  android: { allowed: true },
  web: { allowed: true },
};

export function canLinkToPurchase(
  platform: 'ios' | 'android' | 'web' | string,
  region: string | null,
  policy: PurchaseLinkPolicy = DEFAULT_PURCHASE_LINK_POLICY,
): boolean {
  if (platform === 'web') return policy.web.allowed;
  if (platform === 'android') return policy.android.allowed;
  if (platform === 'ios') return !!region && policy.ios.allowedRegions.includes(region.toUpperCase());
  return false;
}
