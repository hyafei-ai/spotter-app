import { DEFAULT_TENANT, DEMO_TENANTS } from '@spotter/core';
import { GrowDashboard } from '../../../src/grow/dashboard/GrowDashboard';
import { TABS, type Tab } from '../../../src/grow/dashboard/tabs';

type Search = Promise<{ tenant?: string; tab?: string }>;

/** Grow (K-6, K-7): landing page, plans and codes, leads, referrals, storefront, payments and stats. */
export default async function GrowPage({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  // MOCK: the demo dashboard picks a demo business by query; signed-in dashboards use the owner's tenant.
  const slug = q.tenant && q.tenant in DEMO_TENANTS ? q.tenant : DEFAULT_TENANT;
  const tab = (TABS as readonly string[]).includes(q.tab ?? '') ? (q.tab as Tab) : 'page';
  return <GrowDashboard slug={slug} tab={tab} />;
}
