import { nextPlanFromPull, type LoggedSet, type PulledRows } from '@spotter/core';
import { isoDay } from '@spotter/core/demo';
import { callFunction, getAuth } from '@spotter/ui/platform';
import { useApp, type ChatMessage, type CompletedSession } from '../store';
import { usePulled } from './pulled';

interface PullResponse extends Partial<PulledRows> {
  cursor: string;
  tenants?: { id: string }[];
  logged_sets?: {
    id: string;
    session_id: string;
    program_exercise_id: string;
    exercise_id: string;
    set_index: number;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    duration_s: number | null;
    distance_m: number | null;
    logged_at: string;
    voided_at: string | null;
  }[];
  sessions?: (PulledRows['sessions'][number] & { id: string; scheduled_date: string | null; started_at: string; feel: number | null; note: string | null })[];
  messages?: {
    id: string;
    thread_id: string;
    sender_id: string;
    kind: 'text' | 'voice' | 'image' | 'video' | 'link';
    body: string | null;
    media_path: string | null;
    duration_ms: number | null;
    link: ChatMessage['link'];
    sent_at: string;
    read_at: string | null;
  }[];
}

/** Accumulated program rows, so a delta pull can still rebuild the full next plan. */
const programCache: PulledRows = {
  assignments: [],
  program_weeks: [],
  program_days: [],
  program_exercises: [],
  prescribed_sets: [],
  progression_rules: [],
  exercises: [],
  sessions: [],
};

function upsertRows<T>(into: T[], rows: T[] | undefined, key: (r: T) => string) {
  if (!rows?.length) return;
  const byKey = new Map(into.map((r) => [key(r), r]));
  rows.forEach((r) => byKey.set(key(r), r));
  into.splice(0, into.length, ...byKey.values());
}

let inFlight: Promise<void> | null = null;
/** The program cache lives in memory, so the first pull after launch is a full one; later pulls are deltas. */
let fullPullDone = false;

/** GET /sync/pull since the last cursor and fold the changes into local state. No-op in demo builds. */
export function pull(): Promise<void> {
  if (getAuth().status !== 'signedIn') return Promise.resolve();
  inFlight ??= doPull().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doPull(): Promise<void> {
  const since = fullPullDone ? usePulled.getState().cursor : null;
  const res = await callFunction<PullResponse>('sync-pull', since ? { query: { since } } : {});
  fullPullDone = true;
  const uid = getAuth().userId;

  upsertRows(programCache.assignments, res.assignments, (r) => `${r.program_id}:${r.start_date}`);
  upsertRows(programCache.program_weeks, res.program_weeks, (r) => r.id);
  upsertRows(programCache.program_days, res.program_days, (r) => r.id);
  upsertRows(programCache.program_exercises, res.program_exercises, (r) => r.id);
  upsertRows(programCache.prescribed_sets, res.prescribed_sets, (r) => `${r.program_exercise_id}:${r.set_index}`);
  upsertRows(programCache.progression_rules, res.progression_rules, (r) => r.id);
  upsertRows(programCache.exercises, res.exercises, (r) => r.id);
  upsertRows(programCache.sessions, res.sessions as PulledRows['sessions'] | undefined, (r) => (r as { id?: string }).id ?? '');

  const firstThread = res.messages?.[0]?.thread_id;
  usePulled.getState().set({
    cursor: res.cursor,
    tenantId: res.tenants?.[0]?.id ?? usePulled.getState().tenantId,
    threadId: firstThread ?? usePulled.getState().threadId,
    hasAssignment: programCache.assignments.some((a) => a.status === 'active'),
    nextPlan: nextPlanFromPull(programCache, isoDay(0)),
    lastPulledAt: new Date().toISOString(),
  });

  const app = useApp.getState();
  if (res.messages?.length) {
    const byId = new Map(app.messages.map((m) => [m.id, m]));
    for (const m of res.messages) {
      byId.set(m.id, {
        id: m.id,
        from: m.sender_id === uid ? 'client' : 'coach',
        body: m.body ?? '',
        sentAt: m.sent_at,
        mutationId: null,
        kind: m.kind === 'video' ? 'link' : m.kind,
        mediaUri: byId.get(m.id)?.mediaUri ?? null,
        durationMs: m.duration_ms,
        link: m.link,
        readAt: m.read_at,
      });
    }
    useApp.setState({ messages: [...byId.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt)) });
  }

  // Finished sessions from the server become History (and feed progression and PRs).
  const finished = (res.sessions ?? []).filter((s) => s.finished_at);
  if (finished.length) {
    const sets = res.logged_sets ?? [];
    const byId = new Map(app.completed.map((c) => [c.sessionId, c]));
    for (const s of finished) {
      const own: LoggedSet[] = sets
        .filter((x) => x.session_id === s.id && !x.voided_at)
        .map((x) => ({
          id: x.id,
          sessionId: x.session_id,
          programExerciseId: x.program_exercise_id,
          exerciseId: x.exercise_id,
          setIndex: x.set_index,
          weightKg: x.weight,
          reps: x.reps,
          rpe: x.rpe,
          durationS: x.duration_s,
          distanceM: x.distance_m,
          loggedAt: x.logged_at,
        }));
      const title = programCache.program_days.find((d) => d.id === s.program_day_id)?.title ?? 'Session';
      const c: CompletedSession = {
        sessionId: s.id,
        title,
        date: s.scheduled_date ?? s.started_at.slice(0, 10),
        startedAt: s.started_at,
        finishedAt: s.finished_at!,
        feel: s.feel ?? 0,
        note: s.note,
        sets: own.length ? own : (byId.get(s.id)?.sets ?? []),
      };
      byId.set(s.id, c);
    }
    useApp.setState({ completed: [...byId.values()] });
  }
}
