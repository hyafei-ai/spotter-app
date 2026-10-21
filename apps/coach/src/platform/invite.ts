import { Platform } from 'react-native';
import { buildInviteUrl, uuidv7 } from '@spotter/core';
import { callFunction, isConfigured } from '@spotter/ui/platform';
import { CLIENT_URL, tenant } from '../env';

/**
 * Invite links (C-1). Connected: POST /invites creates the invite, emails it and returns the link
 * (shown once). Demo: MOCK link built on the device with a throwaway token; nothing is emailed.
 */
export async function createInvite(i: { email: string; name?: string; role: 'client' | 'assistant' }): Promise<{ url: string; emailed: boolean }> {
  if (isConfigured()) {
    const r = await callFunction<{ url: string; emailed: boolean }>('invites', {
      body: { tenantId: tenant.id, email: i.email, fullName: i.name, role: i.role },
    });
    return { url: r.url, emailed: r.emailed };
  }
  const token = uuidv7().replace(/-/g, '').slice(-20);
  // On the web preview the link opens the demo client app on the same site, so it can be tried end to end.
  const base =
    Platform.OS === 'web' && typeof window !== 'undefined' && CLIENT_URL.startsWith('/')
      ? `${window.location.origin}${CLIENT_URL === '/' ? '' : CLIENT_URL}`
      : `https://${tenant.slug}.spotter.app`;
  return { url: buildInviteUrl(base, { token, tenant: tenant.slug, email: i.email, role: i.role }), emailed: false };
}
