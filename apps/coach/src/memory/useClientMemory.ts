import { useEffect, useMemo } from 'react';
import {
  buildMemory,
  buildPrep,
  detectRecords,
  formatWeight,
  groupByWeek,
  type MemoryInput,
  type TriageItem,
} from '@spotter/core';
import { DEMO_CLIENTS, DEMO_HISTORY, LOWER_A, isoDay } from '@spotter/core/demo';
import { isConfigured } from '@spotter/ui/platform';
import { tenant } from '../env';
import { useCoach } from '../store';
import { useMedia } from '../media/store';
import { useInbox, type CoachMessage } from '../platform/inbox';
import { getSharedReads } from '../reads';
import { followUpTriageId, useMemory } from './store';

// Stable empties: a fresh [] from a selector would re-render forever (React #185).
const NO_MESSAGES: CoachMessage[] = [];

const exerciseName = (exerciseId: string) =>
  LOWER_A.exercises.find((e) => e.exerciseId === exerciseId)?.name ?? 'a lift';

/* MOCK: only the demo client (Jordan) has logged sessions in the sample data. Real PRs only: each
   session is compared with the ones before it, so a first session never counts as a best. */
function sessionsFor(clientId: string): Pick<MemoryInput, 'sessions' | 'prs'> {
  if (clientId !== DEMO_CLIENTS[0]!.id) return { sessions: [], prs: [] };
  const history = [...DEMO_HISTORY].sort((a, b) => a.date.localeCompare(b.date));
  const prs: MemoryInput['prs'] = [];
  history.forEach((s, i) => {
    const before = history.slice(0, i).flatMap((h) => h.sets);
    for (const exerciseId of new Set(s.sets.map((x) => x.exerciseId))) {
      for (const r of detectRecords(exerciseId, 'weight_reps', before, s.sets)) {
        if (r.type === 'heaviest')
          prs.push({
            date: s.date,
            text: `${exerciseName(exerciseId)} ${formatWeight(r.value, tenant.units)} (was ${formatWeight(r.previous, tenant.units)})`,
          });
      }
    }
  });
  return {
    sessions: history.map((s) => ({ date: s.date, title: s.title, variant: 'planned' as const })),
    prs,
  };
}

/** Everything coach memory knows about one client, plus the prep card lines. */
export function useClientMemory(clientId: string) {
  const client = useCoach((s) => s.clients.find((c) => c.id === clientId));
  const triage = useCoach((s) => s.triage);
  const media = useMedia();
  const messages = useInbox((s) => s.threads[clientId] ?? NO_MESSAGES);
  const mem = useMemory();

  useEffect(() => {
    if (mem.status === 'idle') void mem.load();
    if (!media.loaded) void media.load();
  }, [mem, media]);

  const today = isoDay(0);
  const reads = getSharedReads(clientId);

  const memory = useMemo(() => {
    const input: MemoryInput = {
      today,
      reads,
      ...sessionsFor(clientId),
      missed: triage
        .filter((t) => t.clientId === clientId && t.reason === 'missed_sessions')
        .flatMap((t) =>
          Array.from({ length: t.count ?? 1 }, () => ({ date: t.since.slice(0, 10), title: '' })),
        ),
      checkIns: media.checkIns
        .filter((c) => c.clientId === clientId)
        .map((c) => ({
          date: c.dueDate,
          bodyweightKg: c.answers.bodyweightKg ?? null,
          adherence: c.answers.adherence ?? null,
        })),
      messages: messages
        .filter((m) => m.kind === 'text' && m.body)
        .map((m) => ({ at: m.sentAt, fromClient: !m.mine, body: m.body })),
      injuries: client?.injuryNote ? [{ date: client.startDate, text: client.injuryNote }] : [],
      formChecksWaiting: media.formChecks
        .filter(
          (f) => f.clientId === clientId && f.upload.status === 'sent' && !media.replies[f.id],
        )
        .map((f) => ({ date: f.createdAt.slice(0, 10), exerciseName: f.exerciseName })),
      notes: mem.notes
        .filter((n) => n.clientId === clientId)
        .map((n) => ({ at: n.at, text: n.text })),
      followUps: mem.followUps.filter((f) => f.clientId === clientId),
    };
    return buildMemory(input);
  }, [
    today,
    reads,
    clientId,
    triage,
    media.checkIns,
    media.formChecks,
    media.replies,
    messages,
    client,
    mem.notes,
    mem.followUps,
  ]);

  const prep = useMemo(
    () => buildPrep({ today, week: client?.thisWeek ?? { done: 0, planned: 0 }, memory, reads }),
    [today, client, memory, reads],
  );
  const groups = useMemo(() => groupByWeek(memory, today), [memory, today]);
  const status =
    mem.status === 'error' ? 'error' : mem.status === 'ready' && media.loaded ? 'ready' : 'loading';
  return { client, memory, prep, groups, status, retry: () => void mem.load() } as const;
}

/** Marks a follow-up done (or not) and keeps its triage row in step. */
export function setFollowUpDone(id: string, done: boolean) {
  const triageId = followUpTriageId(id);
  const now = new Date().toISOString();
  useCoach.setState((s) => ({
    triage: s.triage.map((t) =>
      t.id === triageId ? { ...t, handledAt: done ? (t.handledAt ?? now) : null } : t,
    ),
  }));
  return useMemory.getState().setFollowUpDone(id, done);
}

/**
 * Demo stand-in for the server's triage jobs (follow_up_triage trigger, raise_sleep_streaks,
 * raise_load_spikes): due follow-ups, three short nights in a row and a training-load spike reach
 * the Clients list. Each opens once; handling it keeps it closed. Connected builds get these from
 * triage_items instead.
 */
export function useMemoryTriage() {
  const status = useMemory((s) => s.status);
  const followUps = useMemory((s) => s.followUps);
  const load = useMemory((s) => s.load);
  const clients = useCoach((s) => s.clients);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  useEffect(() => {
    if (isConfigured() || status !== 'ready') return;
    const today = isoDay(0);
    const existing = new Set(useCoach.getState().triage.map((t) => t.id));
    const add: TriageItem[] = [];
    const open = (id: string, item: Omit<TriageItem, 'id' | 'snoozedUntil' | 'handledAt'>) => {
      if (!existing.has(id)) add.push({ id, snoozedUntil: null, handledAt: null, ...item });
    };
    for (const f of followUps) {
      if (!f.doneAt && f.dueOn <= today)
        open(followUpTriageId(f.id), {
          clientId: f.clientId,
          reason: 'follow_up_due',
          detail: f.text,
          since: `${f.dueOn}T07:00:00.000Z`,
        });
    }
    for (const c of clients) {
      const recent = getSharedReads(c.id).filter((r) => r.date > isoDay(-3) && r.date <= today);
      const short = recent.filter((r) => r.read?.factors.some((f) => f.kind === 'sleep_short'));
      if (recent.length === 3 && short.length === 3) {
        open(`sleep-${c.id}-${today}`, {
          clientId: c.id,
          reason: 'sleep_short_streak',
          count: 3,
          detail: 'Short sleep 3 nights running',
          since: short[2]!.submittedAt,
        });
      }
      const latest = recent[recent.length - 1];
      const spike = latest?.read?.factors.find((f) => f.kind === 'load_spike');
      if (latest && spike) {
        open(`load-${c.id}-${latest.date}`, {
          clientId: c.id,
          reason: 'load_spike',
          detail: spike.text.replace('your recent average', 'their recent average'),
          since: latest.submittedAt,
        });
      }
    }
    if (add.length) useCoach.setState((s) => ({ triage: [...s.triage, ...add] }));
  }, [status, followUps, clients]);
}
