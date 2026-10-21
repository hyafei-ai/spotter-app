// POST /stripe/checkout (K-6, K-7, C-11): Stripe Checkout for a plan or a storefront program.
// The trainer is merchant of record: the session is created on their connected account (direct charge),
// and Spotter's cut is an application fee (PLATFORM_FEE_BPS). Free trials, coupons and referral codes
// are applied here so the price shown on the page is the price charged.
import { CheckoutRequest } from '../_shared/schemas.ts';
import { adminClient, callerId, cors, feeBps, json, stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const parsed = CheckoutRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: parsed.error.issues[0]?.message ?? 'Invalid request.' });
  const r = parsed.data;

  const db = adminClient();
  const { data: tenant } = await db.from('tenants').select('id, stripe_account_id, stripe_charges_enabled').eq('slug', r.tenantSlug).maybeSingle();
  if (!tenant?.stripe_account_id || !tenant.stripe_charges_enabled) {
    return json(409, { error: 'This coach isn’t taking payments yet.' });
  }

  const item = r.planId
    ? (await db.from('plans').select('*').eq('id', r.planId).eq('tenant_id', tenant.id).eq('active', true).maybeSingle()).data
    : (await db.from('storefront_products').select('*').eq('id', r.productId!).eq('tenant_id', tenant.id).eq('active', true).maybeSingle()).data;
  if (!item) return json(404, { error: 'That plan isn’t available any more.' });

  // Coupons are validated here, then applied as a Stripe coupon on the connected account.
  let stripeCoupon: string | undefined;
  if (r.couponCode) {
    const { data: c } = await db.from('coupons').select('*').eq('tenant_id', tenant.id).eq('code', r.couponCode.toUpperCase()).maybeSingle();
    const expired = c?.expires_at && Date.parse(c.expires_at) < Date.now();
    const usedUp = c?.max_redemptions != null && c.redemptions >= c.max_redemptions;
    if (!c || expired || usedUp) return json(422, { error: 'That code isn’t valid.' });
    stripeCoupon = c.stripe_coupon_id ?? undefined;
  }

  const clientId = await callerId(req);
  const recurring = 'kind' in item && (item.kind === 'monthly' || item.kind === 'weekly');
  const metadata: Record<string, string> = {
    tenant_id: tenant.id,
    ...(clientId ? { client_id: clientId } : {}),
    ...(r.planId ? { plan_id: r.planId } : { product_id: r.productId! }),
    ...(r.referralCode ? { referral_code: r.referralCode.toUpperCase() } : {}),
    ...(r.couponCode ? { coupon_code: r.couponCode.toUpperCase() } : {}),
  };
  const price_data = {
    currency: item.currency,
    unit_amount: item.price_cents,
    product_data: { name: 'name' in item ? item.name : item.title },
    ...(recurring ? { recurring: { interval: item.kind === 'weekly' ? ('week' as const) : ('month' as const) } } : {}),
  };
  const bps = feeBps();
  const session = await stripe().checkout.sessions.create(
    {
      mode: recurring ? 'subscription' : 'payment',
      line_items: [{ quantity: 1, price: item.stripe_price_id ?? undefined, ...(item.stripe_price_id ? {} : { price_data }) }],
      customer_email: r.email,
      success_url: `${r.successUrl}${r.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: r.cancelUrl,
      discounts: stripeCoupon ? [{ coupon: stripeCoupon }] : undefined,
      allow_promotion_codes: stripeCoupon ? undefined : false,
      metadata,
      ...(recurring
        ? {
            subscription_data: {
              metadata,
              trial_period_days: 'trial_days' in item && item.trial_days > 0 ? item.trial_days : undefined,
              application_fee_percent: bps ? bps / 100 : undefined,
            },
          }
        : { payment_intent_data: { metadata, application_fee_amount: Math.floor((item.price_cents * bps) / 10_000) || undefined } }),
    },
    { stripeAccount: tenant.stripe_account_id },
  );
  return json(200, { url: session.url });
});
