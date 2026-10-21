// POST /stripe/portal (C-10, C-11): a Stripe billing portal link for the signed-in client, on their
// trainer's connected account. The app only shows the link where store rules allow (canLinkToPurchase).
import { ReturnUrlsRequest } from '../_shared/schemas.ts';
import { adminClient, callerId, cors, json, stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const parsed = ReturnUrlsRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Send returnUrl.' });

  const uid = await callerId(req);
  if (!uid) return json(401, { error: 'Sign in again to manage billing.' });

  const { data: sub } = await adminClient()
    .from('subscriptions')
    .select('stripe_customer_id, tenants(stripe_account_id)')
    .eq('client_id', uid)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const account = (sub?.tenants as unknown as { stripe_account_id: string | null } | null)?.stripe_account_id;
  if (!sub?.stripe_customer_id || !account) return json(404, { error: 'No billing on file yet.' });

  const portal = await stripe().billingPortal.sessions.create(
    { customer: sub.stripe_customer_id, return_url: parsed.data.returnUrl },
    { stripeAccount: account },
  );
  return json(200, { url: portal.url });
});
