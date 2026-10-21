// Server-side only (uses server env); imported from server components.
import { DEMO_TENANTS, type LandingBlock, type Plan } from '@spotter/core';
import { defaultGrow } from './state';

export interface PublicProduct {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  currency: Plan['currency'];
}

export interface PublicPage {
  tenant: { slug: string; appName: string; brandColor: string; coachName: string; chargesEnabled: boolean };
  blocks: LandingBlock[];
  plans: Plan[];
  products: PublicProduct[];
  /** True when served from demo data (no Supabase configured). */
  demo: boolean;
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isLive = !!(SUPABASE_URL && ANON);

/**
 * A trainer's published page by slug or custom domain. Live: the public_landing_page RPC (anon, published
 * rows only). Demo: the fictional demo tenants, with the dashboard's local edits applied in the browser.
 */
export async function getPublicPage(slugOrDomain: string): Promise<PublicPage | null> {
  if (isLive) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_landing_page`, {
      method: 'POST',
      headers: { apikey: ANON!, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' },
      body: JSON.stringify({ slug: slugOrDomain }),
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Page lookup failed (${res.status})`);
    const data = (await res.json()) as {
      tenant: { slug: string; appName: string; brandColor: string; coach: { name?: string }; chargesEnabled: boolean };
      blocks: LandingBlock[];
      plans: Plan[];
      products: PublicProduct[];
    } | null;
    if (!data) return null;
    return {
      tenant: { ...data.tenant, coachName: data.tenant.coach?.name ?? data.tenant.appName },
      blocks: data.blocks,
      plans: data.plans,
      products: data.products,
      demo: false,
    };
  }

  // MOCK: demo tenants only.
  const t = DEMO_TENANTS[slugOrDomain];
  if (!t) return null;
  const g = defaultGrow(slugOrDomain);
  return {
    tenant: { slug: t.slug, appName: t.appName, brandColor: t.brandColor, coachName: t.coach.name, chargesEnabled: g.stripe.chargesEnabled },
    blocks: g.page.published ? g.page.blocks : [],
    plans: g.plans.filter((p) => p.active),
    products: g.products.filter((p) => p.active),
    demo: true,
  };
}
