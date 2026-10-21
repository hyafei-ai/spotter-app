import { notFound } from 'next/navigation';
import { getPublicPage } from '../../../../src/grow/server';
import { Storefront } from '../../../../src/grow/Storefront';

/** Program storefront (K-6): one-off programs for buyers who don't want coaching. */
export default async function ProgramsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublicPage(slug);
  if (!page) notFound();
  return <Storefront initial={page} />;
}
