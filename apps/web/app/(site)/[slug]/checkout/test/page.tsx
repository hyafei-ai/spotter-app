import { notFound } from 'next/navigation';
import { getPublicPage } from '../../../../../src/grow/server';
import { TestCheckout } from '../../../../../src/grow/TestCheckout';

type Search = Promise<{ kind?: string; id?: string; email?: string; total?: string; coupon?: string; ref?: string }>;

/** MOCK: simulated checkout, demo builds only. */
export default async function TestCheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const page = await getPublicPage(slug);
  if (!page || !page.demo || !q.id || !q.email || (q.kind !== 'plan' && q.kind !== 'product')) notFound();
  const total = Number(q.total ?? '0');
  return <TestCheckout initial={page} kind={q.kind} id={q.id} email={q.email} total={Number.isFinite(total) ? total : 0} coupon={q.coupon} referral={q.ref} />;
}
