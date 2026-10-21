// Small helpers shared by the publishing functions.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-client-info, apikey',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

/** Client acting as the caller, so RLS applies. */
export function userClient(authorization: string): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
}

/** Service-role client. Use only after the caller's permission has been checked with userClient. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

/** Resolves the tenant the caller owns, or null. */
export async function ownedTenant(db: SupabaseClient): Promise<string | null> {
  const { data: user } = await db.auth.getUser();
  if (!user.user) return null;
  const { data } = await db
    .from('memberships')
    .select('tenant_id')
    .eq('profile_id', user.user.id)
    .eq('role', 'owner')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return (data?.tenant_id as string | undefined) ?? null;
}
