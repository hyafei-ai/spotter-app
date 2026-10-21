// POST /tenants/:id/publish (W-2): checks the owner's brand, assets and store credentials, then queues
// one publish_jobs row per platform. scripts/tenant-build.mjs (the build worker) picks queued jobs up,
// runs EAS with the tenant's config and moves them through building → in review → live / rejected.
import { TenantsPublishRequest } from '../_shared/schemas.ts';
import { cors, json, ownedTenant, userClient } from '../_shared/publish_http.ts';

const HEX = /^#[0-9A-Fa-f]{6}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const authorization = req.headers.get('authorization');
  if (!authorization) return json(401, { error: 'Sign in again to publish.' });

  const parsed = TenantsPublishRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Pick at least one store.' });

  const db = userClient(authorization);
  const tenantId = await ownedTenant(db);
  if (!tenantId) return json(403, { error: 'Only the business owner can publish the app.' });

  const { data: t, error } = await db
    .from('tenants')
    .select('app_name, short_name, brand_color, icon_url, support_email, privacy_policy_url, coach_profile')
    .eq('id', tenantId)
    .single();
  if (error || !t) return json(404, { error: 'Business not found.' });

  // Same rules the dashboard shows (packages/core brandProblems), re-checked server-side.
  const problems: string[] = [];
  if (!t.app_name || t.app_name.length > 30) problems.push('App name is missing or longer than 30 characters.');
  if (!t.short_name) problems.push('Short name is missing.');
  if (!HEX.test(t.brand_color ?? '')) problems.push('Accent colour is missing.');
  if (!t.icon_url) problems.push('App icon is missing.');
  if (!t.support_email) problems.push('Support email is missing.');
  if (!t.privacy_policy_url) problems.push('Privacy policy link is missing.');

  const { data: creds } = await db.from('store_credentials').select('platform');
  const have = new Set((creds ?? []).map((c: { platform: string }) => c.platform));
  const missingCredentials = parsed.data.platforms.filter((p) => !have.has(p));

  const { data: kit } = await db.from('listing_kits').select('confirmed_at').eq('tenant_id', tenantId).maybeSingle();
  if (parsed.data.kind === 'submit' && !kit?.confirmed_at) problems.push('Confirm the store listing first.');

  if (problems.length || missingCredentials.length) {
    return json(409, { error: 'Not ready to publish yet.', problems, missingCredentials });
  }

  const { data: user } = await db.auth.getUser();
  const rows = parsed.data.platforms.map((platform) => ({
    tenant_id: tenantId,
    platform,
    kind: parsed.data.kind,
    status: 'queued',
    store_status: 'building',
    requested_by: user.user?.id,
  }));
  const { data: jobs, error: insErr } = await db.from('publish_jobs').insert(rows).select('id, platform, kind, status');
  if (insErr) return json(500, { error: insErr.message });
  return json(202, { jobs });
});
