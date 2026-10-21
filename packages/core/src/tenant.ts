import { z } from 'zod';
import demoTenants from './demo-tenants.json';

/** Tenant config (W-1/W-2). Mirrors the `tenants` table; read by app.config.ts at build time and refreshed at runtime. */
export const TenantModules = z.object({
  nutrition: z.boolean(),
  checkIns: z.boolean(),
  formChecks: z.boolean(),
  habits: z.boolean(),
  storefront: z.boolean(),
});

/** Tab labels a trainer may pick from (W-1 deep branding). '{coach}' renders the coach's first name. */
export const TAB_LABEL_OPTIONS = {
  today: ['Today', 'Train', 'Plan'],
  history: ['History', 'Log', 'Progress'],
  coach: ['{coach}', 'Coach', 'Messages', 'Chat'],
  me: ['Me', 'Profile', 'Account'],
} as const;
export type TabKey = keyof typeof TAB_LABEL_OPTIONS;

export const TenantTabs = z.object({
  today: z.enum(TAB_LABEL_OPTIONS.today),
  history: z.enum(TAB_LABEL_OPTIONS.history),
  coach: z.enum(TAB_LABEL_OPTIONS.coach),
  me: z.enum(TAB_LABEL_OPTIONS.me),
});
export type TenantTabs = z.infer<typeof TenantTabs>;
export const DEFAULT_TABS: TenantTabs = { today: 'Today', history: 'History', coach: '{coach}', me: 'Me' };

export const TenantConfig = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  appName: z.string().min(1).max(30),
  shortName: z.string().min(1).max(12),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  units: z.enum(['kg', 'lb']),
  /** Smallest loadable change shown on the weight stepper, in the tenant unit. */
  weightIncrement: z.number().positive(),
  coach: z.object({
    name: z.string(),
    monogram: z.string().min(1).max(3),
    welcomeMessage: z.string().max(400),
    restDayLine: z.string().max(200),
  }),
  supportEmail: z.string().email(),
  privacyPolicyUrl: z.string().url(),
  modules: TenantModules,
  bundleIds: z.object({ ios: z.string(), android: z.string() }),
  scheme: z.string(),
  updateChannel: z.string(),
  /* Optional branding and build fields (W-1/W-2). Missing values fall back to defaults. */
  tabs: TenantTabs.optional(),
  /** Code a client types into the shared Spotter app to load this trainer's branding (W-3 fallback). */
  joinCode: z.string().regex(/^[A-Z0-9]{4,12}$/).optional(),
  splashBackground: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  logoUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
  easProjectId: z.string().optional(),
});
export type TenantConfig = z.infer<typeof TenantConfig>;

/*
 * MOCK DATA — demo tenants for development and the preview build (demo-tenants.json). Both businesses
 * are fictional. Real tenants come from the `tenants` table. Kept as JSON so app.config.ts can read it
 * without a TypeScript loader.
 */
export const DEMO_TENANTS = demoTenants as Record<string, TenantConfig>;

export const DEFAULT_TENANT = 'maya-reyes-strength';

export function resolveTenant(id: string | undefined | null): TenantConfig {
  const t = DEMO_TENANTS[id ?? DEFAULT_TENANT] ?? DEMO_TENANTS[DEFAULT_TENANT]!;
  return TenantConfig.parse(t);
}
