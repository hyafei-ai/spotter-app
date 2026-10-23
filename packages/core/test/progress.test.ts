import { describe, expect, it } from 'vitest';
import { consistency, consistencyText, e1rmTrend, mainLifts, phaseBests, progressStalled, progressWins, rawBests, repBests, trendText } from '../src/progress';
import type { CalibrationSession, CycleEstimate } from '../src/physiology';
import type { CyclePhase } from '../src/signals';

const TODAY = '2026-10-23';
const iso = (offset: number) => new Date(Date.UTC(2026, 9, 23) + offset * 86_400_000).toISOString().slice(0, 10);
const session = (offset: number, sets: [string, number, number][]): CalibrationSession => ({
  date: iso(offset),
  feel: null,
  sets: sets.map(([exerciseId, weightKg, reps]) => ({ exerciseId, weightKg, reps, rpe: null })),
});
const estimate = (date: string, phase: CyclePhase | null): CycleEstimate => ({
  date,
  mode: 'natural',
  phase,
  dayOfCycle: null,
  typicalLength: 28,
  confidence: phase ? 'medium' : 'none',
  nextPeriod: null,
  note: '',
  irregularities: [],
});

describe('raw and rep bests', () => {
  it('needs earlier history: the first session is never a best', () => {
    expect(rawBests([session(-7, [['back-squat', 80, 5]])])).toEqual([]);
  });

  it('finds a new estimated max', () => {
    const w = rawBests([session(-14, [['back-squat', 80, 5]]), session(-7, [['back-squat', 82.5, 5]])]);
    expect(w).toHaveLength(1);
    expect(w[0]!.text).toMatch(/^Best Back Squat yet: about 96\.3 kg estimated max/);
  });

  it('finds more reps at the same weight', () => {
    const w = repBests([session(-14, [['back-squat', 80, 6], ['back-squat', 80, 5]]), session(-7, [['back-squat', 80, 8]])]);
    expect(w).toEqual([expect.objectContaining({ kind: 'rep_best', value: 8, previous: 6, text: '8 reps at 80 kg on Back Squat: the most you’ve done at that weight' })]);
  });

  it('does not count a rep best when more reps were done at a heavier weight before', () => {
    expect(repBests([session(-14, [['back-squat', 80, 10], ['back-squat', 70, 6]]), session(-7, [['back-squat', 70, 8]])])).toEqual([]);
  });
});

describe('phase-calibrated bests', () => {
  // Luteal in weeks −6 and −2, follicular in between.
  const phaseOn = (date: string) => {
    const ago = (Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
    return estimate(date, ago >= 40 || (ago >= 10 && ago < 20) ? 'luteal' : 'follicular');
  };
  const sessions = [
    session(-42, [['back-squat', 80, 5]]), // luteal 93.3
    session(-28, [['back-squat', 90, 5]]), // follicular 105
    session(-14, [['back-squat', 85, 5]]), // luteal 99.2: not a raw best, but the best luteal squat
  ];

  it('compares a phase only with itself', () => {
    const w = phaseBests(sessions, phaseOn);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ kind: 'phase_best', phase: 'luteal', date: iso(-14) });
    expect(w[0]!.text).toMatch(/^Strongest luteal-phase Back Squat yet/);
  });

  it('degrades gracefully without cycle data', () => {
    expect(phaseBests(sessions, null)).toEqual([]);
    expect(phaseBests(sessions, (d) => estimate(d, null))).toEqual([]);
  });

  it('lists wins newest first, without a phase best repeating a raw best', () => {
    const wins = progressWins({ sessions, phaseOn });
    expect(wins.map((w) => w.kind)).toEqual(['phase_best', 'raw_best']);
  });
});

describe('e1RM trend', () => {
  it('reports the 6-week slope as a percentage', () => {
    const s = [session(-35, [['deadlift', 100, 5]]), session(-21, [['deadlift', 102.5, 5]]), session(-7, [['deadlift', 105, 5]])];
    const t = e1rmTrend(s, 'deadlift', TODAY);
    expect(t.points).toHaveLength(3);
    expect(t.direction).toBe('up');
    expect(t.slopePct).toBeGreaterThan(4);
    expect(trendText(t)).toMatch(/^Deadlift: up about \d+(\.\d)?% over 6 weeks$/);
    expect(mainLifts(s, TODAY)).toEqual(['deadlift']);
  });

  it('waits for 3 sessions', () => {
    const t = e1rmTrend([session(-7, [['deadlift', 100, 5]])], 'deadlift', TODAY);
    expect(t.direction).toBe('unknown');
    expect(trendText(t)).toMatch(/few more sessions/);
  });
});

describe('consistency', () => {
  it('counts the streak of weeks with 2+ sessions, letting this week finish', () => {
    const dates = [iso(-1), iso(-8), iso(-10), iso(-15), iso(-17), iso(-22), iso(-30)];
    const c = consistency(dates, TODAY, 8, 3);
    expect(c.streak).toBe(2);
    expect(c.planned).toBe(24);
    expect(consistencyText(c)).toBe('2 weeks in a row with 2 or more sessions');
  });
});

describe('progressStalled', () => {
  const steady = (fn: (week: number) => number) =>
    Array.from({ length: 16 }, (_, i) => session(-(i * 3.5 | 0) - 1, [['back-squat', fn(i), 5]]));

  it('is stalled after 8 weeks of steady training with no new best', () => {
    expect(progressStalled({ sessions: steady(() => 80), phaseOn: null, today: TODAY })).toBe(true);
  });

  it('is not stalled with a recent best', () => {
    expect(progressStalled({ sessions: steady((i) => (i === 0 ? 82.5 : 80)), phaseOn: null, today: TODAY })).toBe(false);
  });

  it('is not stalled when training wasn’t steady', () => {
    expect(progressStalled({ sessions: steady(() => 80).slice(0, 6), phaseOn: null, today: TODAY })).toBe(false);
  });
});
