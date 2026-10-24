import { useMemo } from 'react';
import {
  DEFAULT_QUICK_REPLIES,
  WATCH_PAYLOAD_VERSION,
  fromDisplay,
  maxObservedHr,
  watchBranding,
  watchBriefFrom,
  watchBlockOrigins,
  watchPlanFromSession,
  type WatchBlockOrigin,
  type WatchContext,
  type WatchDay,
  type WatchSessionPlan,
} from '@spotter/core';
import { tenant } from '../env';
import { isFinishedToday, todayPlan, useApp } from '../store';
import { lookupDay, useAssigned } from '../programs';
import { useBrief } from '../brief/useBrief';
import { useDaily } from '../daily/store';
import { useSessionCalibration } from '../cycle/hooks';
import { useVersions } from '../today/versions';
import { useHealthImports } from '../health/store';
import { useWatch } from './store';

/** Where each watch block of a sent plan came from (planId → origins), so a result maps back to block scores. */
export const sentOrigins = new Map<string, (WatchBlockOrigin | null)[]>();

/**
 * Today on the wrist, built from exactly what the phone's Today shows: the same plan, the same brief and the
 * same recommended version (docs/ux/watch.md W1). Used by WatchSync (sent to the watch) and by the web watch
 * preview (drawn), so the two can't disagree.
 */
export function useWatchContext(): WatchContext {
  const demo = useApp((s) => s.demo);
  const completed = useApp((s) => s.completed);
  const messages = useApp((s) => s.messages);
  const programLoaded = useAssigned((s) => s.loaded);
  const checks = useDaily((s) => s.checks);
  const workouts = useHealthImports((s) => s.workouts);
  const shareHr = useWatch((s) => s.shareHr);
  const plan = todayPlan(demo.todayMode);
  const done = isFinishedToday(completed, plan);
  const sessionLeft = plan && !done ? plan : undefined;
  const { today, brief } = useBrief(sessionLeft);
  const { options, recommended } = useVersions(sessionLeft ?? null, brief.suggestLighter);
  const cal = useSessionCalibration(sessionLeft ? `today:${today}` : null, 'planned');
  const lookup = programLoaded && demo.todayMode === 'session' ? lookupDay() : null;

  return useMemo(() => {
    const units = tenant.units;
    const incrementKg = fromDisplay(tenant.weightIncrement, units);
    const first = tenant.coach.name.split(' ')[0] ?? '';
    const plans: WatchSessionPlan[] = [...options]
      .sort((a, b) => Number(b.version === recommended) - Number(a.version === recommended))
      .map((o) => {
        const p = watchPlanFromSession(o.plan, {
          version: o.version,
          units,
          incrementKg,
          calibrate: (kg) => cal.adjust(kg) ?? kg,
          calibrationLine: cal.line,
        });
        sentOrigins.set(p.planId, watchBlockOrigins(o.plan));
        return p;
      });
    const checkedIn = checks.some((c) => c.date === today);
    const day: WatchDay = done
      ? { kind: 'done', title: done.title, sets: done.sets.length }
      : plan
        ? { kind: 'session' }
        : demo.todayMode === 'rest' || lookup?.kind === 'rest'
          ? { kind: 'rest', line: tenant.coach.restDayLine.slice(0, 200) }
          : { kind: 'no_program', line: `${first} hasn’t set your next session yet.` };
    const start = plans[0] ? { version: plans[0].version, label: plans[0].label } : null;
    const hrMax = maxObservedHr(workouts);
    return {
      v: WATCH_PAYLOAD_VERSION,
      sentAt: new Date().toISOString(),
      branding: watchBranding(tenant),
      day,
      brief: watchBriefFrom(brief, { start: day.kind === 'session' ? start : null, checkedIn }),
      plans: day.kind === 'session' ? plans : [],
      checkedIn,
      hrMax: hrMax != null && hrMax >= 100 && hrMax <= 240 ? Math.round(hrMax) : null,
      shareHr,
      messages: messages.slice(-5).map((m) => ({ id: m.id, from: m.from, body: m.body.slice(0, 500), sentAt: m.sentAt })),
      quickReplies: DEFAULT_QUICK_REPLIES,
    };
    // sentAt changes on purpose only when the inputs do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, recommended, cal.line, cal.active, checks, today, done, plan, demo.todayMode, lookup?.kind, brief, workouts, shareHr, messages]);
}
