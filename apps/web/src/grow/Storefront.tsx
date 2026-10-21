'use client';

import Link from 'next/link';
import { formatMoney, onColor } from '@spotter/core';
import type { PublicPage } from './server';
import { useGrow } from './useGrow';

export function Storefront({ initial }: { initial: PublicPage }) {
  const slug = initial.tenant.slug;
  const [grow, , hydrated] = useGrow(slug);
  const products = initial.demo && hydrated ? grow.products.filter((p) => p.active) : initial.products;
  const chargesEnabled = initial.demo && hydrated ? grow.stripe.chargesEnabled : initial.tenant.chargesEnabled;

  return (
    <main
      className="wrap"
      style={{ padding: '32px var(--margin) 64px', display: 'grid', gap: 20, ['--brand' as string]: initial.tenant.brandColor, ['--brand-ink' as string]: onColor(initial.tenant.brandColor) }}
    >
      <Link href={`/${slug}`} className="muted">
        ← {initial.tenant.appName}
      </Link>
      <div style={{ display: 'grid', gap: 8 }}>
        <h1>Programs</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
          Follow a program on your own in the {initial.tenant.appName} app. These don’t include messaging with {initial.tenant.coachName.split(' ')[0]}.
        </p>
      </div>
      {initial.demo ? (
        <p role="note" className="muted" style={{ margin: 0, fontSize: 14 }}>
          Demo storefront. Payments are simulated; no card is charged.
        </p>
      ) : null}
      {products.length === 0 ? (
        <p className="muted">No programs for sale right now.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {products.map((p) => (
            <li key={p.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', paddingBlock: 20 }}>
              <div style={{ flex: '1 1 320px', display: 'grid', gap: 4 }}>
                <h2 style={{ fontSize: 24 }}>{p.title}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {p.description}
                </p>
              </div>
              <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 26 }}>{formatMoney(p.priceCents, p.currency)}</strong>
                {chargesEnabled ? (
                  <Link className="btn btn-primary" href={`/${slug}/checkout?product=${encodeURIComponent(p.id)}`}>
                    Buy {p.title.split(' · ')[0]}
                  </Link>
                ) : (
                  <span className="muted">Not on sale yet</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
