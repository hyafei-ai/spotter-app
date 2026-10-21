import { notFound } from 'next/navigation';
import { DEMO_TENANTS } from '@spotter/core';

/** Trainer landing page (K-6). Placeholder until the Grow build fills in blocks from landing_pages. */
export default async function TrainerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = DEMO_TENANTS[slug];
  if (!t) notFound();
  return (
    <main className="wrap" style={{ paddingTop: 48, ['--brand' as string]: t.brandColor }}>
      <span className="label">Coaching with {t.coach.name}</span>
      <h1>{t.appName}</h1>
    </main>
  );
}
