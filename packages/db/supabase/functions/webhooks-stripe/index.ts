// POST /webhooks/stripe: Connect webhook. Verifies the signature, then mirrors the event into
// subscriptions/payments/session_packs and triage via public.stripe_apply_event (idempotent per event id).
// Failed-payment retries are Stripe's job (Smart Retries in Billing settings); each failure re-flags the
// coach only once, and the next successful payment clears the flag.
import Stripe from 'npm:stripe@^23';
import { adminClient, env, feeBps, json, stripe } from '../_shared/stripe.ts';

const HANDLED = new Set([
  'account.updated',
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const signature = req.headers.get('stripe-signature');
  if (!signature) return json(400, { error: 'Missing signature' });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, env('STRIPE_WEBHOOK_SECRET'), undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return json(400, { error: 'Bad signature' });
  }
  if (!HANDLED.has(event.type)) return json(200, { received: true, applied: 'ignored' });

  const { data, error } = await adminClient().rpc('stripe_apply_event', { event, fee_bps: feeBps() });
  // A 500 makes Stripe retry later; the function is idempotent, so retries are safe.
  if (error) return json(500, { error: error.message });
  return json(200, { received: true, applied: data });
});
