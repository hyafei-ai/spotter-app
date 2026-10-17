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
