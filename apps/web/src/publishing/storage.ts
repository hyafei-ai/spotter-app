'use client';

import { useEffect, useState } from 'react';
import { BrandDraft, DEMO_TENANTS, brandFromTenant, type PublishState, type Store, type StoreStatus } from '@spotter/core';

/*
 * MOCK: the dashboard has no sign-in yet, so it edits the demo tenant and keeps state in this browser
 * (same keys and shapes as the coach app). Real builds save the brand to the tenants row, upload keys
 * through the store-credentials Edge Function and read status from the publish_status view.
 */
export const TENANT = DEMO_TENANTS['maya-reyes-strength']!;
export const BRAND_KEY = `spotter.brand.${TENANT.slug}`;
export const PUBLISH_KEY = `spotter.publish.${TENANT.slug}`;
export const ASSETS_KEY = `spotter.assets.${TENANT.slug}`;

export interface Credential {
  fingerprint: string;
  label: string;
}

export interface PublishData extends PublishState {
  credentialInfo: { ios: Credential | null; android: Credential | null };
  description: string | null;
  rejection: Partial<Record<Store, { code: string; message: string }>>;
}

export const INITIAL_PUBLISH: PublishData = {
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

export interface Assets {
  /** Data URLs, kept small enough for local storage in the demo. Real builds upload to Supabase Storage. */
  icon: string | null;
  logo: string | null;
}

function read<T>(key: string, fallback: T, parse?: (v: unknown) => T | null): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as unknown;
    return parse ? (parse(v) ?? fallback) : ({ ...fallback, ...(v as object) } as T);
  } catch {
    return fallback;
  }
}

/** State persisted to localStorage; `loaded` is false until the browser copy has been read. */
export function usePersisted<T>(key: string, fallback: T, parse?: (v: unknown) => T | null) {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // Read once on mount; the server render can't see localStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(read(key, fallback, parse));
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const save = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      return true;
    } catch {
      return false; // storage full (e.g. a large image) or blocked
    }
  };
  return { value, save, loaded };
}

export const useSavedBrand = () => usePersisted<BrandDraft>(BRAND_KEY, brandFromTenant(TENANT), (v) => BrandDraft.safeParse(v).data ?? null);
export const usePublish = () => usePersisted<PublishData>(PUBLISH_KEY, INITIAL_PUBLISH);
export const useAssets = () => usePersisted<Assets>(ASSETS_KEY, { icon: null, logo: null });

export function withStatus(p: PublishData, store: Store, status: StoreStatus, rejection?: { code: string; message: string }): PublishData {
  const r = { ...p.rejection };
  if (status === 'rejected' && rejection) r[store] = rejection;
  else delete r[store];
  return { ...p, status: { ...p.status, [store]: status }, rejection: r };
}
