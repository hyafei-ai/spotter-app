import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import {
  BODY_REGIONS,
  CYCLE_PHASES,
  type BodyRegion,
  type CyclePhase,
  type FuelLevel,
  type MemberActivity,
  type PhysiologyInput,
  type SubscriptionLike,
} from '@spotter/core';
import { demoMemberActivity, demoPhysiology, type SharedReadEntry } from '@spotter/core/demo';
import { onSharedChange, readShared } from '@spotter/ui';
import { isConfigured, supabase } from '@spotter/ui/platform';
import { tenant } from '../env';
import { getSharedReads, useReadsDoc } from '../reads';
import { useTeam } from '../platform/team';

/*
 * What each athlete shared between sessions, gathered for the coach's "Needs attention" list and the
 * "Between sessions" section (docs/features/at-risk.md). Coach side only: the owner never reads this.
 *
 * MOCK transport in the demo: the client app writes what the athlete shared to readShared keys.
 * - `spotter.reads.<tenant>`: shared daily reads (exists; reads.ts). Easier-day reads → running tired.
 * - `spotter.fuel.<tenant>`, `spotter.pain.<tenant>`, `spotter.cycle.<tenant>`, `spotter.progress.<tenant>`:
 *   written by the fuel, injury, cycle and progress builds. They may not exist yet, and their exact
 *   shapes aren't settled, so every adapter below reads defensively and falls back to the MOCK
 *   physiology in @spotter/core/demo (demoPhysiology) for the sample clients.
 * Connected builds: TODO-INTEGRATE each adapter with the RPC that returns only shared rows
 * (like shared_reads_for_coach), keyed by the coach-side client id.
 */

export const fuelKey = (slug: string) => `spotter.fuel.${slug}`; // TODO-INTEGRATE: confirm with the fuel build
export const painKey = (slug: string) => `spotter.pain.${slug}`; // TODO-INTEGRATE: confirm with the injury build
export const cycleKey = (slug: string) => `spotter.cycle.${slug}`; // TODO-INTEGRATE: confirm with the cycle build
export const progressKey = (slug: string) => `spotter.progress.${slug}`; // TODO-INTEGRATE: confirm with the progress build

const isDemo = () => !isConfigured() || !supabase;
const DAY = 86_400_000;
export const localToday = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);

/* ---------- defensive adapters ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * TODO-INTEGRATE: the per-client entry in a shared doc. Accepts `{ [clientId]: … }` and the wrapped
 * forms `{ byClient | clients | shared: { [clientId]: … } }`. Returns null when the athlete turned
 * sharing off for it (`shared: false` or `shareWithCoach: false`).
 */
export function entryFor(doc: unknown, clientId: string): Obj | unknown[] | null {
  if (!isObj(doc)) return null;
  const found = [doc[clientId], ...['byClient', 'clients', 'shared'].map((k) => (isObj(doc[k]) ? (doc[k] as Obj)[clientId] : undefined))].find(
    (v) => v != null,
  );
  if (found == null) return null;
  if (isObj(found) && (found.shared === false || found.shareWithCoach === false)) return null;
  return Array.isArray(found) || isObj(found) ? found : null;
}

const FUEL_LEVELS: FuelLevel[] = ['none', 'watch', 'talk_to_someone'];
/** TODO-INTEGRATE: fuel doc entry → FuelLevel. Reads `level`, `fuelLevel` or `pattern.level`. */
export function fuelFrom(entry: Obj | unknown[] | null): FuelLevel | null {
  if (!isObj(entry)) return null;
  const raw = entry.level ?? entry.fuelLevel ?? (isObj(entry.pattern) ? entry.pattern.level : undefined);
  return FUEL_LEVELS.includes(raw as FuelLevel) ? (raw as FuelLevel) : null;
}

export interface PainSummary {
  ongoing: boolean;
  region: BodyRegion;
  side: 'left' | 'right' | 'both' | null;
  /** Days with pain logged for that region in the last 14 days. */
  days: number;
  worst: number;
  lastDate: string;
}

/** TODO-INTEGRATE: pain doc entry (PainLog[] or `{ logs | entries: PainLog[] }`) → a summary of the last 14 days. */
export function painFrom(entry: Obj | unknown[] | null, today: string): PainSummary | null {
  const list = Array.isArray(entry) ? entry : isObj(entry) ? (entry.logs ?? entry.entries) : null;
  if (!Array.isArray(list)) return null;
  const t = dayNum(today);
  const logs = list
    .filter(isObj)
    .filter((l) => typeof l.date === 'string' && typeof l.level === 'number' && l.level > 0 && BODY_REGIONS.includes(l.region as BodyRegion))
    .map((l) => ({ date: (l.date as string).slice(0, 10), level: l.level as number, region: l.region as BodyRegion, side: (['left', 'right', 'both'].includes(l.side as string) ? l.side : null) as PainSummary['side'] }))
    .filter((l) => t - dayNum(l.date) >= 0 && t - dayNum(l.date) < 14);
  if (!logs.length) return null;
  const daysBy = new Map<BodyRegion, Set<string>>();
  for (const l of logs) daysBy.set(l.region, (daysBy.get(l.region) ?? new Set()).add(l.date));
  const [region, days] = [...daysBy.entries()].sort((a, b) => b[1].size - a[1].size)[0]!;
  const mine = logs.filter((l) => l.region === region).sort((a, b) => b.date.localeCompare(a.date));
  const allDays = new Set(logs.map((l) => l.date)).size;
  const worst = Math.max(...logs.map((l) => l.level));
  // PhysiologySignals.painOngoing: pain logged on 3+ of the last 14 days, or a level ≥ 6.
  return { ongoing: allDays >= 3 || worst >= 6, region, side: mine[0]!.side, days: days.size, worst, lastDate: mine[0]!.date };
}

export interface ProgressSummary {
  stalled: boolean;
  weeksSinceBest: number | null;
  lastBest: { date: string; text: string } | null;
}
/** TODO-INTEGRATE: progress doc entry → `{ stalled | progressStalled, weeksSinceBest, lastBest: { date, text | label } }`. */
export function progressFrom(entry: Obj | unknown[] | null, today: string): ProgressSummary | null {
  if (!isObj(entry)) return null;
  const lb = isObj(entry.lastBest) ? entry.lastBest : null;
  const lastBest =
    lb && typeof lb.date === 'string' && typeof (lb.text ?? lb.label) === 'string' ? { date: (lb.date as string).slice(0, 10), text: (lb.text ?? lb.label) as string } : null;
  const weeks = typeof entry.weeksSinceBest === 'number' ? entry.weeksSinceBest : lastBest ? Math.floor((dayNum(today) - dayNum(lastBest.date)) / 7) : null;
  const flag = entry.stalled ?? entry.progressStalled;
  return { stalled: typeof flag === 'boolean' ? flag : weeks != null && weeks >= 8, weeksSinceBest: weeks, lastBest };
}

/** TODO-INTEGRATE: cycle doc entry → the phase today, only when shared. Reads `phase` or `estimate.phase`. */
export function cycleFrom(entry: Obj | unknown[] | null): CyclePhase | null {
  if (!isObj(entry)) return null;
  const raw = entry.phase ?? (isObj(entry.estimate) ? entry.estimate.phase : undefined);
  return CYCLE_PHASES.includes(raw as CyclePhase) ? (raw as CyclePhase) : null;
}

/** Easier-day reads in the last 7 days, from what the athlete shared. Null when nothing was shared this week. */
export function tiredFrom(entries: SharedReadEntry[], today: string): { tiredDays: number; sharedDays: number } | null {
  const t = dayNum(today);
  const week = entries.filter((e) => e.shared && e.read && t - dayNum(e.date) >= 0 && t - dayNum(e.date) < 7);
  if (!week.length) return null;
  return { tiredDays: week.filter((e) => e.read!.tone === 'ease').length, sharedDays: week.length };
}

/* ---------- the shared docs ---------- */

interface Docs {
  fuel: unknown;
  pain: unknown;
  cycle: unknown;
  progress: unknown;
}
interface SharedDocsState {
  docs: Docs | null;
  load(): Promise<void>;
}
const KEYS = () => [fuelKey(tenant.slug), painKey(tenant.slug), cycleKey(tenant.slug), progressKey(tenant.slug)];

export const useSharedPhysiologyDocs = create<SharedDocsState>((set) => ({
  docs: null,
  async load() {
    const [fuel, pain, cycle, progress] = await Promise.all(KEYS().map((k) => readShared<unknown>(k, null)));
    set({ docs: { fuel, pain, cycle, progress } });
  },
}));
onSharedChange((key) => {
  if (KEYS().includes(key)) void useSharedPhysiologyDocs.getState().load();
});

/* ---------- per client ---------- */

export interface BetweenSessions {
  /** For athleteDropoutRisk; null when the athlete shared none of it. */
  physio: PhysiologyInput | null;
  tired: { tiredDays: number; sharedDays: number } | null;
  fuel: FuelLevel | null;
  pain: PainSummary | null;
  progress: ProgressSummary | null;
  cyclePhase: CyclePhase | null;
  /** Which pieces the athlete shares; anything else is private. */
  shares: { reads: boolean; fuel: boolean; pain: boolean; progress: boolean; cycle: boolean };
}

/**
 * One client's shared signals. Real shared docs win; in the demo, sample clients fall back to the
 * MOCK physiology in @spotter/core/demo for any piece the client app hasn't written.
 */
export function betweenSessionsFor(clientId: string, docs: Docs | null, reads: SharedReadEntry[], today: string): BetweenSessions {
  const seed = isDemo() ? demoPhysiology()[clientId] : undefined;
  const fuelEntry = entryFor(docs?.fuel, clientId);
  const painEntry = entryFor(docs?.pain, clientId);
  const progressEntry = entryFor(docs?.progress, clientId);
  const cycleEntry = entryFor(docs?.cycle, clientId);

  const tiredReads = tiredFrom(reads, today);
  const tired = tiredReads ?? (seed && seed.tiredDays != null ? { tiredDays: seed.tiredDays, sharedDays: 7 } : null);
  const fuel = fuelEntry ? fuelFrom(fuelEntry) : (seed?.fuelLevel ?? null);
  const pain = painEntry
    ? painFrom(painEntry, today)
    : seed?.pain
      ? { ongoing: seed.painOngoing, region: seed.pain.region, side: seed.pain.side, days: seed.pain.days, worst: 4, lastDate: today }
      : null;
  const progress = progressEntry
    ? progressFrom(progressEntry, today)
    : seed && (seed.progressStalled || seed.weeksSinceBest != null)
      ? { stalled: seed.progressStalled, weeksSinceBest: seed.weeksSinceBest ?? null, lastBest: null }
      : null;
  const cyclePhase = cycleFrom(cycleEntry);

  const shares = {
    reads: !!tired,
    fuel: fuel != null,
    pain: !!painEntry || !!seed?.pain,
    progress: !!progress,
    cycle: cyclePhase != null,
  };
  const any = shares.reads || shares.fuel || shares.pain || shares.progress;
  const physio: PhysiologyInput | null = any
    ? {
        runningTired: !!tired && tired.tiredDays >= 4,
        tiredDays: tired?.tiredDays ?? null,
        fuelLevel: fuel,
        painOngoing: !!pain?.ongoing,
        pain: pain ? { region: pain.region, side: pain.side, days: pain.days } : null,
        progressStalled: !!progress?.stalled,
        weeksSinceBest: progress?.weeksSinceBest ?? null,
      }
    : null;
  return { physio, tired, fuel, pain, progress, cyclePhase, shares };
}

/** Loads the shared docs and reads once; re-renders when either changes. */
function useDocs() {
  const docs = useSharedPhysiologyDocs((s) => s.docs);
  const readsDoc = useReadsDoc((s) => s.doc);
  useEffect(() => {
    if (!docs) void useSharedPhysiologyDocs.getState().load();
    if (!readsDoc) void useReadsDoc.getState().load();
  }, [docs, readsDoc]);
  return { docs, ready: !!docs && !!readsDoc, readsDoc };
}

export function useBetweenSessions(clientId: string): { ready: boolean; data: BetweenSessions } {
  const { docs, ready, readsDoc } = useDocs();
  const today = localToday();
  // readsDoc in deps: getSharedReads reads the same cache.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => betweenSessionsFor(clientId, docs, getSharedReads(clientId), today), [clientId, docs, readsDoc, today]);
  return { ready, data };
}

/** Shared physiology for every client in `ids`, for the roster. */
export function usePhysiologyMap(ids: string[]): { ready: boolean; physio: Record<string, PhysiologyInput | null> } {
  const { docs, ready, readsDoc } = useDocs();
  const today = localToday();
  const key = ids.join(',');
  const physio = useMemo(
    () => Object.fromEntries(ids.map((id) => [id, betweenSessionsFor(id, docs, getSharedReads(id), today).physio])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, docs, readsDoc, today],
  );
  return { ready, physio };
}

/* ---------- engagement (sessions, app opens, check-ins, payment) ---------- */

type Status = 'idle' | 'loading' | 'ready' | 'error';
interface EngagementState {
  status: Status;
  activity: MemberActivity[];
  load(): Promise<void>;
}

interface EngagementRow {
  client_id: string;
  full_name: string;
  coach_id: string | null;
  joined_at: string;
  weeks: { planned: number; done: number }[] | null;
  last_app_open_at: string | null;
  last_session_at: string | null;
  check_ins_missed: number;
  sub_status: SubscriptionLike['status'] | null;
}

/**
 * Demo: MOCK activity from @spotter/core/demo. Connected: client_engagement_inputs(t), which returns
 * only the clients this coach can see, with no money and no health data.
 */
export const useEngagement = create<EngagementState>((set, get) => ({
  status: 'idle',
  activity: [],
  async load() {
    set({ status: get().activity.length ? 'ready' : 'loading' });
    if (isDemo()) {
      set({ status: 'ready', activity: demoMemberActivity(Date.now(), useTeam.getState().coachOf) });
      return;
    }
    const { data, error } = await supabase!.rpc('client_engagement_inputs', { t: tenant.id });
    if (error) {
      set({ status: get().activity.length ? 'ready' : 'error' });
      return;
    }
    const activity = ((data ?? []) as EngagementRow[]).map(
      (r): MemberActivity => ({
        clientId: r.client_id,
        name: r.full_name || 'Client',
        planName: null,
        coachId: r.coach_id,
        weeks: r.weeks ?? [],
        lastAppOpenAt: r.last_app_open_at,
        lastSessionAt: r.last_session_at,
        easeReadsRecent: 0,
        easeReadsBefore: 0,
        checkInsMissed: r.check_ins_missed ?? 0,
        joinedAt: r.joined_at,
        // Status only (for "Payment failed" and paused); coaches don't get prices.
        subscription: r.sub_status
          ? { clientId: r.client_id, planKind: 'monthly', priceCents: 0, status: r.sub_status, startedAt: r.joined_at, trialEndsAt: null, canceledAt: null }
          : null,
      }),
    );
    set({ status: 'ready', activity });
  },
}));
