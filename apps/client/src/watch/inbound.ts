import { parseWatchInbound, watchResultToBlockResults, watchResultToSession, type WatchCheckIn, type WatchResult } from '@spotter/core';
import { DEMO_CLIENT, EMPTY_SHARED_WATCH, coachClientIdFor, watchKey, type SharedWatchDoc } from '@spotter/core/demo';
import { readShared, writeShared } from '@spotter/ui';
import { IS_DEMO, tenant } from '../env';
import { syncQueue } from '../sync';
import { useApp, type CompletedSession } from '../store';
import { useDaily } from '../daily/store';
import { readFor } from '../daily/read';
import { useHealthImports } from '../health/store';
import { useWatch } from './store';

/**
 * What the watch sent → the phone's existing paths, so a watch session counts everywhere (load, progress,
 * patterns, the coach's view): a session goes through session.start / set.log / session.finish like one
 * logged on the phone, plus session.watch for the heart-rate summary; a check-in goes through the daily
 * check; a reply is a message to the coach. Every handler is idempotent (ids come from the watch).
 */
export async function handleInbound(json: string): Promise<'stored' | 'duplicate' | 'ignored'> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return 'ignored';
  }
  const parsed = parseWatchInbound(raw);
  if (!parsed.ok) return 'ignored';
  const v = parsed.value;
  if (v.kind === 'session') return importSession(v);
  if (v.kind === 'check_in') return importCheckIn(v);
  if (useWatch.getState().seen.includes(v.id)) return 'duplicate';
  useWatch.getState().markSeen(v.id);
  await useApp.getState().sendMessage(v.body);
  return 'stored';
}

export async function importSession(result: WatchResult): Promise<'stored' | 'duplicate' | 'ignored'> {
  const watch = useWatch.getState();
  const app = useApp.getState();
  if (watch.seen.includes(result.resultId) || app.completed.some((s) => s.sessionId === result.resultId)) return 'duplicate';
  const plan = watch.plans[result.planId];
  if (!plan) return 'ignored';
  const { session, summary } = watchResultToSession(result, plan);
  // Intervals, race segments and timed pieces with no program exercise behind them come back as block results.
  const results = watchResultToBlockResults(result, plan, watch.origins?.[result.planId] ?? []);

  await syncQueue.enqueue('session.start', { sessionId: session.sessionId, programDayId: plan.programDayId, scheduledDate: session.date, startedAt: session.startedAt });
  for (const s of session.sets) await syncQueue.enqueue('set.log', s);
  for (const r of results) await syncQueue.enqueue('block.result', r);
  await syncQueue.enqueue('session.finish', { sessionId: session.sessionId, finishedAt: session.finishedAt, feel: null, note: null });
  await syncQueue.enqueue('session.watch', { ...summary, shareWithCoach: watch.shareHr });
  void syncQueue.flush();

  const done: CompletedSession = {
    sessionId: session.sessionId,
    title: session.title,
    date: session.date,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    feel: session.feel,
    note: null,
    sets: session.sets,
    ...(session.variant ? { variant: session.variant } : {}),
    ...(results.length ? { results } : {}),
  };
  useApp.setState({ completed: [...useApp.getState().completed, done] });
  watch.addSummary({ ...summary, title: session.title, date: session.date });

  // MOCK (demo): the coach app reads shared watch summaries from here (real builds: session_watch_summaries).
  if (IS_DEMO && watch.shareHr) {
    const doc = await readShared<SharedWatchDoc>(watchKey(tenant.slug), EMPTY_SHARED_WATCH);
    const id = coachClientIdFor(DEMO_CLIENT.id);
    const mine = [...(doc.sessions[id] ?? []).filter((x) => x.sessionId !== summary.sessionId), { ...summary, title: session.title, date: session.date }].slice(-20);
    await writeShared(watchKey(tenant.slug), { ...doc, sessions: { ...doc.sessions, [id]: mine } });
  }
  return 'stored';
}

/** The 3-tap check-in: energy, soreness and stress; sleep from the watch when Health has it. */
async function importCheckIn(c: WatchCheckIn): Promise<'stored' | 'duplicate' | 'ignored'> {
  const daily = useDaily.getState();
  if (daily.checks.some((x) => x.date === c.date)) return 'duplicate';
  const sleep = useHealthImports.getState().wearableDays.find((d) => d.date === c.date && d.source !== 'manual' && d.sleepHours != null);
  const inputs = { checks: daily.checks, completed: useApp.getState().completed, kcalByDay: [], targetKcal: null, extraLoads: [] };
  await daily.submit(
    {
      sleepHours: sleep?.sleepHours != null ? Math.round(sleep.sleepHours * 2) / 2 : null,
      sleepSource: sleep ? 'health' : null,
      energy: c.energy,
      soreness: c.soreness,
      stress: c.stress,
      cyclePhase: null,
      shareCycle: false,
      note: null,
      shareWithCoach: daily.settings.shareDefault,
    },
    (check) => readFor(c.date, check, inputs),
  );
  return 'stored';
}
