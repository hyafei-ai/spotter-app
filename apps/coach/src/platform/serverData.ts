import type { TriageItem, TriageReason } from '@spotter/core';
import type { DemoClient } from '@spotter/core/demo';
import { getAuth, supabase } from '@spotter/ui/platform';
import { tenant } from '../env';
import { useCoach } from '../store';
import { useTeam, type Coach } from './team';

/**
 * Connected builds: replaces the demo client list, triage and team with the coach's real data.
 * RLS decides what comes back (an assistant only gets assigned clients). Called after sign-in and
 * whenever the triage realtime channel reports a change.
 */
export async function loadCoachData(): Promise<void> {
  if (!supabase || getAuth().status !== 'signedIn') return;
  const [members, triage, current] = await Promise.all([
    supabase.from('memberships').select('profile_id, role, status, assigned_coach_id, revenue_split, created_at, profiles(full_name)').eq('tenant_id', tenant.id),
    supabase.from('triage_items').select('*').eq('tenant_id', tenant.id).is('handled_at', null),
    supabase.from('coach_assignments').select('client_id, coach_id, started_at, ended_at, note').eq('tenant_id', tenant.id),
  ]);
  if (members.error) throw new Error('Couldn’t load your clients. Check your connection.');
  type Row = { profile_id: string; role: string; status: string; assigned_coach_id: string | null; revenue_split: number | null; created_at: string; profiles: { full_name: string } | null };
  const rows = (members.data ?? []) as unknown as Row[];

  const clients: DemoClient[] = rows
    .filter((r) => r.role === 'client')
    .map((r) => ({
      id: r.profile_id,
      name: r.profiles?.full_name || 'New client',
      plan: '—',
      startDate: r.created_at.slice(0, 10),
      status: r.status === 'paused' ? 'paused' : 'active',
      flags: [],
      thisWeek: { planned: 0, done: 0 },
      lastSession: null,
    }));
  type TriageRow = { id: string; client_id: string; reason_code: TriageReason; detail: { count?: number; text?: string; clientName?: string; interventionId?: string }; since: string; snoozed_until: string | null; handled_at: string | null; coach_id?: string | null };
  const triageRows = (triage.data ?? []) as TriageRow[];
  const items: TriageItem[] = triageRows.map((t) => ({
    id: t.id,
    clientId: t.client_id,
    reason: t.reason_code,
    count: t.detail?.count,
    detail: t.detail?.text,
    since: t.since,
    snoozedUntil: t.snoozed_until,
    handledAt: t.handled_at,
    // Check-in requests from the owner (retention): who it's addressed to, and the intervention to close.
    coachId: t.coach_id ?? null,
    interventionId: t.detail?.interventionId,
  }));
  // A coach asked to check in on someone they don't coach still needs the member in their list.
  for (const t of triageRows) {
    if (t.reason_code === 'check_in_request' && !clients.some((c) => c.id === t.client_id)) {
      clients.push({ id: t.client_id, name: t.detail?.clientName || 'Member', plan: '—', startDate: t.since.slice(0, 10), status: 'active', flags: [], thisWeek: { planned: 0, done: 0 }, lastSession: null });
    }
  }
  useCoach.setState({ clients, triage: items });

  const coaches: Coach[] = rows
    .filter((r) => r.role === 'owner' || r.role === 'assistant')
    .map((r) => ({ id: r.profile_id, name: r.profiles?.full_name || 'Coach', email: '', role: r.role as Coach['role'], split: r.revenue_split ?? (r.role === 'owner' ? 1 : 0), status: 'active' }));
  const coachOf = Object.fromEntries(rows.filter((r) => r.role === 'client' && r.assigned_coach_id).map((r) => [r.profile_id, r.assigned_coach_id!]));
  const history: Record<string, { coachId: string; from: string; to: string | null; note: string | null }[]> = {};
  for (const a of (current.data ?? []) as { client_id: string; coach_id: string; started_at: string; ended_at: string | null; note: string | null }[]) {
    (history[a.client_id] ??= []).push({ coachId: a.coach_id, from: a.started_at, to: a.ended_at, note: a.note });
  }
  useTeam.setState({ coaches, coachOf, history, viewerId: getAuth().userId ?? useTeam.getState().viewerId });
}

/** Persists triage actions (handled/snoozed) for connected builds. */
export async function saveTriage(ids: string[], patch: { handled_at?: string | null; snoozed_until?: string | null; handled_by?: string | null }): Promise<void> {
  if (!supabase || getAuth().status !== 'signedIn' || ids.length === 0) return;
  await supabase.from('triage_items').update(patch).in('id', ids);
}
