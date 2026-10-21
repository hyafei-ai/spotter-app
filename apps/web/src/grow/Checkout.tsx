'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { applyCoupon, formatMoney, onColor, priceLabel, type Plan } from '@spotter/core';
import type { PublicPage } from './server';
import { useGrow } from './useGrow';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface CheckoutItem {
  kind: 'plan' | 'product';
  id: string;
  name: string;
  priceCents: number;
  currency: Plan['currency'];
  label: string;
  trialDays: number;
}

/**
 * Order summary before Stripe Checkout (K-7, C-11). Live: the stripe-checkout Edge Function creates the
 * session on the trainer's connected account and we redirect to Stripe. Demo: a simulated test checkout.
 */
export function Checkout({ initial, planId, productId, referral }: { initial: PublicPage; planId?: string; productId?: string; referral?: string }) {
  const router = useRouter();
  const slug = initial.tenant.slug;
  const [grow, , hydrated] = useGrow(slug);
  const plans = initial.demo && hydrated ? grow.plans : initial.plans;
  const products = initial.demo && hydrated ? grow.products : initial.products;

  const plan = planId ? plans.find((p) => p.id === planId && p.active) : undefined;
  const product = productId ? products.find((p) => p.id === productId) : undefined;
  const item: CheckoutItem | null = plan
    ? { kind: 'plan', id: plan.id, name: plan.name, priceCents: plan.priceCents, currency: plan.currency, label: priceLabel(plan), trialDays: plan.trialDays }
    : product
      ? { kind: 'product', id: product.id, name: product.title, priceCents: product.priceCents, currency: product.currency, label: formatMoney(product.priceCents, product.currency), trialDays: 0 }
      : null;

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<{ code: string; discountCents: number } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const style = { ['--brand' as string]: initial.tenant.brandColor, ['--brand-ink' as string]: onColor(initial.tenant.brandColor) };

  if (!item) {
    return (
      <main className="wrap" style={{ padding: '48px var(--margin)', display: 'grid', gap: 12, ...style }}>
        <h1>That plan isn’t available</h1>
        <p className="muted">It may have been changed or taken down.</p>
        <div>
          <Link className="btn btn-secondary" href={`/${slug}#plans`}>
            See current plans
          </Link>
        </div>
      </main>
    );
  }

  const applyCode = () => {
    setCodeError(null);
    const c = code.trim().toUpperCase();
    if (!c) return;
    if (!initial.demo) {
      // Live: the code is validated by stripe-checkout; show it as entered.
      setApplied({ code: c, discountCents: 0 });
      return;
    }
    const coupon = grow.coupons.find((x) => x.code === c) ?? null;
    if (!coupon) return setCodeError('That code isn’t valid.');
    const res = applyCoupon(item.priceCents, coupon);
    if (!res.ok) return setCodeError(res.reason);
    setApplied({ code: c, discountCents: res.discountCents });
  };

  const total = item.priceCents - (applied?.discountCents ?? 0);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const pay = async () => {
    setError(null);
    if (!emailOk) return setError('Enter the email you’ll use for the app.');
    if (typeof navigator !== 'undefined' && !navigator.onLine) return setError('You’re offline. Connect and try again; nothing was charged.');
    setBusy(true);
    const here = window.location.origin;
    try {
      if (initial.demo || !SUPABASE_URL || !ANON) {
        const q = new URLSearchParams({ kind: item.kind, id: item.id, email: email.trim(), total: String(total) });
        if (applied) q.set('coupon', applied.code);
        if (referral) q.set('ref', referral);
        router.push(`/${slug}/checkout/test?${q.toString()}`);
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: slug,
          ...(item.kind === 'plan' ? { planId: item.id } : { productId: item.id }),
          couponCode: applied?.code,
          referralCode: referral,
          email: email.trim(),
          successUrl: `${here}/${slug}/welcome?${item.kind}=${encodeURIComponent(item.id)}`,
          cancelUrl: `${here}/${slug}/checkout?${item.kind}=${encodeURIComponent(item.id)}`,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Checkout didn’t open. Nothing was charged; try again.');
      window.location.assign(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout didn’t open. Nothing was charged; try again.');
      setBusy(false);
    }
  };

  return (
    <main className="wrap" style={{ padding: '32px var(--margin) 64px', display: 'grid', gap: 24, maxWidth: 560, ...style }}>
      <Link href={`/${slug}`} className="muted">
        ← {initial.tenant.appName}
      </Link>
      <div style={{ display: 'grid', gap: 6 }}>
        <span className="label">Checkout</span>
        <h1 style={{ fontSize: 36 }}>{item.name}</h1>
        <span>{item.label}</span>
        {item.trialDays ? <span className="muted">Free for {item.trialDays} days, then {item.label}. Cancel any time before the trial ends and you won’t be charged.</span> : null}
      </div>

      <div className="field">
        <label className="label" htmlFor="checkout-email">
          Email
        </label>
        <input
          id="checkout-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-describedby="checkout-email-hint"
        />
        <span id="checkout-email-hint" className="muted" style={{ fontSize: 13 }}>
          Your invite to the app goes here.
        </span>
      </div>

      <div className="field">
        <label className="label" htmlFor="coupon">
          Discount code (optional)
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="coupon" style={{ flex: 1 }} value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" aria-invalid={!!codeError} />
          <button type="button" className="btn btn-secondary" onClick={applyCode}>
            Apply code
          </button>
        </div>
        {codeError ? <span role="alert" style={{ color: 'var(--error)', fontSize: 13 }}>{codeError}</span> : null}
        {applied && applied.discountCents > 0 ? (
          <span style={{ color: 'var(--success)', fontSize: 13 }}>
            {applied.code} applied: {formatMoney(applied.discountCents, item.currency)} off
          </span>
        ) : null}
      </div>

      {referral ? <p className="muted" style={{ margin: 0 }}>Referred by a friend (code {referral}).</p> : null}

      <div className="row" style={{ borderTop: '1px solid var(--line)' }}>
        <span style={{ flex: 1 }}>{item.trialDays ? 'Due after your trial' : 'Total today'}</span>
        <strong style={{ fontFamily: 'var(--display)', fontSize: 26 }}>{formatMoney(total, item.currency)}</strong>
      </div>

      {error ? (
        <p role="alert" style={{ color: 'var(--error)', margin: 0 }}>
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary" onClick={() => void pay()} disabled={busy}>
        {busy ? 'Opening checkout…' : 'Continue to payment'}
      </button>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Payments are processed by Stripe for {initial.tenant.appName}. Card details never touch this site.
      </p>
    </main>
  );
}
