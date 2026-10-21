import { create } from 'zustand';
import {
  BrandDraft,
  applyBrand,
  brandFromTenant,
  brandProblems,
  type PublishState,
  type Store,
  type StoreStatus,
  type TenantConfig,
} from '@spotter/core';
import { tenant as baseTenant } from './env';

/*
 * The coach's brand and publishing state.
 * Real builds read/write the tenants row (owner-only), store_credentials (fingerprints only),
 * listing_kits and publish_status through Supabase. MOCK: the demo keeps both in localStorage on the
 * web preview; the client app on the same origin reads the saved brand (spotter.brand.<slug>), so a
 * saved change shows up there. On native the state lives in memory for the session.
 */
const BRAND_KEY = `spotter.brand.${baseTenant.slug}`;
const PUBLISH_KEY = `spotter.publish.${baseTenant.slug}`;
const ls = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

function readJSON<T>(key: string, parse: (v: unknown) => T | null): T | null {
  try {
    const raw = ls()?.getItem(key);
    return raw ? parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export interface Credential {
  fingerprint: string;
  label: string;
}

export interface PublishData extends PublishState {
  credentialInfo: { ios: Credential | null; android: Credential | null };
  description: string | null;
  rejection: Partial<Record<Store, { code: string; message: string }>>;
}

const initialPublish: PublishData = {
  brandSaved: false,
  iconUploaded: false,
  logoUploaded: false,
  appleAccount: false,
  googleAccount: false,
  credentials: { ios: false, android: false },
  credentialInfo: { ios: null, android: null },
  listingConfirmed: false,
  description: null,
  status: { ios: 'draft', android: 'draft' },
  rejection: {},
};

interface BrandState {
  saved: BrandDraft;
  draft: BrandDraft;
  dirty: boolean;
  publish: PublishData;
  edit(patch: Partial<BrandDraft>): void;
  save(): boolean;
  discard(): void;
  updatePublish(patch: Partial<PublishData>): void;
  setStatus(store: Store, status: StoreStatus, rejection?: { code: string; message: string }): void;
  revoke(): void;
}

const savedBrand = readJSON(BRAND_KEY, (v) => BrandDraft.safeParse(v).data ?? null) ?? brandFromTenant(baseTenant);

export const useBrand = create<BrandState>((set, get) => ({
  saved: savedBrand,
  draft: savedBrand,
  dirty: false,
  publish: { ...initialPublish, ...(readJSON(PUBLISH_KEY, (v) => v as PublishData) ?? {}) },
  edit: (patch) => set({ draft: { ...get().draft, ...patch }, dirty: true }),
  save() {
    const { draft } = get();
    if (brandProblems(draft).length) return false;
    ls()?.setItem(BRAND_KEY, JSON.stringify(draft));
    set({ saved: draft, dirty: false });
    get().updatePublish({ brandSaved: true });
    return true;
  },
  discard: () => set({ draft: get().saved, dirty: false }),
  updatePublish(patch) {
    const publish = { ...get().publish, ...patch };
    ls()?.setItem(PUBLISH_KEY, JSON.stringify(publish));
    set({ publish });
  },
  setStatus(store, status, rejection) {
    const p = get().publish;
    const r = { ...p.rejection };
    if (status === 'rejected' && rejection) r[store] = rejection;
    else delete r[store];
    get().updatePublish({ status: { ...p.status, [store]: status }, rejection: r });
  },
  revoke() {
    const p = get().publish;
    // Mirrors revoke_spotter_access(): keys deleted, queued builds cancelled. Store listings stay the trainer's.
    get().updatePublish({ credentials: { ios: false, android: false }, credentialInfo: { ios: null, android: null }, status: { ios: p.status.ios === 'building' ? 'draft' : p.status.ios, android: p.status.android === 'building' ? 'draft' : p.status.android } });
  },
}));

/** The tenant with the saved brand applied, for previews. */
export function brandedTenant(b: BrandDraft): TenantConfig {
  return applyBrand(baseTenant, b);
}
