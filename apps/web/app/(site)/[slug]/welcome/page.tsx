import Link from 'next/link';
import { notFound } from 'next/navigation';
import { onColor } from '@spotter/core';
import { getPublicPage } from '../../../../src/grow/server';

type Search = Promise<{ plan?: string; product?: string }>;

/** After checkout: what happens next, in the trainer's colours. */
export default async function WelcomePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const page = await getPublicPage(slug);
  if (!page) notFound();
  const first = page.tenant.coachName.split(' ')[0];
  const program = !!q.product;
  return (
    <main
      className="wrap"
      style={{ padding: '56px var(--margin)', display: 'grid', gap: 16, maxWidth: 560, ['--brand' as string]: page.tenant.brandColor, ['--brand-ink' as string]: onColor(page.tenant.brandColor) }}
    >
      <span className="label">Payment received</span>
      <h1>You’re in.</h1>
      {program ? (
        <p style={{ margin: 0 }}>
          Your program is ready in the {page.tenant.appName} app. Check your email for the link to download it and sign in.
        </p>
      ) : (
        <p style={{ margin: 0 }}>
          Check your email for an invite to the {page.tenant.appName} app. You’ll fill in a short intake and sign the waiver, then {first} sets up your first
          session.
        </p>
      )}
      <p className="muted" style={{ margin: 0 }}>
        A receipt from Stripe is on its way too.
      </p>
      <div>
        <Link className="btn btn-secondary" href={`/${slug}`}>
          Back to {page.tenant.appName}
        </Link>
      </div>
    </main>
  );
}
