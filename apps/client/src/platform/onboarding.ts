import { CONSENT_VERSION, uuidv7, type InviteParams } from '@spotter/core';
import { supabase } from '@spotter/ui/platform';
import { kv } from '../storage';
import { syncQueue } from '../sync';

/*
 * Invite and consent state for sign-up (C-1, GDPR). The invite from the link is kept on the device
 * until the person has signed in, then accepted on the server (public.accept_invite).
 */

const INVITE_KEY = 'spotter.invite';
const CONSENT_KEY = 'spotter.consent';

export async function saveInvite(invite: InviteParams): Promise<void> {
  await kv.setItem(INVITE_KEY, JSON.stringify(invite));
}

export async function loadInvite(): Promise<InviteParams | null> {
  const raw = await kv.getItem(INVITE_KEY);
  return raw ? (JSON.parse(raw) as InviteParams) : null;
}

/** After sign-in: joins the coach's business from the saved invite. Throws a person-readable message. */
export async function acceptPendingInvite(): Promise<'joined' | 'none'> {
  const invite = await loadInvite();
  if (!invite || !supabase) return 'none';
  const { error } = await supabase.rpc('accept_invite', { token: invite.token });
  if (error) throw new Error(error.message);
  await kv.removeItem(INVITE_KEY);
  return 'joined';
}

/** Records consent locally right away and queues it for the server (it syncs once signed in). */
export async function recordConsent(): Promise<void> {
  const recordedAt = new Date().toISOString();
  await kv.setItem(CONSENT_KEY, JSON.stringify({ version: CONSENT_VERSION, recordedAt }));
  await syncQueue.enqueue('consent.record', { consentId: uuidv7(), kind: 'terms_privacy', granted: true, version: CONSENT_VERSION, recordedAt });
}

export async function hasConsent(): Promise<boolean> {
  const raw = await kv.getItem(CONSENT_KEY);
  return !!raw && (JSON.parse(raw) as { version: string }).version === CONSENT_VERSION;
}
