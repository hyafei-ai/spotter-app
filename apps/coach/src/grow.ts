import { create } from 'zustand';
import { defaultGrow, growKey, type GrowState } from '@spotter/core/demo';
import { tenant } from './env';

/*
 * Grow data for the signed-in coach. Real builds read plans, leads, referral_programs and subscriptions
 * under RLS (owner-only). MOCK: the demo keeps the same shape the web dashboard uses, in localStorage on the
 * web preview and in memory on native.
 */
const ls = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

function read(): GrowState {
  try {
    const raw = ls()?.getItem(growKey(tenant.slug));
    if (raw) return { ...defaultGrow(tenant.slug), ...(JSON.parse(raw) as Partial<GrowState>) };
  } catch {
    // fall through to the starting data
  }
  return defaultGrow(tenant.slug);
}

interface GrowStore {
  grow: GrowState;
  update(fn: (g: GrowState) => GrowState): void;
  reload(): void;
}

export const useGrowStore = create<GrowStore>((set, get) => ({
  grow: read(),
  update(fn) {
    const next = fn(get().grow);
    try {
      ls()?.setItem(growKey(tenant.slug), JSON.stringify(next));
    } catch {
      // storage unavailable: keep the change for this session
    }
    set({ grow: next });
  },
  reload: () => set({ grow: read() }),
}));

/** Where the trainer's public page lives. Custom domain wins when set. */
export function pageUrl(g: GrowState): string {
  return g.page.customDomain ? `https://${g.page.customDomain}` : `https://${tenant.slug}.spotter.app`;
}

/** The coach web dashboard (landing page builder). EXPO_PUBLIC_WEB_URL in builds. */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? null;
