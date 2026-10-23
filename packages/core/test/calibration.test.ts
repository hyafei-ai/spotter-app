import { describe, expect, it } from 'vitest';
import {
  ACTIVE_CALIBRATOR,
  CALIBRATORS,
  activeCalibrator,
  calibratedLoad,
  calibrationLine,
  personalBaseline,
  sessionDeltas,
} from '../src/calibration';
import { estimateCycle, phaseOnFor } from '../src/cycle';
import { demoCycleProfile, demoCycleSessions } from '../src/demo/cycle';
import type { Calibration, CalibrationSession, CycleProfile, PeriodLog } from '../src/physiology';

const DAY = 86_400_000;
const add = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const FIRST = '2026-04-01';
const TODAY = '2026-10-01';

/** Regular 28-day cycles from FIRST through TODAY. */
function regular(mode: CycleProfile['mode'] = 'natural'): CycleProfile {
  const periods: PeriodLog[] = [];
  for (let s = FIRST; s <= TODAY; s = add(s, 28)) periods.push({ start: s, end: add(s, 4) });
  return { mode, periods, birthYear: 1985, shareWithCoach: false };
}

/** A session every other day; `pct(date, i)` sets how far from the usual 100 kg e1RM it runs. */
function sessions(pct: (date: string, i: number) => number, from = FIRST, to = TODAY): CalibrationSession[] {
  const out: CalibrationSession[] = [];
  let i = 0;
  for (let d = from; d < to; d = add(d, 2), i++) {
    const e1rm = 100 * (1 + pct(d, i) / 100);
    out.push({ date: d, feel: null, sets: [{ exerciseId: 'back-squat', weightKg: e1rm, reps: 1, rpe: null }] });
  }
  return out;
}

const run = (profile: CycleProfile, s: CalibrationSession[]) => personalBaseline.calibrate({ today: TODAY, sessions: s, phaseOn: phaseOnFor(profile) });
const luteal = (a: Calibration) => a.adjustments.find((x) => x.phase === 'luteal')!;

describe('personal-baseline-v1', () => {
  it('makes no adjustment with no data', () => {
    const c = run(regular(), []);
    expect(c.ready).toBe(false);
    expect(c.cyclesObserved).toBe(0);
    expect(c.adjustments.every((a) => a.appliedPct === 0 && a.confidence === 'none')).toBe(true);
    expect(c.summary).toMatch(/Not enough of your own training data yet/);
  });

  it('has no phases, so no adjustment, on hormonal contraception', () => {
    const p = regular('hormonal');
    const c = run(p, sessions((d) => (estimateCycle(regular(), d).phase === 'luteal' ? -4 : 0)));
    expect(c.ready).toBe(false);
    expect(c.adjustments.every((a) => a.sessions === 0 && a.appliedPct === 0)).toBe(true);
  });

  it('applies a consistent luteal dip of about 4%, shrunk and rounded to 0.5%', () => {
    const p = regular();
    const c = run(p, sessions((d) => (estimateCycle(p, d).phase === 'luteal' ? -4 : 0)));
    const l = luteal(c);
    expect(c.ready).toBe(true);
    expect(l.cycles).toBeGreaterThanOrEqual(4);
    expect(l.confidence).not.toBe('low');
    expect(l.deltaPct).toBeLessThan(-3);
    expect([-4, -3.5]).toContain(l.appliedPct);
    expect(c.adjustments.filter((a) => a.phase !== 'luteal').every((a) => a.appliedPct === 0)).toBe(true);
    expect(c.summary).toMatch(/your lifts in the luteal phase run about \d% under your usual/);
  });

  it('shrinks noisy data and doesn’t apply it', () => {
    const p = regular();
    // ±12% swings around a small luteal dip: too noisy to act on.
    const c = run(p, sessions((d, i) => (i % 2 ? 12 : -12) + (estimateCycle(p, d).phase === 'luteal' ? -3 : 0)));
    const l = luteal(c);
    expect(l.confidence).toBe('low');
    expect(l.appliedPct).toBe(0);
    expect(Math.abs(l.deltaPct)).toBeLessThan(5);
    expect(c.adjustments.every((a) => a.appliedPct === 0)).toBe(true);
  });

  it('caps the applied change at 5%', () => {
    const p = regular();
    const c = run(p, sessions((d) => (estimateCycle(p, d).phase === 'luteal' ? -12 : 0)));
    expect(luteal(c).deltaPct).toBeLessThan(-5);
    expect(luteal(c).appliedPct).toBe(-5);
  });

  it('needs 2 cycles and 4 sessions in a phase before it is confident', () => {
    const p = regular();
    const c = run(p, sessions((d) => (estimateCycle(p, d).phase === 'luteal' ? -6 : 0), FIRST, add(FIRST, 36)));
    expect(luteal(c).confidence).toBe('low');
    expect(luteal(c).cycles).toBeLessThan(2);
    expect(luteal(c).appliedPct).toBe(0);
  });

  it('reads higher effort at the same load as worse than baseline', () => {
    const s: CalibrationSession[] = [0, 2, 4, 6].map((d, i) => ({
      date: add(FIRST, d),
      feel: null,
      sets: [{ exerciseId: 'bench-press', weightKg: 50, reps: 5, rpe: i === 3 ? 9 : 7 }],
    }));
    const deltas = sessionDeltas(s);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.deltaPct).toBeCloseTo(-6);
  });

  it('calibrates the demo athlete: ready, a small luteal reduction only', () => {
    const now = new Date(2026, 9, 23, 9);
    const p = demoCycleProfile(now);
    const c = personalBaseline.calibrate({ today: '2026-10-23', sessions: demoCycleSessions(now), phaseOn: phaseOnFor(p) });
    expect(c.ready).toBe(true);
    expect(luteal(c).appliedPct).toBeLessThanOrEqual(-2);
    expect(luteal(c).appliedPct).toBeGreaterThanOrEqual(-4);
    expect(c.adjustments.filter((a) => a.phase !== 'luteal').every((a) => a.appliedPct === 0)).toBe(true);
  });
});

describe('calibratedLoad', () => {
  const cal: Calibration = {
    method: 'personal-baseline-v1',
    ready: true,
    cyclesObserved: 5,
    summary: '',
    adjustments: [
      { phase: 'luteal', deltaPct: -3.6, appliedPct: -3.5, sessions: 20, cycles: 5, confidence: 'high' },
      { phase: 'follicular', deltaPct: 0.4, appliedPct: 0, sessions: 20, cycles: 5, confidence: 'high' },
    ],
  };

  it('rounds the calibrated suggestion to the plate increment', () => {
    expect(calibratedLoad(80, cal, 'luteal', 2.5)).toBe(77.5); // 77.2 → 77.5
    expect(calibratedLoad(100, cal, 'luteal', 2.5)).toBe(97.5); // 96.5 → 97.5
  });

  it('leaves the planned load untouched when nothing applies', () => {
    expect(calibratedLoad(81.3, cal, 'follicular', 2.5)).toBe(81.3);
    expect(calibratedLoad(81.3, cal, null, 2.5)).toBe(81.3);
    expect(calibratedLoad(81.3, null, 'luteal', 2.5)).toBe(81.3);
  });

  it('says why in one line', () => {
    expect(calibrationLine(cal, 'luteal')).toBe('Loads 3.5% lighter today: your lifts run lower in the luteal phase (5 cycles of your own data).');
    expect(calibrationLine(cal, 'follicular')).toBeNull();
  });
});

describe('calibrator registry', () => {
  it('ships the personal-baseline method and falls back to it', () => {
    expect(ACTIVE_CALIBRATOR).toBe('personal-baseline-v1');
    expect(CALIBRATORS['personal-baseline-v1']).toBe(personalBaseline);
    expect(activeCalibrator().label).toBe('Your own baseline');
    expect(activeCalibrator('unknown')).toBe(personalBaseline);
  });
});
