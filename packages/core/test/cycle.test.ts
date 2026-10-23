import { describe, expect, it } from 'vitest';
import { cycleStats, estimateCycle, mergePeriods, phaseForDay, phaseLine, SymptomLog } from '../src/cycle';
import { demoCycleProfile } from '../src/demo/cycle';
import type { CycleProfile, PeriodLog } from '../src/physiology';

const DAY = 86_400_000;
const add = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Period starts from a first start and cycle lengths. */
function periods(first: string, lengths: number[], bleed = 5): PeriodLog[] {
  const out: PeriodLog[] = [{ start: first, end: add(first, bleed - 1) }];
  for (const l of lengths) {
    const start = add(out[out.length - 1]!.start, l);
    out.push({ start, end: add(start, bleed - 1) });
  }
  return out;
}
const profile = (mode: CycleProfile['mode'], ps: PeriodLog[]): CycleProfile => ({ mode, periods: ps, birthYear: 1985, shareWithCoach: false });

describe('cycleStats', () => {
  it('uses the median of the last six in-range cycles', () => {
    const s = cycleStats(periods('2026-01-01', [40, 29, 28, 30, 27, 31, 29]));
    expect(s.recent).toEqual([29, 28, 30, 27, 31, 29]);
    expect(s.typicalLength).toBe(29);
    expect(s.spread).toBe(4);
    expect(s.confidence).toBe('high');
  });

  it('ignores cycles under 15 or over 60 days for the median', () => {
    const s = cycleStats(periods('2026-01-01', [28, 10, 29, 70, 30]));
    expect(s.recent).toEqual([28, 29, 30]);
    expect(s.typicalLength).toBe(29);
  });

  it('grades confidence from count and spread', () => {
    expect(cycleStats([{ start: '2026-01-01', end: null }]).confidence).toBe('none');
    expect(cycleStats(periods('2026-01-01', [28, 29])).confidence).toBe('low');
    expect(cycleStats(periods('2026-01-01', [28, 29, 30])).confidence).toBe('medium');
    expect(cycleStats(periods('2026-01-01', [24, 29, 34, 28])).confidence).toBe('low'); // spread 10
    expect(cycleStats(periods('2026-01-01', [26, 29, 32, 28, 29, 30])).confidence).toBe('medium'); // spread 6
  });
});

describe('phaseForDay', () => {
  it('counts luteal back from the next period, ovulation the 3 days before', () => {
    expect(phaseForDay(3, 29, 5)).toBe('menstrual');
    expect(phaseForDay(6, 29, 5)).toBe('follicular');
    expect(phaseForDay(14, 29, 5)).toBe('ovulation');
    expect(phaseForDay(16, 29, 5)).toBe('ovulation');
    expect(phaseForDay(17, 29, 5)).toBe('luteal');
    expect(phaseForDay(29, 29, 5)).toBe('luteal');
  });
});

describe('estimateCycle', () => {
  const ps = periods('2026-04-01', [29, 28, 30, 27, 31, 29]);
  const last = ps[ps.length - 1]!.start;

  it('estimates the phase, day and next-period window in natural mode', () => {
    const e = estimateCycle(profile('natural', ps), add(last, 21));
    expect(e.phase).toBe('luteal');
    expect(e.dayOfCycle).toBe(22);
    expect(e.typicalLength).toBe(29);
    expect(e.confidence).toBe('high');
    expect(e.nextPeriod).toEqual({ from: add(last, 27), to: add(last, 31) });
    expect(e.note).toContain('Day 22 of about 29, luteal phase (estimated');
    expect(phaseLine(e)).toBe('Luteal phase, day 22 (estimated)');
    expect(e.irregularities).toEqual([]);
  });

  it('uses the logged end of a period for the menstrual days', () => {
    const p = [...ps.slice(0, -1), { start: last, end: add(last, 2) }];
    expect(estimateCycle(profile('natural', p), add(last, 3)).phase).toBe('follicular');
    expect(estimateCycle(profile('natural', ps), add(last, 3)).phase).toBe('menstrual');
  });

  it('uses the real cycle length when looking back', () => {
    // The 31-day cycle: luteal starts on day 19, not day 17.
    const start = ps[4]!.start;
    expect(estimateCycle(profile('natural', ps), add(start, 17)).phase).toBe('ovulation');
    expect(estimateCycle(profile('natural', ps), add(start, 18)).phase).toBe('luteal');
  });

  it('has no phases on hormonal contraception, post-menopause, pregnancy or when not tracking', () => {
    for (const mode of ['hormonal', 'postmenopause', 'pregnant_postpartum', 'not_tracking'] as const) {
      const e = estimateCycle(profile(mode, ps), add(last, 21));
      expect(e.phase).toBeNull();
      expect(e.nextPeriod).toBeNull();
      expect(e.irregularities).toEqual([]);
    }
    expect(estimateCycle(profile('hormonal', ps), add(last, 21)).note).toBe(
      'On hormonal contraception, the app uses your own day-to-day data instead of cycle phases.',
    );
  });

  it('only shows a phase in perimenopause or irregular mode once confidence is medium', () => {
    const varied = periods('2026-01-01', [24, 35, 29, 41]);
    const lastV = varied[varied.length - 1]!.start;
    const e = estimateCycle(profile('perimenopause', varied), add(lastV, 20));
    expect(e.confidence).toBe('low');
    expect(e.phase).toBeNull();
    expect(e.nextPeriod).toBeNull();
    expect(e.note).toMatch(/vary too much/);
    const steady = estimateCycle(profile('irregular', ps), add(last, 21));
    expect(steady.phase).toBe('luteal');
  });

  it('asks for data when there is none', () => {
    const none = estimateCycle(profile('natural', []), '2026-10-01');
    expect(none.phase).toBeNull();
    expect(none.confidence).toBe('none');
    const one = estimateCycle(profile('natural', [{ start: '2026-10-01', end: null }]), '2026-10-12');
    expect(one.phase).toBeNull();
    expect(one.dayOfCycle).toBe(12);
    expect(one.note).toMatch(/one more period start/);
  });

  it('notes long cycles, missing periods and big changes neutrally in natural mode', () => {
    const p = periods('2026-01-01', [28, 29, 28, 40]);
    const lastP = p[p.length - 1]!.start;
    const e = estimateCycle(profile('natural', p), add(lastP, 93));
    expect(e.irregularities).toContain(`A cycle ran 40 days (from ${p[3]!.start})`);
    expect(e.irregularities).toContain('No period logged for 93 days');
    expect(e.phase).toBeNull();
    const changed = periods('2026-01-01', [28, 29, 28, 20]);
    expect(estimateCycle(profile('natural', changed), add(changed[4]!.start, 3)).irregularities).toContain(
      'Your last cycle ran 20 days, 8 fewer than your usual 28',
    );
    // Not in irregular mode: long cycles and gaps are expected there.
    expect(estimateCycle(profile('irregular', p), add(lastP, 93)).irregularities).toEqual([]);
  });

  it('starts the demo athlete in the luteal phase', () => {
    const now = new Date(2026, 9, 23, 9);
    const e = estimateCycle(demoCycleProfile(now), '2026-10-23');
    expect(e.phase).toBe('luteal');
    expect(e.dayOfCycle).toBe(22);
    expect(e.confidence).toBe('high');
  });
});

describe('mergePeriods', () => {
  it('adds health-app periods, the athlete’s own entry wins within 3 days', () => {
    const logged: PeriodLog[] = [{ start: '2026-09-01', end: '2026-09-05' }];
    const merged = mergePeriods(logged, [
      { start: '2026-09-03', end: '2026-09-06' },
      { start: '2026-08-04', end: null },
      { start: '2026-08-05', end: null },
    ]);
    expect(merged).toEqual([
      { start: '2026-08-04', end: null, source: 'health' },
      { start: '2026-09-01', end: '2026-09-05' },
    ]);
  });

  it('keeps everything when nothing overlaps', () => {
    expect(mergePeriods([], [{ start: '2026-09-01', end: null }])).toHaveLength(1);
    expect(mergePeriods([{ start: '2026-09-01', end: null }], [])).toHaveLength(1);
  });
});

describe('SymptomLog', () => {
  it('accepts 0–3 per symptom and rejects anything else', () => {
    expect(SymptomLog.safeParse({ date: '2026-10-23', scores: { hot_flashes: 2, poor_sleep: 0 } }).success).toBe(true);
    expect(SymptomLog.safeParse({ date: '2026-10-23', scores: { hot_flashes: 4 } }).success).toBe(false);
    expect(SymptomLog.safeParse({ date: '2026-10-23', scores: { sneezing: 1 } }).success).toBe(false);
  });
});
