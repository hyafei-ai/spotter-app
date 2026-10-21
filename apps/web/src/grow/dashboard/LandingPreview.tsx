'use client';

import { DEMO_TENANTS } from '@spotter/core';
import { LandingView } from '../LandingView';
import type { GrowState } from '../state';

/** Live preview of the page being edited, using the same renderer as the public page. */
export function LandingPreview({ slug, grow }: { slug: string; grow: GrowState }) {
  const t = DEMO_TENANTS[slug]!;
  return (
    <div
      style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sheet)', overflow: 'auto', maxHeight: '80vh', background: 'var(--paper)', marginTop: 6 }}
      aria-label="Preview of your page"
    >
      <LandingView
        preview
        initial={{
          tenant: { slug, appName: t.appName, brandColor: t.brandColor, coachName: t.coach.name, chargesEnabled: grow.stripe.chargesEnabled },
          blocks: grow.page.blocks,
          plans: grow.plans,
          products: [],
          demo: true,
        }}
      />
    </div>
  );
}
