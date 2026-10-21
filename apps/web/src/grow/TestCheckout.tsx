'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatMoney, onColor } from '@spotter/core';
import type { PublicPage } from './server';
import { useGrow } from './useGrow';

/**
 * MOCK: stands in for Stripe Checkout in the demo. Shaped like Stripe test mode, takes no card
 * details and charges nothing. Records the purchase locally so the coach dashboard can show it.
 */
export function TestCheckout({
  initial,
  kind,
  id,
  email,
  total,
  coupon,
  referral,
}: {
  initial: PublicPage;
  kind: 'plan' | 'product';
  id: string;
  email: string;
  total: number;
  coupon?: string;
  referral?: string;
}) {
  const router = useRouter();
  const slug = initial.tenant.slug;
  const [grow, saveGrow] = useGrow(slug);
  const [state, setState] = useState<'idle' | 'paying' | 'declined'>('idle');
  const plan = kind === 'plan' ? grow.plans.find((p) => p.id === id) : undefined;
  const product = kind === 'product' ? grow.products.find((p) => p.id === id) : undefined;
  const name = plan?.name ?? product?.title ?? 'Your purchase';
  const currency = plan?.currency ?? product?.currency ?? 'usd';

  const pay = (decline: boolean) => {
    setState('paying');
    setTimeout(() => {
      saveGrow((g) => ({
        ...g,
        purchases: [
          { id: `pay-${Date.now()}`, item: name, amountCents: total, currency, email, at: new Date().toISOString(), status: decline ? 'failed' : 'succeeded' },
          ...g.purchases,
        ],
        coupons: !decline && coupon ? g.coupons.map((c) => (c.code === coupon ? { ...c, redemptions: c.redemptions + 1 } : c)) : g.coupons,
      }));
      if (decline) return setState('declined');
      const q = new URLSearchParams({ [kind]: id });
      if (referral) q.set('ref', referral);
      router.push(`/${slug}/welcome?${q.toString()}`);
    }, 700);
  };

  return (
    <main
      className="wrap"
      style={{ padding: '32px var(--margin) 64px', display: 'grid', gap: 20, maxWidth: 520, ['--brand' as string]: initial.tenant.brandColor, ['--brand-ink' as string]: onColor(initial.tenant.brandColor) }}
    >
      <div role="note" style={{ border: '1px dashed var(--warning)', borderRadius: 'var(--r)', padding: 12, color: 'var(--ink2)' }}>
        <strong style={{ color: 'var(--warning)' }}>Test checkout (simulated).</strong> In the live app this step is Stripe’s own checkout page. No card is
        asked for and nothing is charged here.
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span className="label">Paying {initial.tenant.appName}</span>
        <h1 style={{ fontSize: 34 }}>{name}</h1>
        <span className="muted">{email}</span>
      </div>
      <div className="row" style={{ borderTop: '1px solid var(--line)' }}>
        <span style={{ flex: 1 }}>{plan?.trialDays ? 'Due after your trial' : 'Total'}</span>
        <strong style={{ fontFamily: 'var(--display)', fontSize: 26 }}>{formatMoney(total, currency)}</strong>
      </div>
      {state === 'declined' ? (
        <p role="alert" style={{ color: 'var(--error)', margin: 0 }}>
          The card was declined. No payment was taken. Try another card.
        </p>
      ) : null}
      <button className="btn btn-primary" disabled={state === 'paying'} onClick={() => pay(false)}>
        {state === 'paying' ? 'Processing…' : `Pay ${formatMoney(total, currency)} (test)`}
      </button>
      <button className="btn btn-secondary" disabled={state === 'paying'} onClick={() => pay(true)}>
        Try a declined card (test)
      </button>
      <button className="btn" style={{ background: 'transparent', color: 'var(--ink2)' }} onClick={() => router.back()}>
        Back
      </button>
    </main>
  );
}
