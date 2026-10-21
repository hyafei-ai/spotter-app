import { notFound } from 'next/navigation';
import { getPublicPage } from '../../../../src/grow/server';
import { Checkout } from '../../../../src/grow/Checkout';

type Search = Promise<{ plan?: string; product?: string; ref?: string }>;

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const page = await getPublicPage(slug);
  if (!page) notFound();
  return <Checkout initial={page} planId={q.plan} productId={q.product} referral={q.ref?.toUpperCase()} />;
}
