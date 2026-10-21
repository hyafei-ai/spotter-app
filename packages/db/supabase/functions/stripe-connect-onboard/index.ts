// POST /stripe/connect/onboard (K-7): returns a Stripe Connect Express onboarding link for the
// signed-in owner's tenant, creating the connected account on first use.
import { ReturnUrlsRequest } from '../_shared/schemas.ts';
import { adminClient, cors, json, ownedTenant, stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const parsed = ReturnUrlsRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Send returnUrl.' });

  const tenant = await ownedTenant(req);
  if (!tenant) return json(403, { error: 'Only the business owner can connect payments.' });

  const s = stripe();
  let accountId = tenant.stripe_account_id;
  if (!accountId) {
    const account = await s.accounts.create({
      type: 'express',
      email: tenant.support_email ?? undefined,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { tenant_id: tenant.id },
    });
    accountId = account.id;
    await adminClient().from('tenants').update({ stripe_account_id: accountId }).eq('id', tenant.id);
  }

  const link = await s.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    return_url: parsed.data.returnUrl,
    refresh_url: parsed.data.refreshUrl ?? parsed.data.returnUrl,
  });
  return json(200, { url: link.url });
});
