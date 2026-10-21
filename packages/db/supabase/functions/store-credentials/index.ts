// POST /store-credentials: the guided upload for an App Store Connect API key or a Google Play
// service-account JSON (W-2). The secret is encrypted here and stored as ciphertext; it is never
// returned. Owners see only a fingerprint and non-secret metadata.
import { StoreCredentialUpload } from '../_shared/schemas.ts';
import { seal } from '../_shared/envelope.ts';
import { cors, json, ownedTenant, serviceClient, userClient } from '../_shared/publish_http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const authorization = req.headers.get('authorization');
  if (!authorization) return json(401, { error: 'Sign in again to upload keys.' });

  const parsed = StoreCredentialUpload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: parsed.error.issues[0]?.message ?? 'That file doesn’t look like a store key.' });

  const tenantId = await ownedTenant(userClient(authorization));
  if (!tenantId) return json(403, { error: 'Only the business owner can upload store keys.' });

  const input = parsed.data;
  const secret = input.platform === 'ios' ? input.privateKeyP8 : input.serviceAccountJson;
  const meta =
    input.platform === 'ios'
      ? { keyId: input.keyId, issuerId: input.issuerId }
      : { clientEmail: (JSON.parse(input.serviceAccountJson) as { client_email: string }).client_email };

  let sealed;
  try {
    sealed = await seal(secret);
  } catch (e) {
    return json(500, { error: `Keys can’t be stored right now (${(e as Error).message}).` });
  }

  const { data: user } = await userClient(authorization).auth.getUser();
  const { error } = await serviceClient()
    .from('store_credentials')
    .upsert({ tenant_id: tenantId, platform: input.platform, ...sealed, meta, uploaded_by: user.user?.id }, { onConflict: 'tenant_id,platform' });
  if (error) return json(500, { error: error.message });

  await serviceClient().from('audit_log').insert({ tenant_id: tenantId, actor_id: user.user?.id, action: 'store_credentials_uploaded', target: input.platform });
  return json(200, { platform: input.platform, fingerprint: sealed.fingerprint, meta });
});
