'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import {
  BLOCK_LABEL,
  DEMO_TENANTS,
  LEAD_STATUS_LABEL,
  PLAN_KIND_LABEL,
  businessStats,
  formatMoney,
  landingProblems,
  moveBlock,
  newBlock,
  onColor,
  priceLabel,
  rewardLabel,
  type Coupon,
  type LandingBlock,
  type LandingBlockType,
  type LeadStatus,
  type Plan,
  type PlanKind,
} from '@spotter/core';
import { demoSubscriptions } from '@spotter/core/demo';
import { useGrow } from '../useGrow';
import { defaultGrow, type GrowState } from '../state';
import { LandingPreview } from './LandingPreview';
import { TABS, type Tab } from './tabs';

const TAB_LABEL: Record<Tab, string> = {
  page: 'Landing page',
  plans: 'Plans and codes',
  leads: 'Leads',
  referrals: 'Referrals',
  storefront: 'Storefront',
  payments: 'Payments and stats',
};

/** /dashboard/grow (K-6, K-7). MOCK: edits are kept in this browser until the dashboard signs in to Supabase. */
export function GrowDashboard({ slug, tab }: { slug: string; tab: Tab }) {
  const [grow, save, hydrated] = useGrow(slug);
  const tenant = DEMO_TENANTS[slug];
  if (!tenant) return <p>Unknown business.</p>;
  if (!hydrated) {
    return (
      <div aria-busy style={{ display: 'grid', gap: 12 }}>
        <div style={{ height: 32, width: 200, background: 'var(--line)', borderRadius: 4 }} />
        <div style={{ height: 120, background: 'var(--line)', borderRadius: 4, opacity: 0.6 }} />
      </div>
    );
  }
  const brand = { ['--brand' as string]: tenant.brandColor, ['--brand-ink' as string]: onColor(tenant.brandColor) } as CSSProperties;

  return (
    <div style={{ display: 'grid', gap: 20, ...brand }}>
      <header style={{ display: 'grid', gap: 6 }}>
        <span className="label">Grow · {tenant.appName}</span>
        <h2>{TAB_LABEL[tab]}</h2>
        <nav aria-label="Grow sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/dashboard/grow?tenant=${slug}&tab=${t}`}
              aria-current={t === tab ? 'page' : undefined}
              className="btn"
              style={{
                minHeight: 40,
                padding: '8px 14px',
                border: '1px solid',
                borderColor: t === tab ? 'var(--ink)' : 'var(--line)',
                background: t === tab ? 'var(--ink)' : 'transparent',
                color: t === tab ? 'var(--paper)' : 'var(--ink)',
              }}
            >
              {TAB_LABEL[t]}
            </Link>
          ))}
        </nav>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Demo dashboard: changes are saved in this browser only.{' '}
          <button
            type="button"
            onClick={() => window.confirm('Reset this demo business to its starting data?') && save(defaultGrow(slug))}
            style={{ background: 'none', border: 0, padding: 0, color: 'var(--brand)', font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Reset demo data
          </button>
        </p>
      </header>
      {tab === 'page' ? <PageTab slug={slug} grow={grow} save={save} /> : null}
      {tab === 'plans' ? <PlansTab grow={grow} save={save} /> : null}
      {tab === 'leads' ? <LeadsTab grow={grow} save={save} /> : null}
      {tab === 'referrals' ? <ReferralsTab grow={grow} save={save} /> : null}
      {tab === 'storefront' ? <StorefrontTab slug={slug} grow={grow} save={save} /> : null}
      {tab === 'payments' ? <PaymentsTab slug={slug} grow={grow} save={save} /> : null}
    </div>
  );
}

type Save = (next: GrowState | ((s: GrowState) => GrowState)) => void;

/* ---------- landing page builder ---------- */

function PageTab({ slug, grow, save }: { slug: string; grow: GrowState; save: Save }) {
  const [adding, setAdding] = useState<LandingBlockType>('about');
  const blocks = grow.page.blocks;
  const problems = landingProblems(grow.page, grow.plans);
  const setBlocks = (b: LandingBlock[]) => save((g) => ({ ...g, page: { ...g.page, blocks: b } }));
  const update = (id: string, patch: Partial<LandingBlock>) => setBlocks(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as LandingBlock) : b)));

  return (
    <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
      <section style={{ display: 'grid', gap: 16 }} aria-label="Edit page">
        <div className="row" style={{ borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, display: 'grid', gap: 2 }}>
            <strong>{grow.page.published ? 'Live' : 'Not published'}</strong>
            <span className="muted" style={{ fontSize: 14 }}>
              {grow.page.published ? `Anyone can open /${slug}` : 'Only you can see the preview.'}
            </span>
          </div>
          {grow.page.published ? (
            <button className="btn btn-secondary" onClick={() => save((g) => ({ ...g, page: { ...g.page, published: false } }))}>
              Unpublish
            </button>
          ) : (
            <button className="btn btn-primary" disabled={problems.length > 0} onClick={() => save((g) => ({ ...g, page: { ...g.page, published: true } }))}>
              Publish page
            </button>
          )}
        </div>
        {problems.length && !grow.page.published ? (
          <ul role="status" style={{ margin: 0, paddingLeft: 18, color: 'var(--ink2)' }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        {grow.page.published ? (
          <Link href={`/${slug}`} target="_blank" className="muted">
            Open the live page ↗
          </Link>
        ) : null}

        {blocks.length === 0 ? <p className="muted">No sections yet. Start with an intro.</p> : null}
        {blocks.map((b, i) => (
          <fieldset key={b.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sheet)', padding: 16, display: 'grid', gap: 12, margin: 0 }}>
            <legend className="label" style={{ padding: '0 6px' }}>
              {i + 1}. {BLOCK_LABEL[b.type]}
            </legend>
            <BlockEditor block={b} plans={grow.plans} onChange={(patch) => update(b.id, patch)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" disabled={i === 0} onClick={() => setBlocks(moveBlock(blocks, b.id, -1))} aria-label={`Move ${BLOCK_LABEL[b.type]} up`}>
                Move up
              </button>
              <button className="btn btn-secondary" disabled={i === blocks.length - 1} onClick={() => setBlocks(moveBlock(blocks, b.id, 1))} aria-label={`Move ${BLOCK_LABEL[b.type]} down`}>
                Move down
              </button>
              <button
                className="btn"
                style={{ background: 'transparent', color: 'var(--error)' }}
                onClick={() => window.confirm(`Remove the ${BLOCK_LABEL[b.type].toLowerCase()} section?`) && setBlocks(blocks.filter((x) => x.id !== b.id))}
              >
                Remove section
              </button>
            </div>
          </fieldset>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="label">Add a section</span>
            <select value={adding} onChange={(e) => setAdding(e.target.value as LandingBlockType)}>
              {(Object.keys(BLOCK_LABEL) as LandingBlockType[]).map((t) => (
                <option key={t} value={t}>
                  {BLOCK_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary" onClick={() => setBlocks([...blocks, newBlock(adding, `${adding}-${Date.now()}`)])} disabled={blocks.length >= 20}>
            Add section
          </button>
        </div>
        <label className="field">
          <span className="label">Custom domain (optional)</span>
          <input
            placeholder="coach.example.com"
            value={grow.page.customDomain ?? ''}
            onChange={(e) => save((g) => ({ ...g, page: { ...g.page, customDomain: e.target.value.trim().toLowerCase() || null } }))}
          />
          <span className="muted" style={{ fontSize: 13 }}>
            Point a CNAME at cname.vercel-dns.com; we add the domain to your page. Your page also lives at {slug}.spotter.app.
          </span>
        </label>
      </section>
      <section aria-label="Live preview" style={{ position: 'sticky', top: 16 }}>
        <span className="label">Preview</span>
        <LandingPreview slug={slug} grow={grow} />
      </section>
    </div>
  );
}

function BlockEditor({ block: b, plans, onChange }: { block: LandingBlock; plans: Plan[]; onChange: (p: Partial<LandingBlock>) => void }) {
  const text = (label: string, value: string, key: string, opts: { area?: boolean; max?: number } = {}) => (
    <label className="field">
      <span className="label">{label}</span>
      {opts.area ? (
        <textarea rows={5} maxLength={opts.max} value={value} onChange={(e) => onChange({ [key]: e.target.value } as Partial<LandingBlock>)} />
      ) : (
        <input maxLength={opts.max} value={value} onChange={(e) => onChange({ [key]: e.target.value } as Partial<LandingBlock>)} />
      )}
    </label>
  );
  switch (b.type) {
    case 'hero':
      return (
        <>
          {text('Headline', b.heading, 'heading', { max: 120 })}
          {text('Under the headline', b.subheading, 'subheading', { area: true, max: 300 })}
          {text('Button label', b.ctaLabel, 'ctaLabel', { max: 40 })}
        </>
      );
    case 'about':
      return (
        <>
          {text('Heading', b.heading, 'heading', { max: 120 })}
          {text('Text (blank line between paragraphs)', b.body, 'body', { area: true, max: 3000 })}
        </>
      );
    case 'plans':
      return (
        <>
          {text('Heading', b.heading, 'heading', { max: 120 })}
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            <legend className="label">Plans to show</legend>
            {plans.length === 0 ? <span className="muted">Create a plan under Plans and codes first.</span> : null}
            {plans.map((p) => (
              <label key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={b.planIds.includes(p.id)}
                  onChange={(e) => onChange({ planIds: e.target.checked ? [...b.planIds, p.id] : b.planIds.filter((x) => x !== p.id) })}
                  style={{ width: 20, height: 20 }}
                />
                {p.name} · {priceLabel(p)}
                {!p.active ? <span className="muted">(paused)</span> : null}
              </label>
            ))}
          </fieldset>
        </>
      );
    case 'faq':
      return (
        <>
          {text('Heading', b.heading, 'heading', { max: 120 })}
          {b.items.map((it, i) => (
            <div key={i} style={{ display: 'grid', gap: 6, borderLeft: '2px solid var(--line)', paddingLeft: 10 }}>
              <label className="field">
                <span className="label">Question {i + 1}</span>
                <input value={it.q} maxLength={200} onChange={(e) => onChange({ items: b.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
              </label>
              <label className="field">
                <span className="label">Answer</span>
                <textarea rows={3} value={it.a} maxLength={1000} onChange={(e) => onChange({ items: b.items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
              </label>
              <button className="btn" style={{ background: 'transparent', color: 'var(--error)', justifySelf: 'start', minHeight: 40 }} onClick={() => onChange({ items: b.items.filter((_, j) => j !== i) })}>
                Remove question {i + 1}
              </button>
            </div>
          ))}
          <button className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => onChange({ items: [...b.items, { q: '', a: '' }] })} disabled={b.items.length >= 20}>
            Add a question
          </button>
        </>
      );
    case 'lead_form':
      return (
        <>
          {text('Heading', b.heading, 'heading', { max: 120 })}
          {text('Text above the form', b.body, 'body', { max: 300 })}
        </>
      );
  }
}

/* ---------- plans and coupons ---------- */

const emptyPlan = (): Plan => ({
  id: `plan-${Date.now()}`,
  name: '',
  description: '',
  kind: 'monthly',
  priceCents: 10000,
  currency: 'usd',
  durationWeeks: null,
  sessions: null,
  trialDays: 0,
  active: true,
});

function planProblem(p: Plan): string | null {
  if (!p.name.trim()) return 'Give the plan a name.';
  if (p.priceCents < 50) return 'The price must be at least 0.50.';
  if (p.kind === 'pay_in_full' && !p.durationWeeks) return 'Say how many weeks the package covers.';
  if (p.kind === 'session_pack' && !p.sessions) return 'Say how many sessions are in the pack.';
  return null;
}

function PlansTab({ grow, save }: { grow: GrowState; save: Save }) {
  const [draft, setDraft] = useState<Plan | null>(null);
  const [coupon, setCoupon] = useState({ code: '', kind: 'percent', value: '20', months: '1' });
  const [couponError, setCouponError] = useState<string | null>(null);
  const problem = draft ? planProblem(draft) : null;

  const savePlan = () => {
    if (!draft || problem) return;
    const clean = { ...draft, name: draft.name.trim(), trialDays: draft.kind === 'monthly' || draft.kind === 'weekly' ? draft.trialDays : 0 };
    save((g) => ({ ...g, plans: g.plans.some((p) => p.id === clean.id) ? g.plans.map((p) => (p.id === clean.id ? clean : p)) : [...g.plans, clean] }));
    setDraft(null);
  };

  const addCoupon = () => {
    setCouponError(null);
    const code = coupon.code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,24}$/.test(code)) return setCouponError('Codes are 3–24 letters, numbers or dashes.');
    if (grow.coupons.some((c) => c.code === code)) return setCouponError('You already have that code.');
    const value = Number(coupon.value);
    if (!Number.isInteger(value) || value < 1 || (coupon.kind === 'percent' && value > 100)) return setCouponError('Enter a whole number discount.');
    const c: Coupon = {
      code,
      percentOff: coupon.kind === 'percent' ? value : null,
      amountOffCents: coupon.kind === 'amount' ? value * 100 : null,
      durationMonths: Number(coupon.months) || null,
      expiresAt: null,
      maxRedemptions: null,
      redemptions: 0,
    };
    save((g) => ({ ...g, coupons: [...g.coupons, c] }));
    setCoupon({ ...coupon, code: '' });
  };

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ fontSize: 22 }}>Plans</h3>
        {grow.plans.length === 0 ? <p className="muted">No plans yet. Add your first one.</p> : null}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {grow.plans.map((p) => (
            <li key={p.id} className="row" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1, display: 'grid', gap: 2 }}>
                <strong>
                  {p.name} {!p.active ? <span className="muted">· paused</span> : null}
                </strong>
                <span className="muted" style={{ fontSize: 14 }}>
                  {PLAN_KIND_LABEL[p.kind]} · {priceLabel(p)}
                  {p.trialDays ? ` · ${p.trialDays}-day trial` : ''}
                </span>
              </div>
              <button className="btn btn-secondary" onClick={() => setDraft(p)}>
                Edit
              </button>
              <button className="btn btn-secondary" onClick={() => save((g) => ({ ...g, plans: g.plans.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)) }))}>
                {p.active ? 'Pause sales' : 'Resume sales'}
              </button>
            </li>
          ))}
        </ul>
        {draft ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePlan();
            }}
            style={{ display: 'grid', gap: 12, border: '1px solid var(--line)', borderRadius: 'var(--r-sheet)', padding: 16, maxWidth: 560 }}
            aria-label="Plan details"
          >
            <label className="field">
              <span className="label">Name</span>
              <input value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Type</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as PlanKind })}>
                {(Object.keys(PLAN_KIND_LABEL) as PlanKind[]).map((k) => (
                  <option key={k} value={k}>
                    {PLAN_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="label">Price</span>
                <input
                  inputMode="decimal"
                  value={(draft.priceCents / 100).toString()}
                  onChange={(e) => setDraft({ ...draft, priceCents: Math.round(Number(e.target.value.replace(',', '.')) * 100) || 0 })}
                />
              </label>
              <label className="field">
                <span className="label">Currency</span>
                <select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as Plan['currency'] })}>
                  {['usd', 'gbp', 'eur', 'cad', 'aud'].map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {draft.kind === 'pay_in_full' ? (
              <label className="field">
                <span className="label">Weeks covered</span>
                <input inputMode="numeric" value={draft.durationWeeks ?? ''} onChange={(e) => setDraft({ ...draft, durationWeeks: Number(e.target.value) || null })} />
              </label>
            ) : null}
            {draft.kind === 'session_pack' ? (
              <label className="field">
                <span className="label">In-person sessions</span>
                <input inputMode="numeric" value={draft.sessions ?? ''} onChange={(e) => setDraft({ ...draft, sessions: Number(e.target.value) || null })} />
              </label>
            ) : null}
            {draft.kind === 'monthly' || draft.kind === 'weekly' ? (
              <label className="field">
                <span className="label">Free trial (days, 0 for none)</span>
                <input inputMode="numeric" value={draft.trialDays} onChange={(e) => setDraft({ ...draft, trialDays: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
              </label>
            ) : null}
            <label className="field">
              <span className="label">What’s included</span>
              <textarea rows={3} maxLength={400} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </label>
            {problem ? <span role="alert" style={{ color: 'var(--error)', fontSize: 14 }}>{problem}</span> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={!!problem}>
                Save plan
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Price changes apply to new sign-ups. Existing clients keep their price until you move them.
            </p>
          </form>
        ) : (
          <div>
            <button className="btn btn-secondary" onClick={() => setDraft(emptyPlan())}>
              Add a plan
            </button>
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ fontSize: 22 }}>Discount codes</h3>
        {grow.coupons.length === 0 ? <p className="muted">No codes yet.</p> : null}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {grow.coupons.map((c) => (
            <li key={c.code} className="row">
              <strong style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 0.5 }}>{c.code}</strong>
              <span className="muted" style={{ flex: 1 }}>
                {c.percentOff ? `${c.percentOff}% off` : `${formatMoney(c.amountOffCents ?? 0, grow.plans[0]?.currency ?? 'usd')} off`}
                {c.durationMonths ? ` · ${c.durationMonths === 1 ? 'first month' : `${c.durationMonths} months`}` : ' · first payment'} · used {c.redemptions}
                {c.maxRedemptions ? ` of ${c.maxRedemptions}` : ''}
              </span>
              <button
                className="btn"
                style={{ background: 'transparent', color: 'var(--error)' }}
                onClick={() => window.confirm(`Delete ${c.code}? People who already used it keep their discount.`) && save((g) => ({ ...g, coupons: g.coupons.filter((x) => x.code !== c.code) }))}
              >
                Delete {c.code}
              </button>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <label className="field">
            <span className="label">Code</span>
            <input value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} placeholder="SPRING" />
          </label>
          <label className="field">
            <span className="label">Discount</span>
            <select value={coupon.kind} onChange={(e) => setCoupon({ ...coupon, kind: e.target.value })}>
              <option value="percent">Percent off</option>
              <option value="amount">Amount off</option>
            </select>
          </label>
          <label className="field" style={{ width: 100 }}>
            <span className="label">{coupon.kind === 'percent' ? '%' : 'Amount'}</span>
            <input inputMode="numeric" value={coupon.value} onChange={(e) => setCoupon({ ...coupon, value: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Applies for</span>
            <select value={coupon.months} onChange={(e) => setCoupon({ ...coupon, months: e.target.value })}>
              <option value="0">First payment</option>
              <option value="1">First month</option>
              <option value="3">3 months</option>
            </select>
          </label>
          <button className="btn btn-secondary" onClick={addCoupon}>
            Add code
          </button>
        </div>
        {couponError ? <span role="alert" style={{ color: 'var(--error)', fontSize: 14 }}>{couponError}</span> : null}
      </section>
    </div>
  );
}

/* ---------- leads ---------- */

function LeadsTab({ grow, save }: { grow: GrowState; save: Save }) {
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all');
  const leads = grow.leads.filter((l) => filter === 'all' || l.status === filter);
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <label className="field" style={{ maxWidth: 240 }}>
        <span className="label">Show</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value as LeadStatus | 'all')}>
          <option value="all">All leads ({grow.leads.length})</option>
          {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABEL[s]} ({grow.leads.filter((l) => l.status === s).length})
            </option>
          ))}
        </select>
      </label>
      {grow.leads.length === 0 ? (
        <p className="muted">No leads yet. They arrive here when someone sends the form on your page.</p>
      ) : leads.length === 0 ? (
        <p className="muted">No leads with that status.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {leads.map((l) => (
            <li key={l.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px', display: 'grid', gap: 2 }}>
                <strong>{l.name}</strong>
                <a href={`mailto:${l.email}`} className="muted">
                  {l.email}
                </a>
                {l.message ? <span>“{l.message}”</span> : null}
                <span className="muted" style={{ fontSize: 13 }}>
                  {new Date(l.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {l.source === 'referral' ? `referral${l.referralCode ? ` (${l.referralCode})` : ''}` : 'landing page'}
                </span>
              </div>
              <label className="field">
                <span className="label">Status</span>
                <select
                  aria-label={`Status for ${l.name}`}
                  value={l.status}
                  onChange={(e) => save((g) => ({ ...g, leads: g.leads.map((x) => (x.id === l.id ? { ...x, status: e.target.value as LeadStatus } : x)) }))}
                >
                  {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- referrals ---------- */

function ReferralsTab({ grow, save }: { grow: GrowState; save: Save }) {
  const r = grow.referral;
  const set = (patch: Partial<GrowState['referral']>) => save((g) => ({ ...g, referral: { ...g.referral, ...patch } }));
  const referred = grow.leads.filter((l) => l.source === 'referral');
  return (
    <section style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
        <input type="checkbox" checked={r.enabled} onChange={(e) => set({ enabled: e.target.checked })} style={{ width: 20, height: 20 }} />
        Give each client a referral link
      </label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label className="field">
          <span className="label">Reward for the client who refers</span>
          <select value={r.reward.kind} onChange={(e) => set({ reward: { ...r.reward, kind: e.target.value as GrowState['referral']['reward']['kind'] } })} disabled={!r.enabled}>
            <option value="free_weeks">Free weeks</option>
            <option value="percent_off_month">Percent off a month</option>
            <option value="none">No reward</option>
          </select>
        </label>
        {r.reward.kind !== 'none' ? (
          <label className="field" style={{ width: 120 }}>
            <span className="label">{r.reward.kind === 'free_weeks' ? 'Weeks' : '%'}</span>
            <input
              inputMode="numeric"
              disabled={!r.enabled}
              value={r.reward.value}
              onChange={(e) => set({ reward: { ...r.reward, value: Math.max(0, Math.min(r.reward.kind === 'free_weeks' ? 8 : 100, Number(e.target.value) || 0)) } })}
            />
          </label>
        ) : null}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {r.enabled ? `Clients see: “Share your link. When a friend signs up, you get ${rewardLabel(r.reward).toLowerCase()}.”` : 'Referral links are off.'}
      </p>
      <h3 style={{ fontSize: 22, marginTop: 8 }}>Referred leads</h3>
      {referred.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {referred.map((l) => (
            <li key={l.id} className="row">
              <span style={{ flex: 1 }}>{l.name}</span>
              <span className="muted">{l.referralCode}</span>
              <span>{LEAD_STATUS_LABEL[l.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- storefront ---------- */

function StorefrontTab({ slug, grow, save }: { slug: string; grow: GrowState; save: Save }) {
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
        Sell a program on its own. Buyers get it in your app without messaging you. <Link href={`/${slug}/programs`}>Open your storefront ↗</Link>
      </p>
      {grow.products.length === 0 ? (
        <p className="muted">Nothing for sale yet. Programs you mark for sale in the program builder appear here.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {grow.products.map((p) => (
            <li key={p.id} className="row" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1, display: 'grid', gap: 2 }}>
                <strong>
                  {p.title} {!p.active ? <span className="muted">· not on sale</span> : null}
                </strong>
                <span className="muted" style={{ fontSize: 14 }}>
                  {formatMoney(p.priceCents, p.currency)} · unlocks {p.programName}
                </span>
              </div>
              <label className="field" style={{ width: 120 }}>
                <span className="label">Price</span>
                <input
                  inputMode="decimal"
                  aria-label={`Price for ${p.title}`}
                  value={(p.priceCents / 100).toString()}
                  onChange={(e) =>
                    save((g) => ({ ...g, products: g.products.map((x) => (x.id === p.id ? { ...x, priceCents: Math.max(50, Math.round(Number(e.target.value) * 100) || 50) } : x)) }))
                  }
                />
              </label>
              <button className="btn btn-secondary" onClick={() => save((g) => ({ ...g, products: g.products.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)) }))}>
                {p.active ? 'Take off sale' : 'Put on sale'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- payments and stats ---------- */

function Stat({ label, value, note }: { label: string; value: string | null; note?: string }) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 160 }}>
      <span className="label">{label}</span>
      {value == null ? <span className="muted">Not enough data yet</span> : <strong style={{ fontFamily: 'var(--display)', fontSize: 30 }}>{value}</strong>}
      {note ? <span className="muted" style={{ fontSize: 13 }}>{note}</span> : null}
    </div>
  );
}

function PaymentsTab({ slug, grow, save }: { slug: string; grow: GrowState; save: Save }) {
  // MOCK: the demo business's subscription history. Live: the subscriptions table.
  const subs = slug === 'maya-reyes-strength' ? demoSubscriptions() : [];
  const s = businessStats(subs);
  const currency = grow.plans[0]?.currency ?? 'usd';
  const pct = (n: number | null) => (n == null ? null : `${Math.round(n * 100)}%`);
  return (
    <div style={{ display: 'grid', gap: 28 }}>
      <section className="row" style={{ borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, display: 'grid', gap: 2 }}>
          <strong>Stripe</strong>
          <span className="muted" style={{ fontSize: 14 }}>
            {grow.stripe.connected
              ? grow.stripe.chargesEnabled
                ? 'Connected. Clients pay you directly; Spotter’s fee is taken per payment.'
                : 'Connected, but Stripe still needs details before you can take payments.'
              : 'Not connected. Clients can’t buy plans until you connect Stripe.'}
          </span>
        </div>
        {grow.stripe.connected ? (
          <button className="btn btn-secondary" onClick={() => window.confirm('Disconnect Stripe in this demo?') && save((g) => ({ ...g, stripe: { connected: false, chargesEnabled: false } }))}>
            Disconnect (demo)
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => save((g) => ({ ...g, stripe: { connected: true, chargesEnabled: true } }))}>
            Connect Stripe
          </button>
        )}
      </section>
      {!grow.stripe.connected ? (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          In the live app this opens Stripe’s own sign-up. In this demo it connects a simulated test account.
        </p>
      ) : null}

      <section style={{ display: 'grid', gap: 12 }}>
        <h3 style={{ fontSize: 22 }}>Business</h3>
        {subs.length === 0 ? (
          <p className="muted">No paying clients yet. Numbers appear once clients sign up.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <Stat label="Active clients" value={String(s.activeClients)} />
            <Stat label="Monthly recurring revenue" value={formatMoney(Math.round(s.mrrCents / 100) * 100, currency)} note="Packages spread over their weeks; session packs excluded." />
            <Stat label="Churn this month" value={pct(s.churnThisMonth.rate)} note={`${s.churnThisMonth.count} cancelled`} />
            <Stat label="Average client lifetime" value={s.averageLifetimeDays == null ? null : `${s.averageLifetimeDays} days`} />
            <Stat label="Trial to paid" value={pct(s.trialToPaid.rate)} note={`${s.trialToPaid.converted} of ${s.trialToPaid.ended} finished trials`} />
          </div>
        )}
        {subs.length ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>Demo figures come from the sample subscription history.</p> : null}
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ fontSize: 22 }}>Recent payments</h3>
        {grow.purchases.length === 0 ? (
          <p className="muted">No payments through your page yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {grow.purchases.map((p) => (
              <li key={p.id} className="row">
                <span style={{ flex: 1 }}>
                  {p.item} · <span className="muted">{p.email}</span>
                </span>
                <span style={{ color: p.status === 'failed' ? 'var(--error)' : 'var(--ink)' }}>{p.status === 'failed' ? 'Declined' : formatMoney(p.amountCents, p.currency)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Failed renewals are retried by Stripe automatically. Each failure flags the client in your Clients list once; a successful retry clears it.
        </p>
      </section>
    </div>
  );
}
