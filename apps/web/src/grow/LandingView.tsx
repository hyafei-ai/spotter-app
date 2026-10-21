'use client';

import Link from 'next/link';
import { onColor, priceLabel, type LandingBlock, type Plan } from '@spotter/core';
import type { PublicPage } from './server';
import { useGrow } from './useGrow';
import { LeadForm } from './LeadForm';

/**
 * Trainer landing page (K-6), rendered from blocks. All copy is the trainer's. In demo mode the
 * dashboard's local edits are applied on top of the server's starting data.
 */
export function LandingView({ initial, preview = false }: { initial: PublicPage; preview?: boolean }) {
  const slug = initial.tenant.slug;
  const [grow, , hydrated] = useGrow(slug);
  const demo = initial.demo;
  const blocks: LandingBlock[] = demo && hydrated ? (grow.page.published || preview ? grow.page.blocks : []) : initial.blocks;
  const plans: Plan[] = demo && hydrated ? grow.plans.filter((p) => p.active) : initial.plans;
  const chargesEnabled = demo && hydrated ? grow.stripe.chargesEnabled : initial.tenant.chargesEnabled;

  return (
    <div style={{ ['--brand' as string]: initial.tenant.brandColor, ['--brand-ink' as string]: onColor(initial.tenant.brandColor) }}>
      {demo && !preview ? (
        <div role="note" className="muted" style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface)', padding: '8px var(--margin)', fontSize: 14 }}>
          Demo page with sample text. Payments are simulated; no card is charged.
        </div>
      ) : null}
      <header className="wrap" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px var(--margin)' }}>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--brand)', color: 'var(--brand-ink)', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontWeight: 600 }}>
          {initial.tenant.coachName
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')}
        </span>
        <strong style={{ fontFamily: 'var(--display)', fontSize: 22 }}>{initial.tenant.appName}</strong>
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          {plans.length ? <a href="#plans">Plans</a> : null}
          <Link href={`/${slug}/programs`}>Programs</Link>
        </nav>
      </header>

      {blocks.length === 0 ? (
        <main className="wrap" style={{ padding: '64px var(--margin)', display: 'grid', gap: 12 }}>
          <h1>{initial.tenant.appName}</h1>
          <p className="muted">This page isn’t live yet.</p>
        </main>
      ) : (
        <main>
          {blocks.map((b) => (
            <Block key={b.id} block={b} plans={plans} slug={slug} chargesEnabled={chargesEnabled} preview={preview} demo={demo} />
          ))}
        </main>
      )}
      <footer className="wrap muted" style={{ padding: '48px var(--margin)', fontSize: 13, borderTop: '1px solid var(--line)', marginTop: 48 }}>
        {initial.tenant.appName} · Payments handled by Stripe. Coaching app by Spotter.
      </footer>
    </div>
  );
}

function Block({ block: b, plans, slug, chargesEnabled, preview, demo }: { block: LandingBlock; plans: Plan[]; slug: string; chargesEnabled: boolean; preview: boolean; demo: boolean }) {
  switch (b.type) {
    case 'hero':
      return (
        <section className="wrap" style={{ padding: '56px var(--margin) 40px', display: 'grid', gap: 16, maxWidth: 760 }}>
          <h1 style={{ fontSize: 'clamp(40px, 7vw, 64px)' }}>{b.heading || 'Your headline'}</h1>
          {b.subheading ? <p style={{ fontSize: 19, margin: 0, maxWidth: 600 }}>{b.subheading}</p> : null}
          {b.ctaLabel ? (
            <div>
              <a className="btn btn-primary" href="#plans">
                {b.ctaLabel}
              </a>
            </div>
          ) : null}
        </section>
      );
    case 'about':
      return (
        <section className="wrap" style={{ padding: '32px var(--margin)', maxWidth: 760 }}>
          <h2 style={{ marginBottom: 12 }}>{b.heading}</h2>
          {b.body.split(/\n{2,}/).map((p, i) => (
            <p key={i} style={{ marginTop: 0 }}>
              {p}
            </p>
          ))}
        </section>
      );
    case 'plans': {
      const chosen = b.planIds.map((id) => plans.find((p) => p.id === id)).filter((p): p is Plan => !!p);
      return (
        <section id="plans" className="wrap" style={{ padding: '32px var(--margin)' }}>
          <h2 style={{ marginBottom: 16 }}>{b.heading}</h2>
          {chosen.length === 0 ? (
            <p className="muted">Plans are coming soon.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {chosen.map((p) => (
                <li key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sheet)', padding: 20, display: 'grid', gap: 8, alignContent: 'start', background: 'var(--surface)' }}>
                  <h3 style={{ fontSize: 22 }}>{p.name}</h3>
                  <strong style={{ fontFamily: 'var(--display)', fontSize: 28 }}>{priceLabel(p)}</strong>
                  {p.trialDays ? <span className="label">{p.trialDays}-day free trial</span> : null}
                  <p className="muted" style={{ margin: 0 }}>
                    {p.description}
                  </p>
                  {preview ? (
                    <span className="btn btn-primary" aria-disabled>
                      Choose {p.name}
                    </span>
                  ) : chargesEnabled ? (
                    <Link className="btn btn-primary" href={`/${slug}/checkout?plan=${encodeURIComponent(p.id)}`}>
                      Choose {p.name}
                    </Link>
                  ) : (
                    <span className="muted">Sign-ups open soon. Use the form below to get in touch.</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    }
    case 'faq':
      return (
        <section className="wrap" style={{ padding: '32px var(--margin)', maxWidth: 760 }}>
          <h2 style={{ marginBottom: 12 }}>{b.heading}</h2>
          {b.items.map((it, i) => (
            <details key={i} style={{ borderBottom: '1px solid var(--line)', padding: '14px 0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 24 }}>{it.q}</summary>
              <p style={{ marginBottom: 0 }}>{it.a}</p>
            </details>
          ))}
        </section>
      );
    case 'lead_form':
      return (
        <section className="wrap" style={{ padding: '32px var(--margin)', maxWidth: 560 }}>
          <h2 style={{ marginBottom: 8 }}>{b.heading}</h2>
          {b.body ? <p className="muted">{b.body}</p> : null}
          <LeadForm slug={slug} disabled={preview} demo={demo} />
        </section>
      );
  }
}
