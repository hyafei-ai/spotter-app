import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicPage } from '../../../src/grow/server';
import { LandingView } from '../../../src/grow/LandingView';

/** Trainer landing page (K-6) at /<slug>, <slug>.spotter.app or the trainer's own domain (see proxy.ts). */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicPage(slug);
  if (!page) return { title: 'Not found' };
  const hero = page.blocks.find((b) => b.type === 'hero');
  return {
    title: page.tenant.appName,
    description: hero && hero.type === 'hero' ? hero.subheading || hero.heading : `Coaching with ${page.tenant.coachName}`,
  };
}

export default async function TrainerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublicPage(slug);
  if (!page) notFound();
  return <LandingView initial={page} />;
}
