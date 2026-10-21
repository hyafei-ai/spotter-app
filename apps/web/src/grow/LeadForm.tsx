'use client';

import { useState, type FormEvent } from 'react';
import { LeadInput } from '@spotter/core';
import { useGrow } from './useGrow';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

/** Lead capture on the trainer's page. Goes to the submit_lead RPC (rate limited, published pages only). */
export function LeadForm({ slug, disabled, demo }: { slug: string; disabled?: boolean; demo: boolean }) {
  const [, saveGrow] = useGrow(slug);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (disabled) return;
    const f = new FormData(e.currentTarget);
    const ref = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') : null;
    const parsed = LeadInput.safeParse({
      tenantSlug: slug,
      name: String(f.get('name') ?? ''),
      email: String(f.get('email') ?? ''),
      message: String(f.get('message') ?? ''),
      source: ref ? 'referral' : 'landing_page',
      referralCode: ref,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0]);
        next[k] = k === 'email' ? 'Enter an email address like name@example.com.' : k === 'name' ? 'Add your name.' : 'Check this field.';
      }
      setErrors(next);
      return;
    }
    setErrors({});
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus({ kind: 'error', message: 'You’re offline. Your message wasn’t sent. Try again when you’re connected.' });
      return;
    }
    setStatus({ kind: 'sending' });
    try {
      if (demo || !SUPABASE_URL || !ANON) {
        // MOCK: the demo keeps leads in this browser; the coach dashboard reads them from the same place.
        await new Promise((r) => setTimeout(r, 400));
        saveGrow((g) => ({
          ...g,
          leads: [{ ...parsed.data, id: `lead-${Date.now()}`, status: 'new', createdAt: new Date().toISOString() }, ...g.leads],
        }));
      } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_lead`, {
          method: 'POST',
          headers: { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            slug,
            name: parsed.data.name,
            email: parsed.data.email,
            message: parsed.data.message,
            source: parsed.data.source,
            referral_code: parsed.data.referralCode,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message || 'Your message didn’t go through. Try again in a minute.');
        }
      }
      setStatus({ kind: 'sent' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Your message didn’t go through. Try again in a minute.' });
    }
  };

  if (status.kind === 'sent') {
    return (
      <p role="status" style={{ borderLeft: '3px solid var(--brand)', paddingLeft: 12 }}>
        Thanks, your message is in. Expect a reply by email.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 14 }} aria-label="Contact form">
      <div className="field">
        <label className="label" htmlFor="lead-name">
          Your name
        </label>
        <input id="lead-name" name="name" autoComplete="name" required aria-invalid={!!errors.name} aria-describedby={errors.name ? 'lead-name-err' : undefined} />
        {errors.name ? <span id="lead-name-err" style={{ color: 'var(--error)', fontSize: 13 }}>{errors.name}</span> : null}
      </div>
      <div className="field">
        <label className="label" htmlFor="lead-email">
          Email
        </label>
        <input id="lead-email" name="email" type="email" autoComplete="email" required aria-invalid={!!errors.email} aria-describedby={errors.email ? 'lead-email-err' : undefined} />
        {errors.email ? <span id="lead-email-err" style={{ color: 'var(--error)', fontSize: 13 }}>{errors.email}</span> : null}
      </div>
      <label className="field">
        <span className="label">Message (optional)</span>
        <textarea name="message" rows={4} placeholder="Your goals, schedule, anything you’d like to ask" />
      </label>
      {status.kind === 'error' ? (
        <p role="alert" style={{ color: 'var(--error)', margin: 0 }}>
          {status.message}
        </p>
      ) : null}
      <div>
        <button className="btn btn-primary" type="submit" disabled={disabled || status.kind === 'sending'}>
          {status.kind === 'sending' ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  );
}
