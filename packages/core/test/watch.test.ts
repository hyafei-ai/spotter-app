import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { LOWER_A } from '../src/demo/client';
import { DEMO_WATCH_HYBRID } from '../src/demo/watch';
import demoTenants from '../src/demo-tenants.json';
import { dailyBrief } from '../src/brief';
import { Mutation } from '../src/schemas';
import type { DailyRead } from '../src/signals';
import {
  WATCH_MAX_BYTES,
  WatchContext,
  WatchSessionPlan,
  boundWatchContext,
  derivedId,
  hrRecoveryFrom,
  hrRecoveryLine,
  parseWatchInbound,
  payloadBytes,
  recoveryDropLine,
  watchActivityType,
  watchBranding,
  watchBriefFrom,
  watchPlanFromSession,
  watchResultToSession,
  type WatchResult,
} from '../src/watch';

const opts = { version: 'planned' as const, units: 'kg' as const, incrementKg: 2.5 };

describe('watchPlanFromSession', () => {
  const plan = watchPlanFromSession(LOWER_A, opts);

  it('maps a strength day to blocks the schema accepts', () => {
    expect(WatchSessionPlan.safeParse(plan).success).toBe(true);
    expect(plan.blocks.map((b) => b.kind)).toEqual(['strength', 'strength', 'strength', 'strength', 'interval']);
    const squat = plan.blocks[0]!;
    expect(squat.kind === 'strength' && squat.sets[0]).toEqual({ reps: 8, loadKg: 80, rpe: 8 });
    expect(squat.kind === 'strength' && squat.trackRpe).toBe(true);
    expect(plan.planId).toBe(`${LOWER_A.programDayId}:${LOWER_A.scheduledDate}:planned`);
  });

  it('keeps the phone logger’s order, supersets alternating', () => {
    const names = plan.order.map(([b, i]) => `${plan.blocks[b]!.name}#${i}`);
    expect(names.slice(6, 10)).toEqual(['Bulgarian Split Squat#0', 'Hanging Knee Raise#0', 'Bulgarian Split Squat#1', 'Hanging Knee Raise#1']);
    expect(plan.order).toHaveLength(14);
    expect(plan.blocks[2]!.kind === 'strength' && plan.blocks[2]!.group).toBeTruthy();
  });

  it('maps distance work to a distance interval the client marks done', () => {
    const carry = plan.blocks[4]!;
    expect(carry).toMatchObject({ kind: 'interval', reps: 2, workSec: null, distanceM: 40 });
  });

  it('applies calibration only to the planned version, and says so', () => {
    const cal = (kg: number) => kg - 2.5;
    const planned = watchPlanFromSession(LOWER_A, { ...opts, calibrate: cal, calibrationLine: 'Loads 3% lighter today' });
    expect(planned.blocks[0]!.kind === 'strength' && planned.blocks[0]!.sets[0]!.loadKg).toBe(77.5);
    expect(planned.calibration).toBe('Loads 3% lighter today');
    const lighter = watchPlanFromSession(LOWER_A, { ...opts, version: 'lighter', calibrate: cal, calibrationLine: 'x' });
    expect(lighter.blocks[0]!.kind === 'strength' && lighter.blocks[0]!.sets[0]!.loadKg).toBe(80);
    expect(lighter.calibration).toBeNull();
    expect(lighter.label).toBe('Lower A · easier');
  });

  it('accepts the MOCK conditioning session (interval, station, timed blocks)', () => {
    expect(WatchSessionPlan.safeParse(DEMO_WATCH_HYBRID).success).toBe(true);
    expect(new Set(DEMO_WATCH_HYBRID.blocks.map((b) => b.kind))).toEqual(new Set(['interval', 'station', 'timed']));
  });
});

describe('watchBriefFrom', () => {
  const read: DailyRead = { date: '2026-10-26', tone: 'ease', headline: '', factors: [{ kind: 'sleep_short', text: 'Slept 5.6 h, under your usual', strain: true }], suggestLighter: true };
  const brief = dailyBrief({ read, hrv: null, restingHr: null, cycle: null, calibration: null, fuel: null, injury: null, symptoms: { night_sweats: 2 }, hasLighter: true, coach: 'Maya' });

  it('gives the feel line, the strongest reason and one start action', () => {
    const w = watchBriefFrom(brief, { start: { version: 'lighter', label: 'Lower A · easier' }, checkedIn: true });
    expect(w.feel).toBe('You’re running tired today');
    expect(w.strike).toBe('tired');
    expect(w.glance).toBe('Running tired');
    expect(w.reason).toBe('Slept 5.6 h, under your usual');
    expect(w.action).toEqual({ kind: 'start', version: 'lighter', label: 'Start Lower A · easier' });
  });

  it('asks for the check-in on a rest day not yet checked in, else no action', () => {
    expect(watchBriefFrom(brief, { start: null, checkedIn: false }).action.kind).toBe('check_in');
    expect(watchBriefFrom(brief, { start: null, checkedIn: true }).action.kind).toBe('none');
  });
});

describe('branding', () => {
  it('lightens every demo tenant’s brand to pass on the watch background', () => {
    for (const t of Object.values(demoTenants)) {
      const b = watchBranding(t);
      expect(b.appName).toBe(t.appName);
      expect(b.monogram).toBe(t.coach.monogram);
    }
  });

  it('matches the colours the build plugin bakes into the watch asset catalog', () => {
    const require = createRequire(import.meta.url);
    const tokens = require('../../../apps/client/plugins/watch/brandTokens.js') as { watchAccent(hex: string): { accent: string; accentInk: string } };
    for (const t of Object.values(demoTenants)) {
      const b = watchBranding(t);
      expect(tokens.watchAccent(t.brandColor)).toEqual({ accent: b.accent, accentInk: b.accentInk });
    }
  });
});

const ctx = (): WatchContext => ({
  v: 1,
  sentAt: '2026-10-26T07:00:00.000Z',
  branding: watchBranding(demoTenants['maya-reyes-strength']),
  day: { kind: 'session' },
  brief: null,
  plans: [watchPlanFromSession(LOWER_A, opts), watchPlanFromSession(LOWER_A, { ...opts, version: 'lighter' })],
  checkedIn: false,
  hrMax: 182,
  shareHr: true,
  messages: Array.from({ length: 5 }, (_, i) => ({ id: derivedId('0192f0a1-0000-7000-8000-000000000500', i), from: 'coach' as const, body: 'x'.repeat(400), sentAt: '2026-10-26T06:00:00.000Z' })),
  quickReplies: ['Done, felt good'],
});

describe('size bounds', () => {
  it('a normal day is far under the bound and passes the schema', () => {
    const c = ctx();
    expect(WatchContext.safeParse(c).success).toBe(true);
    expect(payloadBytes(c)).toBeLessThan(WATCH_MAX_BYTES / 2);
    expect(boundWatchContext(c)).toBe(c);
  });

  it('drops messages first, then notes, then the other versions', () => {
    const c = ctx();
    const tight = boundWatchContext(c, payloadBytes(c) - 100)!;
    expect(tight.messages).toHaveLength(2);
    expect(tight.plans).toHaveLength(2);
    const tighter = boundWatchContext(c, payloadBytes({ ...c, messages: [], plans: c.plans.slice(0, 1) }) + 10)!;
    expect(tighter.plans).toHaveLength(1);
    expect(boundWatchContext(c, 50)).toBeNull();
  });
});

const plan = watchPlanFromSession(LOWER_A, opts);
const result = (): WatchResult => ({
  v: 1,
  kind: 'session',
  resultId: '0192F0A1-0000-7000-8000-00000000A001',
  planId: plan.planId,
  programDayId: plan.programDayId,
  date: plan.date,
  title: plan.title,
  version: 'planned',
  startedAt: '2026-10-26T17:00:00.000Z',
  endedAt: '2026-10-26T17:52:00.000Z',
  ended: 'finished',
  sets: [
    { b: 0, i: 0, reps: 8, loadKg: 80, rpe: 7.5, at: '2026-10-26T17:05:00.000Z' },
    { b: 0, i: 1, reps: 7, loadKg: 80, rpe: 8.5, at: '2026-10-26T17:09:00.000Z' },
    { b: 3, i: 0, reps: 12, loadKg: null, rpe: null, at: '2026-10-26T17:30:00.000Z' },
  ],
  intervals: [{ b: 4, i: 0, workSec: 41, distanceM: 40, avgHr: 140, maxHr: 151 }],
  stations: [],
  timed: [],
  hr: { avg: 128, max: 164, perMinute: [110, 120, 130] },
  hrRecovery: { peak: 160, at60: 131, at120: 114 },
});

describe('watch results', () => {
  it('parses what the watch sends, with upper-case ids from Foundation', () => {
    const r = parseWatchInbound(result());
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.kind === 'session' && r.value.resultId).toBe('0192f0a1-0000-7000-8000-00000000a001');
  });

  it('reads keys Swift left out (nil) as null', () => {
    const r = result();
    const swift = {
      ...r,
      sets: r.sets.map(({ rpe: _rpe, loadKg, ...s }) => (loadKg == null ? s : { ...s, loadKg })),
      intervals: r.intervals.map(({ avgHr: _a, maxHr: _m, ...x }) => x),
      hr: undefined,
      hrRecovery: { peak: 150, at60: 120 },
    };
    const parsed = parseWatchInbound(JSON.parse(JSON.stringify(swift)));
    if (!parsed.ok || parsed.value.kind !== 'session') throw new Error(parsed.ok ? 'kind' : parsed.message);
    expect(parsed.value.sets[2]).toMatchObject({ rpe: null, loadKg: null });
    expect(parsed.value.intervals[0]).toMatchObject({ avgHr: null, maxHr: null });
    expect(parsed.value.hr).toBeNull();
    expect(parsed.value.hrRecovery).toEqual({ peak: 150, at60: 120, at120: null });
  });

  it('reports a newer payload version instead of guessing', () => {
    expect(parseWatchInbound({ ...result(), v: 2 })).toMatchObject({ ok: false, reason: 'newer_version' });
    expect(parseWatchInbound({ ...result(), sets: 'nope' })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('parses a check-in and a reply', () => {
    expect(parseWatchInbound({ v: 1, kind: 'check_in', id: derivedId(plan.programDayId, 1), date: '2026-10-26', energy: 2, soreness: 4, stress: 3, at: '2026-10-26T06:30:00.000Z' }).ok).toBe(true);
    expect(parseWatchInbound({ v: 1, kind: 'reply', id: derivedId(plan.programDayId, 2), body: 'On my way', sentAt: '2026-10-26T06:30:00.000Z' }).ok).toBe(true);
    expect(parseWatchInbound({ v: 1, kind: 'reply', id: derivedId(plan.programDayId, 2), body: '', sentAt: '2026-10-26T06:30:00.000Z' }).ok).toBe(false);
  });

  it('maps into the phone’s completed session so it counts everywhere', () => {
    const parsed = parseWatchInbound(result());
    if (!parsed.ok || parsed.value.kind !== 'session') throw new Error('parse');
    const { session, summary } = watchResultToSession(parsed.value, plan);
    expect(session.sessionId).toBe('0192f0a1-0000-7000-8000-00000000a001');
    expect(session.sets).toHaveLength(4);
    const squat = session.sets.find((s) => s.exerciseId === 'back-squat' && s.setIndex === 1)!;
    expect(squat).toMatchObject({ weightKg: 80, reps: 7, rpe: 8.5, programExerciseId: LOWER_A.exercises[0]!.id });
    const knee = session.sets.find((s) => s.exerciseId === 'hanging-knee-raise')!;
    expect(knee.weightKg).toBeNull();
    const carry = session.sets.find((s) => s.exerciseId === LOWER_A.exercises[4]!.exerciseId)!;
    expect(carry).toMatchObject({ durationS: 41, distanceM: 40 });
    expect(new Set(session.sets.map((s) => s.id)).size).toBe(4);
    // Same result twice → the same ids, so re-delivery is a no-op.
    expect(watchResultToSession(parsed.value, plan).session.sets.map((s) => s.id)).toEqual(session.sets.map((s) => s.id));
    expect(summary).toMatchObject({ avgHr: 128, maxHr: 164, hrrPeak: 160, hrr60: 29, hrr120: 46 });
    expect(summary.splits[0]).toMatchObject({ kind: 'interval', sec: 41 });
  });

  it('the summary and every set pass the sync schemas', () => {
    const parsed = parseWatchInbound(result());
    if (!parsed.ok || parsed.value.kind !== 'session') throw new Error('parse');
    const { session, summary } = watchResultToSession(parsed.value, plan);
    const base = { clientMutationId: '0192f0a1-0000-7000-8000-00000000b001', createdAt: '2026-10-26T18:00:00.000Z' };
    for (const s of session.sets) expect(Mutation.safeParse({ ...base, kind: 'set.log', payload: s }).success).toBe(true);
    expect(Mutation.safeParse({ ...base, kind: 'session.watch', payload: { ...summary, shareWithCoach: true } }).success).toBe(true);
  });

  it('keeps splits for blocks with no program exercise (MOCK multi-sport) without inventing sets', () => {
    const r: WatchResult = { ...result(), planId: DEMO_WATCH_HYBRID.planId, sets: [], intervals: [{ b: 0, i: 0, workSec: 300, distanceM: 1000, avgHr: 150, maxHr: 160 }], stations: [{ b: 2, sec: 74, avgHr: 155, maxHr: 166 }], timed: [{ b: 5, sec: 60 }] };
    const { session, summary } = watchResultToSession(r, DEMO_WATCH_HYBRID);
    expect(session.sets).toHaveLength(0);
    expect(summary.splits.map((s) => `${s.kind}:${s.name}`)).toEqual(['interval:Run', 'station:Sled push', 'timed:Plank']);
  });
});

describe('activity type', () => {
  it('strength → traditional strength, runs with a pace → running, mixed → HIIT', () => {
    expect(watchActivityType(plan)).toBe(63); // Lower A has a distance carry: mixed
    expect(watchActivityType({ blocks: plan.blocks.filter((b) => b.kind === 'strength') })).toBe(50);
    expect(watchActivityType({ blocks: [DEMO_WATCH_HYBRID.blocks[0]!] })).toBe(37);
    expect(watchActivityType(DEMO_WATCH_HYBRID)).toBe(63);
  });
});

describe('heart-rate recovery', () => {
  it('words the coach’s stored drops the same way', () => {
    expect(recoveryDropLine(27, 44)).toBe('Down 27 bpm in the first minute, 44 after two');
    expect(recoveryDropLine(27, null)).toBe('Down 27 bpm in the first minute');
    expect(recoveryDropLine(null, 44)).toBeNull();
  });

  it('reads the samples nearest 60 s and 120 s after the end', () => {
    const r = hrRecoveryFrom(162, [{ t: 5, bpm: 158 }, { t: 58, bpm: 133 }, { t: 63, bpm: 131 }, { t: 125, bpm: 117 }]);
    expect(r).toEqual({ peak: 162, at60: 133, at120: 117 });
    expect(hrRecoveryLine(r)).toBe('Down 29 bpm in the first minute, 45 after two');
  });

  it('says nothing it didn’t measure', () => {
    expect(hrRecoveryFrom(null, [])).toBeNull();
    const r = hrRecoveryFrom(150, [{ t: 30, bpm: 140 }]);
    expect(r).toEqual({ peak: 150, at60: null, at120: null });
    expect(hrRecoveryLine(r)).toBeNull();
  });
});
