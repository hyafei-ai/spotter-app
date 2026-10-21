import { create } from 'zustand';
import { BrandDraft, TenantConfig, applyBrand, demoTenantByCode, normalizeJoinCode } from '@spotter/core';
import { BUILD_TENANT, IS_SHARED, setTenant } from './env';
import { kv } from './storage';

/**
 * Which tenant the client app shows, decided at startup:
 *  1. In the shared Spotter app, the trainer chosen by code (stored on the phone).
 *  2. Otherwise the tenant the app was built for.
 * Then any saved brand edit for that tenant is applied (MOCK in demo builds: the coach app on the same
 * web origin saves it to local storage; real builds get it from the tenants row via sync).
 */
const CODE_KEY = 'spotter.trainerCode';
export const brandKey = (slug: string) => `spotter.brand.${slug}`;

interface RuntimeTenantState {
  tenant: TenantConfig;
  ready: boolean;
  /** True in the shared app until a trainer code has been entered. */
  needsCode: boolean;
  /** Bumped on every change so the root layout remounts with the new branding. */
  rev: number;
}

export const useRuntimeTenant = create<RuntimeTenantState>(() => ({ tenant: BUILD_TENANT, ready: false, needsCode: IS_SHARED, rev: 0 }));

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Looks up a trainer by code: the public tenant_by_code RPC, or the demo tenants. */
export async function lookupCode(code: string): Promise<TenantConfig | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return demoTenantByCode(code);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tenant_by_code`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${SUPABASE_ANON}`, 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error('Couldn’t reach Spotter. Check your connection and try again.');
  const row = (await res.json()) as Partial<TenantConfig> | null;
  if (!row) return null;
  // The RPC returns branding only; fill build-only fields from the shared app's config.
  const parsed = TenantConfig.safeParse({ ...BUILD_TENANT, ...row, joinCode: normalizeJoinCode(code) });
  return parsed.success ? parsed.data : null;
}

async function withBrand(t: TenantConfig): Promise<TenantConfig> {
  try {
    const raw = await kv.getItem(brandKey(t.slug));
    if (!raw) return t;
    const draft = BrandDraft.safeParse(JSON.parse(raw));
    return draft.success ? applyBrand(t, draft.data) : t;
  } catch {
    return t;
  }
}

function show(t: TenantConfig, needsCode: boolean) {
  setTenant(t);
  useRuntimeTenant.setState((s) => ({ tenant: t, ready: true, needsCode, rev: s.rev + 1 }));
}

export async function initRuntimeTenant(): Promise<void> {
  let base = BUILD_TENANT;
  let needsCode = IS_SHARED;
  if (IS_SHARED) {
    const code = await kv.getItem(CODE_KEY).catch(() => null);
    const found = code ? await lookupCode(code).catch(() => null) : null;
    if (found) {
      base = found;
      needsCode = false;
    }
  }
  show(await withBrand(base), needsCode);
}

/** Shared app: resolve a trainer code and re-theme. Returns the trainer, or null for an unknown code. */
export async function joinTrainer(code: string): Promise<TenantConfig | null> {
  const found = await lookupCode(code);
  if (!found) return null;
  await kv.setItem(CODE_KEY, normalizeJoinCode(code));
  show(await withBrand(found), false);
  return found;
}

export async function leaveTrainer(): Promise<void> {
  await kv.removeItem(CODE_KEY);
  show(BUILD_TENANT, IS_SHARED);
}
