import { describe, expect, it } from 'vitest';
import { demoDailyChecks } from '../src/demo/daily';
import { dailyRead } from '../src/signals';
import { Mutation } from '../src/schemas';

describe('demo daily checks', () => {
  it('produce a "keep an eye on it" read on first open (two short nights, no check yet today)', () => {
    const now = new Date(2026, 9, 21, 9, 0, 0);
    const checks = demoDailyChecks(now);
    expect(checks).toHaveLength(14);
    expect(checks[13]!.date).toBe('2026-10-20');
    const r = dailyRead({
      today: '2026-10-21',
      check: null,
      history: checks,
      load: { status: 'unknown', acute: 0, chronicWeekly: 0, ratio: null },
      fuel: 'unknown',
    });
    expect(r.tone).toBe('watch');
    expect(r.factors[0]).toMatchObject({ kind: 'sleep_short', strain: true });
  });
});

describe('daily_check.submit mutation', () => {
  const m = {
    clientMutationId: '0192f0a5-0000-7000-8000-000000000099',
    createdAt: '2026-10-21T07:00:00Z',
    kind: 'daily_check.submit',
    payload: {
      checkId: '0192f0a5-0000-7000-8000-000000000098',
      date: '2026-10-21',
      sleepHours: 6,
      sleepSource: 'manual',
      energy: 2,
      soreness: 3,
      stress: 3,
      cyclePhase: 'luteal',
      shareCycle: false,
      note: null,
      shareWithCoach: true,
      sharedRead: { tone: 'ease', headline: 'Today looks like an easier day', factors: [{ kind: 'sleep_short', text: 'x', strain: true }], suggestLighter: true },
      submittedAt: '2026-10-21T07:00:00Z',
    },
  };
  it('accepts a check with a private cycle phase', () => {
    expect(Mutation.safeParse(m).success).toBe(true);
  });
  it('rejects an unknown cycle phase and an out-of-range energy', () => {
    expect(Mutation.safeParse({ ...m, payload: { ...m.payload, cyclePhase: 'week3' } }).success).toBe(false);
    expect(Mutation.safeParse({ ...m, payload: { ...m.payload, energy: 7 } }).success).toBe(false);
  });
  it('accepts a session variant', () => {
    expect(
      Mutation.safeParse({ ...m, kind: 'session.variant', payload: { sessionId: '0192f0a5-0000-7000-8000-000000000097', variant: 'lighter' } }).success,
    ).toBe(true);
  });
});
