// Shared helpers for the Stripe Edge Functions. Secrets come from the function environment only:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PLATFORM_FEE_BPS, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import Stripe from 'npm:stripe@^23';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-client-info, apikey, stripe-signature',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function stripe(): Stripe {
  return new Stripe(env('STRIPE_SECRET_KEY'), { httpClient: Stripe.createFetchHttpClient() });
}

export function feeBps(): number {
  const n = Number(Deno.env.get('PLATFORM_FEE_BPS') ?? '0');
  return Number.isFinite(n) && n >= 0 && n <= 2000 ? Math.floor(n) : 0;
}

/** Client acting as the caller (RLS applies). */
export function userClient(req: Request): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false },
  });
}

/** Service-role client for webhook mirroring and lookups that must not depend on the caller. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** The caller's user id, or null when the request isn't signed in. */
export async function callerId(req: Request): Promise<string | null> {
  if (!req.headers.get('authorization')) return null;
  const { data } = await userClient(req).auth.getUser();
  return data.user?.id ?? null;
}

/** Tenant the caller owns (Stripe settings are owner-only). */
export async function ownedTenant(req: Request): Promise<{ id: string; slug: string; stripe_account_id: string | null; support_email: string | null } | null> {
  const uid = await callerId(req);
  if (!uid) return null;
  const { data } = await adminClient()
    .from('memberships')
    .select('tenant_id, tenants(id, slug, stripe_account_id, support_email)')
    .eq('profile_id', uid)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();
  return (data?.tenants as unknown as { id: string; slug: string; stripe_account_id: string | null; support_email: string | null }) ?? null;
}
