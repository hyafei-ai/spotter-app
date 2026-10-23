import { useEffect } from 'react';
import { create } from 'zustand';
import {
  activityFromRow,
  checkInRequestText,
  keptSummary,
  memberStatus,
  monthlyRevenueCents,
  type Intervention,
  type InterventionAction,
  type KeptSummary,
  type MemberActivity,
  type MemberRiskInputRow,
  type MemberStatus,
  type TriageItem,
} from '@spotter/core';
import { demoInterventions, demoMemberActivity, demoRetentionSubscriptions } from '@spotter/core/demo';
import { isConfigured, supabase } from '@spotter/ui/platform';
import { tenant } from '../env';
import { useCoach } from '../store';
import { DEMO_TEAM_IDS, readDemoTeam, useTeam } from '../platform/team';
import { loadCoachData } from '../platform/serverData';

/*
 * Check-ins and who stayed after one (docs/features/retention.md). The coach logs a check-in from
 * client detail ("I checked in": message, call, session, other); the business view (Me → Your
 * business → Keeping clients, owner role only) shows who stayed 60 days later. In a team, the head
 * coach can also ask an assistant to check in on one of the assistant's clients (handToCoach).
 * MOCK DATA in the demo: client activity and earlier check-ins from @spotter/core/demo, run through the
 * same functions as live data. Check-ins made in the demo are kept in localStorage
 * (spotter.retention.<slug>). Connected builds call members_at_risk and kept_summary (owner role),
 * log_check_in, hand_to_coach and complete_check_in.
 */

const KEY = `spotter.retention.${tenant.slug}`;
const isDemo = () => !isConfigured() || !supabase;
const today = () => new Date().toISOString().slice(0, 10);

function readSaved(): Intervention[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Intervention[]) : null;
  } catch {
    return null;
  }
}
function save(list: Intervention[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable: the demo keeps check-ins for this session only
  }
}

/** Teams: open requests become the assistant's triage items: "{Head coach} asked you to check in: {reason}". */
function requestItem(i: Intervention, ownerFirst: string): TriageItem {
  return {
    id: `req-${i.id}`,
    clientId: i.clientId,
    reason: 'check_in_request',
    detail: checkInRequestText(ownerFirst, i.reason),
    since: `${i.requestedOn}T09:00:00Z`,
    snoozedUntil: null,
    handledAt: null,
    coachId: i.coachId,
    interventionId: i.id,
  };
}

function syncDemoTriage(list: Intervention[]) {
  const owner = useTeam.getState().coaches.find((c) => c.role === 'owner');
  const ownerFirst = (owner?.name ?? tenant.coach.name).split(' ')[0]!;
  const open = list.filter((i) => !i.doneOn).map((i) => requestItem(i, ownerFirst));
  const others = useCoach.getState().triage.filter((t) => t.reason !== 'check_in_request');
  const handled = useCoach.getState().triage.filter((t) => t.reason === 'check_in_request' && t.handledAt);
  const openIds = new Set(open.map((o) => o.id));
  useCoach.setState({ triage: [...others, ...handled.filter((h) => !openIds.has(h.id)), ...open] });
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface RetentionState {
  status: Status;
  error: string | null;
  activity: MemberActivity[];
  interventions: Intervention[];
  memberStatus: MemberStatus;
  currency: string;
  /** When the list was last loaded (shown when offline). */
  loadedAt: string | null;
  load(): Promise<void>;
  /** Teams only: the head coach asks another coach to check in. */
  handToCoach(client: { clientId: string; name: string; monthlyCents: number }, coachId: string, reason: string, note: string | null): Promise<void>;
  completeCheckIn(interventionId: string, action: InterventionAction, note: string | null): Promise<void>;
  /**
   * "I checked in" from client detail: records a done check-in by the viewer, closing any open request
   * for that client first. Feeds "kept after a check-in" on the business view.
   */
  logCheckIn(
    client: { clientId: string; name: string; monthlyCents: number },
    by: { id: string; name: string },
    reason: string,
    action: InterventionAction,
    note: string | null,
  ): Promise<void>;
}

export const useRetention = create<RetentionState>((set, get) => ({
  status: 'idle',
  error: null,
  activity: [],
  interventions: [],
  memberStatus: {},
  currency: 'usd',
  loadedAt: null,

  async load() {
    set({ status: get().loadedAt ? 'ready' : 'loading', error: null });
    if (isDemo()) {
      const now = Date.now();
      // A solo demo business has no assistant: the sample check-ins are all the coach's own.
      const solo = !readDemoTeam();
      const interventions =
        readSaved() ??
        demoInterventions(now).map((i) => (solo ? { ...i, coachId: DEMO_TEAM_IDS.OWNER_ID, coachName: tenant.coach.name } : i));
      set({
        status: 'ready',
        activity: demoMemberActivity(now, useTeam.getState().coachOf),
        interventions,
        memberStatus: memberStatus(demoRetentionSubscriptions(now)),
        loadedAt: new Date().toISOString(),
      });
      syncDemoTriage(interventions);
      return;
    }
    try {
      const year = new Date().getFullYear();
      const [inputs, kept] = await Promise.all([
        supabase!.rpc('members_at_risk', { t: tenant.id }),
        supabase!.rpc('kept_summary', { t: tenant.id, yr: year }),
      ]);
      if (inputs.error || kept.error) throw new Error('Couldn’t load your clients. Check your connection and try again.');
      type KeptRow = {
        intervention_id: string; client_id: string; client_name: string; coach_id: string; coach_name: string; reason: string; note: string | null;
        requested_at: string; done_at: string | null; action: InterventionAction | null; action_note: string | null; still_active: boolean; left_on: string | null;
        plan_kind: MemberRiskInputRow['plan_kind']; price_cents: number | null; discount_cents: number | null; duration_weeks: number | null; currency: string | null;
      };
      const rows = (kept.data ?? []) as KeptRow[];
      const statusMap: MemberStatus = {};
      const interventions: Intervention[] = rows.map((r) => {
        statusMap[r.client_id] = { active: r.still_active, leftOn: r.left_on };
        return {
          id: r.intervention_id,
          clientId: r.client_id,
          clientName: r.client_name,
          coachId: r.coach_id,
          coachName: r.coach_name,
          reason: r.reason,
          note: r.note,
          requestedOn: r.requested_at.slice(0, 10),
          doneOn: r.done_at?.slice(0, 10) ?? null,
          action: r.action,
          actionNote: r.action_note,
          monthlyCents:
            r.plan_kind && r.price_cents != null
              ? monthlyRevenueCents({ clientId: r.client_id, planKind: r.plan_kind, priceCents: r.price_cents, discountCents: r.discount_cents ?? 0, status: 'active', startedAt: r.requested_at, trialEndsAt: null, canceledAt: null, durationWeeks: r.duration_weeks })
              : 0,
        };
      });
      const inputRows = (inputs.data ?? []) as (MemberRiskInputRow & { currency: string | null })[];
      set({
        status: 'ready',
        activity: inputRows.map(activityFromRow),
        interventions,
        memberStatus: statusMap,
        currency: inputRows.find((r) => r.currency)?.currency ?? rows.find((r) => r.currency)?.currency ?? 'usd',
        loadedAt: new Date().toISOString(),
      });
    } catch (e) {
      set({ status: get().loadedAt ? 'ready' : 'error', error: e instanceof Error ? e.message : 'Couldn’t load your clients.' });
    }
  },

  async handToCoach(client, coachId, reason, note) {
    if (!isDemo()) {
      const { error } = await supabase!.rpc('hand_to_coach', { t: tenant.id, client: client.clientId, coach: coachId, reason, note });
      if (error) throw new Error(error.message);
      await Promise.all([get().load(), loadCoachData().catch(() => {})]);
      return;
    }
    const coach = useTeam.getState().coaches.find((c) => c.id === coachId);
    const existing = get().interventions.find((i) => i.clientId === client.clientId && !i.doneOn);
    const row: Intervention = {
      id: existing?.id ?? `demo-${Date.now().toString(36)}`,
      clientId: client.clientId,
      clientName: client.name,
      coachId,
      coachName: coach?.name ?? 'Coach',
      reason,
      note,
      requestedOn: today(),
      doneOn: null,
      action: null,
      actionNote: null,
      monthlyCents: client.monthlyCents,
    };
    const list = [...get().interventions.filter((i) => i.id !== row.id), row];
    set({ interventions: list });
    save(list);
    syncDemoTriage(list);
  },

  async completeCheckIn(interventionId, action, note) {
    if (!isDemo()) {
      const { error } = await supabase!.rpc('complete_check_in', { intervention: interventionId, how: action, how_note: note });
      if (error) throw new Error(error.message);
      void get().load();
      return;
    }
    const list = get().interventions.map((i) => (i.id === interventionId ? { ...i, doneOn: today(), action, actionNote: note } : i));
    set({ interventions: list });
    save(list);
  },

  async logCheckIn(client, by, reason, action, note) {
    if (!isDemo()) {
      const { error } = await supabase!.rpc('log_check_in', { t: tenant.id, client: client.clientId, reason, how: action, how_note: note });
      if (error) throw new Error(error.message);
      // kept_summary is owner-role only; an assistant's check-in still counts on the business view.
      await Promise.all([get().status !== 'idle' ? get().load() : Promise.resolve(), loadCoachData().catch(() => {})]);
      return;
    }
    const open = get().interventions.find((i) => i.clientId === client.clientId && !i.doneOn);
    const row: Intervention = open
      ? { ...open, doneOn: today(), action, actionNote: note }
      : {
          id: `demo-${Date.now().toString(36)}`,
          clientId: client.clientId,
          clientName: client.name,
          coachId: by.id,
          coachName: by.name,
          reason,
          note: null,
          requestedOn: today(),
          doneOn: today(),
          action,
          actionNote: note,
          monthlyCents: client.monthlyCents,
        };
    const list = [...get().interventions.filter((i) => i.id !== row.id), row];
    set({ interventions: list });
    save(list);
    syncDemoTriage(list);
  },
}));

/** Derived views for the business view and client detail. */
export function useRetentionViews(): { kept: KeptSummary; openByClient: Map<string, Intervention> } {
  const { interventions, memberStatus: status } = useRetention();
  const t = today();
  return {
    kept: keptSummary(interventions, status, Number(t.slice(0, 4)), t),
    openByClient: new Map(interventions.filter((i) => !i.doneOn).map((i) => [i.clientId, i])),
  };
}

/**
 * Teams: check-in requests are addressed to one coach, who sees it (even for a client they don't
 * coach). Everyone else, the head coach included, sees it as "Asked Leo" on client detail instead.
 */
export function triageForViewer(items: TriageItem[], viewerId: string): TriageItem[] {
  return items.filter((t) => t.reason !== 'check_in_request' || !t.coachId || t.coachId === viewerId);
}
export function requestedClientIds(items: TriageItem[], viewerId: string): string[] {
  return items.filter((t) => t.reason === 'check_in_request' && t.coachId === viewerId && !t.handledAt).map((t) => t.clientId);
}

/** Demo only: put the head coach's open check-in requests into the assistant's Clients list. Live builds get them from triage_items. */
export function useDemoCheckInRequests() {
  useEffect(() => {
    if (isDemo() && useRetention.getState().status === 'idle') void useRetention.getState().load();
  }, []);
}
