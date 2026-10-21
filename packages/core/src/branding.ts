import { z } from 'zod';
import { checkBrandColor, contrastRatio, deriveDarkBrand } from './brand';
import sharedTenant from './shared-tenant.json';
import { DEFAULT_TABS, DEMO_TENANTS, TenantConfig, type TabKey, type TenantTabs } from './tenant';

/**
 * White-label branding and publishing (W-1 to W-4): brand validation, runtime tab labels and
 * module switches, the shared-app trainer code, store listing kit and publishing readiness.
 */

export const PAPER_LIGHT = '#F3EFE7';
export const PAPER_DARK = '#171614';

/* ---------- runtime branding ---------- */

export function tabLabels(t: TenantConfig): Record<TabKey, string> {
  const tabs: TenantTabs = { ...DEFAULT_TABS, ...(t.tabs ?? {}) };
  const first = t.coach.name.split(' ')[0] || 'Coach';
  return {
    today: tabs.today,
    history: tabs.history,
    coach: tabs.coach === '{coach}' ? first : tabs.coach,
    me: tabs.me,
  };
}

export type ModuleKey = keyof TenantConfig['modules'];
export const MODULE_LABEL: Record<ModuleKey, string> = {
  nutrition: 'Nutrition',
  checkIns: 'Check-ins',
  formChecks: 'Form checks',
  habits: 'Habits',
  storefront: 'Storefront',
};

/** Feature entry points call this so a trainer's module switches hide them everywhere. */
export function moduleOn(t: TenantConfig, m: ModuleKey): boolean {
  return t.modules[m] !== false;
}

/* ---------- shared-app fallback (W-3) ---------- */

/** The shared "Spotter" client app before a trainer code is entered. */
export const SHARED_TENANT = TenantConfig.parse(sharedTenant);

export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** MOCK: demo lookup. Real builds call the public `tenant_by_code` RPC, which returns branding fields only. */
export function demoTenantByCode(input: string): TenantConfig | null {
  const code = normalizeJoinCode(input);
  if (!code) return null;
  return Object.values(DEMO_TENANTS).find((t) => t.joinCode === code) ?? null;
}

/* ---------- brand setup (W-1) ---------- */

export const BrandDraft = z.object({
  appName: z.string(),
  shortName: z.string(),
  brandColor: z.string(),
  splashBackground: z.string(),
  welcomeMessage: z.string(),
  supportEmail: z.string(),
  privacyPolicyUrl: z.string(),
  units: z.enum(['kg', 'lb']),
  tabs: z.object({ today: z.string(), history: z.string(), coach: z.string(), me: z.string() }),
  modules: z.object({ nutrition: z.boolean(), checkIns: z.boolean(), formChecks: z.boolean(), habits: z.boolean(), storefront: z.boolean() }),
});
export type BrandDraft = z.infer<typeof BrandDraft>;

export function brandFromTenant(t: TenantConfig): BrandDraft {
  return {
    appName: t.appName,
    shortName: t.shortName,
    brandColor: t.brandColor.toUpperCase(),
    splashBackground: (t.splashBackground ?? PAPER_LIGHT).toUpperCase(),
    welcomeMessage: t.coach.welcomeMessage,
    supportEmail: t.supportEmail,
    privacyPolicyUrl: t.privacyPolicyUrl,
    units: t.units,
    tabs: { ...DEFAULT_TABS, ...(t.tabs ?? {}) },
    modules: { ...t.modules },
  };
}

/** Applies a saved brand to a tenant. Invalid drafts are refused, so the apps only ever see valid config. */
export function applyBrand(t: TenantConfig, b: BrandDraft): TenantConfig {
  if (brandProblems(b).length) return t;
  return TenantConfig.parse({
    ...t,
    appName: b.appName.trim(),
    shortName: b.shortName.trim(),
    brandColor: b.brandColor.toUpperCase(),
    splashBackground: b.splashBackground.toUpperCase(),
    supportEmail: b.supportEmail.trim(),
    privacyPolicyUrl: b.privacyPolicyUrl.trim(),
    units: b.units,
    weightIncrement: b.units === t.units ? t.weightIncrement : b.units === 'kg' ? 2.5 : 5,
    coach: { ...t.coach, welcomeMessage: b.welcomeMessage.trim() },
    tabs: b.tabs,
    modules: b.modules,
  });
}

export type BrandField = keyof BrandDraft;
export interface BrandProblem {
  field: BrandField;
  message: string;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function brandProblems(b: BrandDraft): BrandProblem[] {
  const out: BrandProblem[] = [];
  const name = b.appName.trim();
  if (!name) out.push({ field: 'appName', message: 'Add an app name.' });
  else if (name.length > 30) out.push({ field: 'appName', message: `App names are 30 characters at most (this one is ${name.length}).` });
  const short = b.shortName.trim();
  if (!short) out.push({ field: 'shortName', message: 'Add a short name for under the app icon.' });
  else if (short.length > 12) out.push({ field: 'shortName', message: 'Short names are 12 characters at most so they fit under the icon.' });
  if (!HEX.test(b.brandColor)) out.push({ field: 'brandColor', message: 'Use a 6-digit hex colour, like #C2410C.' });
  else {
    const c = checkBrandColor(b.brandColor, PAPER_LIGHT);
    if (!c.ok) out.push({ field: 'brandColor', message: `Too light to read on the app background (${c.ratio.toFixed(1)}:1, needs 4.5:1). Try ${c.suggestion}.` });
  }
  if (!HEX.test(b.splashBackground)) out.push({ field: 'splashBackground', message: 'Use a 6-digit hex colour for the splash background.' });
  if (!b.welcomeMessage.trim()) out.push({ field: 'welcomeMessage', message: 'Write a short welcome. New clients see it first.' });
  else if (b.welcomeMessage.length > 400) out.push({ field: 'welcomeMessage', message: 'Keep the welcome under 400 characters.' });
  if (!EMAIL.test(b.supportEmail.trim())) out.push({ field: 'supportEmail', message: 'Add a support email the stores can show.' });
  if (!/^https:\/\/[^\s]+\.[^\s]+/.test(b.privacyPolicyUrl.trim())) {
    out.push({ field: 'privacyPolicyUrl', message: 'Add your privacy policy link (https://…). Both stores require one.' });
  }
  return out;
}

export interface ColorReport {
  ok: boolean;
  ratio: number;
  suggestion: string;
  dark: string;
  darkRatio: number;
}

/** Live check for the colour picker: light-mode contrast, suggestion, and the derived dark-mode shade. */
export function colorReport(hex: string): ColorReport | null {
  if (!HEX.test(hex)) return null;
  const light = checkBrandColor(hex, PAPER_LIGHT);
  const dark = deriveDarkBrand(light.suggestion, PAPER_DARK);
  return { ok: light.ok, ratio: light.ratio, suggestion: light.suggestion, dark, darkRatio: contrastRatio(dark, PAPER_DARK) };
}

/* ---------- image checks ---------- */

export interface ImageMeta {
  type: string; // MIME type
  width: number;
  height: number;
  /** True when any pixel is not fully opaque. */
  hasAlpha?: boolean;
  bytes?: number;
}

/** App icon: 1024 × 1024 PNG, no transparency (App Store rule). */
export function iconProblems(m: ImageMeta): string[] {
  const out: string[] = [];
  if (m.type !== 'image/png') out.push('The app icon must be a PNG.');
  if (m.width !== 1024 || m.height !== 1024) out.push(`The app icon must be exactly 1024 × 1024 px (this one is ${m.width} × ${m.height}).`);
  if (m.hasAlpha) out.push('The app icon can’t have transparent areas. Fill the background.');
  if (m.bytes != null && m.bytes > 5 * 1024 * 1024) out.push('Keep the icon under 5 MB.');
  return out;
}

/** Logo or monogram: SVG, or PNG at least 1024 px on its longest side. */
export function logoProblems(m: ImageMeta): string[] {
  if (m.type === 'image/svg+xml') return [];
  if (m.type !== 'image/png') return ['Upload the logo as an SVG or PNG.'];
  return Math.max(m.width, m.height) >= 1024 ? [] : [`PNG logos need to be at least 1024 px wide or tall (this one is ${m.width} × ${m.height}).`];
}

/* ---------- data-use manifest → store privacy answers (W-2) ---------- */

/**
 * What the platform actually collects. The App Store privacy label and Play data-safety answers are
 * derived from this list, so update it whenever a feature starts collecting something new.
 */
export interface DataUse {
  key: string;
  label: string;
  appleCategory: string;
  googleCategory: string;
  purposes: ('App functionality' | 'Analytics' | 'Product personalization')[];
  linkedToUser: boolean;
  optional: boolean;
  /** Only collected when this module is on. */
  module?: ModuleKey;
}

export const DATA_USE: DataUse[] = [
  { key: 'name_email', label: 'Name and email address', appleCategory: 'Contact Info', googleCategory: 'Personal info', purposes: ['App functionality'], linkedToUser: true, optional: false },
  { key: 'health_intake', label: 'Health questionnaire answers (PAR-Q, injuries)', appleCategory: 'Health & Fitness', googleCategory: 'Health and fitness', purposes: ['App functionality'], linkedToUser: true, optional: false },
  { key: 'workouts', label: 'Workout logs', appleCategory: 'Health & Fitness', googleCategory: 'Health and fitness', purposes: ['App functionality', 'Product personalization'], linkedToUser: true, optional: false },
  { key: 'messages', label: 'Messages with your coach', appleCategory: 'User Content', googleCategory: 'Messages', purposes: ['App functionality'], linkedToUser: true, optional: false },
  { key: 'progress_photos', label: 'Progress photos and body measurements', appleCategory: 'Health & Fitness', googleCategory: 'Photos and videos', purposes: ['App functionality'], linkedToUser: true, optional: true, module: 'checkIns' },
  { key: 'form_videos', label: 'Form-check videos', appleCategory: 'User Content', googleCategory: 'Photos and videos', purposes: ['App functionality'], linkedToUser: true, optional: true, module: 'formChecks' },
  { key: 'food_logs', label: 'Food logs', appleCategory: 'Health & Fitness', googleCategory: 'Health and fitness', purposes: ['App functionality'], linkedToUser: true, optional: true, module: 'nutrition' },
  { key: 'purchases', label: 'Purchase history (plan and payment status)', appleCategory: 'Purchases', googleCategory: 'Financial info', purposes: ['App functionality'], linkedToUser: true, optional: false },
  { key: 'diagnostics', label: 'Crash logs and performance data', appleCategory: 'Diagnostics', googleCategory: 'App info and performance', purposes: ['Analytics'], linkedToUser: false, optional: false },
  { key: 'usage', label: 'Product interaction (screens opened)', appleCategory: 'Usage Data', googleCategory: 'App activity', purposes: ['Analytics'], linkedToUser: true, optional: false },
];

export function dataUseFor(t: Pick<TenantConfig, 'modules'>): DataUse[] {
  return DATA_USE.filter((d) => !d.module || t.modules[d.module]);
}

export interface PrivacyAnswers {
  apple: { category: string; items: string[]; linkedToUser: boolean; usedForTracking: false; purposes: string[] }[];
  google: { category: string; items: string[]; collected: true; shared: false; optional: boolean; purposes: string[] }[];
  /** Fixed facts, stated as policy rather than marketing. */
  statements: string[];
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return m;
}

export function privacyAnswers(t: Pick<TenantConfig, 'modules'>): PrivacyAnswers {
  const uses = dataUseFor(t);
  const apple = [...groupBy(uses, (u) => u.appleCategory)].map(([category, us]) => ({
    category,
    items: us.map((u) => u.label),
    linkedToUser: us.some((u) => u.linkedToUser),
    usedForTracking: false as const,
    purposes: [...new Set(us.flatMap((u) => u.purposes))],
  }));
  const google = [...groupBy(uses, (u) => u.googleCategory)].map(([category, us]) => ({
    category,
    items: us.map((u) => u.label),
    collected: true as const,
    shared: false as const,
    optional: us.every((u) => u.optional),
    purposes: [...new Set(us.flatMap((u) => u.purposes))],
  }));
  return {
    apple,
    google,
    statements: [
      'Data is encrypted in transit.',
      'Users can request deletion in the app (Me → Delete account).',
      'No data is used to track users across other companies’ apps or websites.',
      'Progress photos and form-check videos are never used to train AI models.',
    ],
  };
}

/* ---------- store listing kit (W-2) ---------- */

/** Placeholders the trainer must replace. The kit never fills them with invented claims. */
export const PLACEHOLDER_RE = /\[\[[^\]]+\]\]/g;

export function unfilledPlaceholders(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER_RE) ?? [])];
}

export function descriptionTemplate(t: TenantConfig): string {
  const features = [
    'See today’s session, written by your coach, the moment you open the app.',
    'Log every set in a tap, even with no signal. It syncs when you’re back online.',
    `Message ${t.coach.name.split(' ')[0]} directly.`,
    t.modules.formChecks ? 'Send a video of a lift and get feedback drawn right on it.' : null,
    t.modules.checkIns ? 'Weekly check-ins with photos that only you and your coach can see.' : null,
    t.modules.nutrition ? 'Track food against targets your coach sets.' : null,
  ].filter(Boolean);
  return [
    `${t.appName} is the coaching app for ${t.coach.name}’s clients.`,
    '',
    '[[ONE OR TWO SENTENCES ABOUT YOUR COACHING: who it’s for and how you work]]',
    '',
    'In the app:',
    ...features.map((f) => `• ${f}`),
    '',
    'To use the app you need an active coaching plan with [[YOUR BUSINESS NAME]]. [[HOW NEW CLIENTS SIGN UP, e.g. your website]]',
  ].join('\n');
}

export interface ScreenshotSpec {
  key: string;
  screen: string;
  headline: string;
}

/** Screenshots rendered from the trainer's real branded screens; one plain benefit line each. */
export function screenshotPlan(t: TenantConfig): ScreenshotSpec[] {
  const labels = tabLabels(t);
  const all: (ScreenshotSpec & { module?: ModuleKey })[] = [
    { key: 'today', screen: `${labels.today} (session)`, headline: 'Your session, from your coach' },
    { key: 'logger', screen: 'Workout logger', headline: 'Log a set in one tap' },
    { key: 'finish', screen: 'Session finish', headline: 'See what you did' },
    { key: 'coach', screen: `${labels.coach} (messages)`, headline: `Message ${t.coach.name.split(' ')[0]}` },
    { key: 'form_check', screen: 'Form check reply', headline: 'Feedback on your lifts', module: 'formChecks' },
    { key: 'check_in', screen: 'Weekly check-in', headline: 'Check in each week', module: 'checkIns' },
    { key: 'nutrition', screen: 'Nutrition', headline: 'Food targets from your coach', module: 'nutrition' },
    { key: 'history', screen: labels.history, headline: 'Every session, kept' },
  ];
  return all.filter((s) => !s.module || t.modules[s.module]).map(({ module: _m, ...s }) => s);
}

/* ---------- publishing (W-3) ---------- */

export const STORE_STATUSES = ['draft', 'building', 'in_review', 'live', 'rejected'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];
export const STORE_STATUS_LABEL: Record<StoreStatus, string> = {
  draft: 'Draft',
  building: 'Building',
  in_review: 'In review',
  live: 'Live',
  rejected: 'Rejected',
};

export type Store = 'ios' | 'android';
export const STORE_LABEL: Record<Store, string> = { ios: 'App Store', android: 'Google Play' };

export interface PublishState {
  brandSaved: boolean;
  iconUploaded: boolean;
  logoUploaded: boolean;
  appleAccount: boolean;
  googleAccount: boolean;
  credentials: { ios: boolean; android: boolean };
  listingConfirmed: boolean;
  status: Record<Store, StoreStatus>;
}

export interface ChecklistStep {
  key: string;
  title: string;
  detail: string;
  done: boolean;
}

export function publishChecklist(s: PublishState): ChecklistStep[] {
  return [
    { key: 'brand', title: 'Set up your brand', detail: 'Name, colour, icon and welcome message.', done: s.brandSaved && s.iconUploaded },
    { key: 'apple_account', title: 'Create an Apple developer account', detail: 'Apple charges $99 a year. You pay Apple directly, and the account is yours.', done: s.appleAccount },
    { key: 'google_account', title: 'Create a Google Play developer account', detail: 'Google charges a one-time $25. You pay Google directly, and the account is yours.', done: s.googleAccount },
    { key: 'credentials', title: 'Invite Spotter and upload your keys', detail: 'An App Store Connect API key and a Google Play service-account key let Spotter submit builds for you.', done: s.credentials.ios && s.credentials.android },
    { key: 'listing', title: 'Confirm your store listing', detail: 'Fill in the description placeholders and check the privacy answers.', done: s.listingConfirmed },
    { key: 'submit', title: 'Submit for review', detail: 'Both stores review new apps. It usually takes one to a few days.', done: s.status.ios !== 'draft' && s.status.android !== 'draft' },
  ];
}

export interface Readiness {
  missingAssets: string[];
  missingCredentials: Store[];
  brand: BrandProblem[];
  listing: string[];
}

export function publishReadiness(s: PublishState, brand: BrandDraft, description: string): Readiness {
  const missingAssets: string[] = [];
  if (!s.iconUploaded) missingAssets.push('App icon (1024 × 1024 PNG)');
  // A logo is optional: without one the app uses the coach's monogram.
  const missingCredentials = (['ios', 'android'] as const).filter((p) => !s.credentials[p]);
  const listing = unfilledPlaceholders(description).map((p) => `Replace ${p} in the description.`);
  if (!s.listingConfirmed) listing.push('Confirm the listing.');
  return { missingAssets, missingCredentials, brand: brandProblems(brand), listing };
}

export function canSubmit(r: Readiness, store: Store): boolean {
  return !r.missingAssets.length && !r.brand.length && !r.listing.length && !r.missingCredentials.includes(store);
}

/** Common rejection reasons with the fix. Shown next to the store's own message, never instead of it. */
export const REJECTION_GUIDANCE: Record<string, { title: string; fix: string }> = {
  template_4_2_6: {
    title: 'Guideline 4.2.6: apps made from a template',
    fix: 'Apple accepts template-based apps only when the business submits them from its own developer account. Check the app is in your account (not Spotter’s) and that the listing describes your coaching business.',
  },
  login_required: {
    title: 'Guideline 2.1: reviewers couldn’t sign in',
    fix: 'Add a demo client login in App Store Connect → App Review Information so the reviewer can see the app.',
  },
  privacy_policy: {
    title: 'Missing or broken privacy policy',
    fix: 'Check your privacy policy link opens without a login, then resubmit.',
  },
  metadata: {
    title: 'Listing doesn’t match the app',
    fix: 'Make sure every screenshot shows a real screen from your app and the description only mentions features that are switched on.',
  },
  data_safety: {
    title: 'Google Play: data safety form doesn’t match',
    fix: 'Re-copy the data-safety answers from the listing kit; they reflect the modules you have switched on.',
  },
};
