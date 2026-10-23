import { describe, expect, it } from 'vitest';
import {
  BANISTER_CONSTANTS,
  MAX_HR_UNKNOWN,
  aerobicDecoupling,
  classifyRun,
  efficiencyFactor,
  hrZones,
  hrr60,
  hrrTrend,
  maxHrFor,
  timeInZones,
  trimp,
  zoneOf,
  type HrSample,
} from '../src/endurance';
import {
  exerciseForDay,
  exerciseKcalEstimate,
  exerciseKcalEstimateHr,
  keytelKcal,
} from '../src/fuel';
import { maxObservedHr } from '../src/wearables';

/* MOCK heart-rate streams built for these tests. */

/** Samples every `step` s from t0 for `sec` s, HR from a function of t. */
const stream = (
  sec: number,
  hr: (t: number) => number,
  extra: (t: number) => Partial<HrSample> = () => ({}),
  step = 5,
  t0 = 0,
): HrSample[] =>
  Array.from({ length: Math.floor(sec / step) }, (_, i) => {
    const t = t0 + i * step;
    return { t, hr: hr(t), ...extra(t) };
  });

describe('max HR', () => {
  it('uses the coach value, else the observed max, else nothing (never 190)', () => {
    expect(maxHrFor(188, 195)).toEqual({ bpm: 188, source: 'coach' });
    expect(maxHrFor(null, 195)).toEqual({ bpm: 195, source: 'observed' });
    expect(maxHrFor(null, null)).toBeNull();
    expect(maxHrFor(30, null)).toBeNull();
    expect(
      maxHrFor(
        null,
        maxObservedHr([
          { maxHr: 182, avgHr: 150 },
          { maxHr: 176, avgHr: null },
        ]),
      ),
    ).toEqual({ bpm: 182, source: 'observed' });
  });

  it('every reader says it can’t tell without a max', () => {
    const s = stream(600, () => 150);
    expect(timeInZones(s, null)).toBeNull();
    expect(trimp(s, { maxHr: null })).toBeNull();
    expect(classifyRun({ durationSec: 600, samples: s, maxHr: null })).toEqual({
      type: 'unknown',
      reason: MAX_HR_UNKNOWN,
    });
  });
});

describe('zones', () => {
  it('bpm ranges from the athlete’s own max', () => {
    expect(hrZones(200)).toEqual([
      { zone: 1, fromBpm: 0, toBpm: 119 },
      { zone: 2, fromBpm: 120, toBpm: 139 },
      { zone: 3, fromBpm: 140, toBpm: 159 },
      { zone: 4, fromBpm: 160, toBpm: 179 },
      { zone: 5, fromBpm: 180, toBpm: null },
    ]);
    expect([zoneOf(119, 200), zoneOf(120, 200), zoneOf(180, 200)]).toEqual([1, 2, 5]);
  });

  it('time in zone, each sample counting until the next, capped at 10 s', () => {
    const s = [
      { t: 0, hr: 110 },
      { t: 5, hr: 130 },
      { t: 10, hr: 150 },
      { t: 60, hr: 170 },
      { t: 65, hr: 190 },
    ];
    expect(timeInZones(s, 200, 70)).toEqual({ 1: 5, 2: 5, 3: 10, 4: 5, 5: 5 });
  });

  it('ignores impossible readings', () => {
    expect(
      timeInZones(
        [
          { t: 0, hr: 10 },
          { t: 5, hr: 400 },
          { t: 10, hr: 130 },
        ],
        200,
        15,
      ),
    ).toEqual({ 1: 0, 2: 5, 3: 0, 4: 0, 5: 0 });
  });
});

describe('efficiency and decoupling', () => {
  it('efficiency factor is speed (m/min) ÷ HR, higher is better', () => {
    expect(efficiencyFactor(200, 150)).toBe(1.333);
    expect(efficiencyFactor(0, 150)).toBeNull();
  });

  it('heart rate drifting up at the same pace is positive decoupling', () => {
    const s = stream(
      3600,
      (t) => (t < 1800 ? 140 : 150),
      () => ({ speed: 3 }),
    );
    const d = aerobicDecoupling(s)!;
    expect(d.basis).toBe('pace');
    expect(d.pct).toBe(6.7);
    expect(d.line).toBe('Heart rate drifted up 7% relative to pace in the second half');
  });

  it('uses power when every sample has it', () => {
    const s = stream(
      2400,
      () => 150,
      (t) => ({ power: t < 1200 ? 200 : 190 }),
    );
    const d = aerobicDecoupling(s)!;
    expect([d.basis, d.pct]).toEqual(['power', 5]);
  });

  it('steady and negative cases read plainly', () => {
    expect(
      aerobicDecoupling(
        stream(
          1200,
          () => 145,
          () => ({ speed: 3 }),
        ),
      )!.line,
    ).toBe('Heart rate held steady against pace from the first half to the second');
    expect(
      aerobicDecoupling(
        stream(
          1200,
          (t) => (t < 600 ? 150 : 140),
          () => ({ speed: 3 }),
        ),
      )!.line,
    ).toBe('Heart rate came down 7% relative to pace in the second half');
  });

  it('needs enough samples with output', () => {
    expect(
      aerobicDecoupling(
        stream(
          60,
          () => 150,
          () => ({ speed: 3 }),
        ),
      ),
    ).toBeNull();
    expect(aerobicDecoupling(stream(1200, () => 150))).toBeNull();
  });
});

describe('run classifier on personal zones', () => {
  const MAX = 190;
  it.each([
    ['recovery', 1800, () => 105],
    ['easy', 2400, () => 125],
    ['long', 5400, () => 125],
    ['tempo', 1800, () => 145],
    ['tempo', 1800, () => 160],
    ['race', 1200, () => 178],
  ] as const)('%s', (type, sec, hr) => {
    expect(classifyRun({ durationSec: sec, samples: stream(sec, hr), maxHr: MAX }).type).toBe(type);
  });

  it('intervals: three or more separate hard efforts', () => {
    const reps = stream(2400, (t) => (Math.floor(t / 240) % 2 === 1 ? 165 : 110));
    const c = classifyRun({ durationSec: 2400, samples: reps, maxHr: MAX });
    expect(c.type).toBe('intervals');
  });

  it('the same run reads differently for a different max', () => {
    const s = stream(2400, () => 150);
    expect(classifyRun({ durationSec: 2400, samples: s, maxHr: 200 }).type).toBe('tempo');
    expect(classifyRun({ durationSec: 2400, samples: s, maxHr: 240 }).type).toBe('easy');
  });

  it('takes zone totals, a coach long-run length, and says why', () => {
    const c = classifyRun({
      durationSec: 50 * 60,
      zoneSeconds: { 1: 300, 2: 2400, 3: 300, 4: 0, 5: 0 },
      maxHr: MAX,
      longRunMin: 45,
    });
    expect(c).toEqual({ type: 'long', reason: '80% of the time in zone 2, for 50 min' });
    expect(classifyRun({ durationSec: 600, samples: [], maxHr: MAX }).reason).toBe(
      'No heart rate recorded for this run',
    );
  });
});

describe('heart-rate recovery', () => {
  it('HRR60 is the peak at the end of the effort minus HR 60 s later', () => {
    const s = [
      ...stream(300, () => 172),
      ...stream(
        90,
        (t) => Math.round(172 - (t - 300) * 0.5),
        () => ({}),
        5,
        300,
      ),
    ];
    expect(hrr60(s, 295)).toEqual({ peakHr: 172, hrAt60: 145, dropBpm: 27 });
  });

  it('needs a reading near 60 s and a real effort', () => {
    expect(
      hrr60(
        stream(300, () => 172),
        295,
      ),
    ).toBeNull();
    expect(
      hrr60(
        [
          ...stream(300, () => 95),
          ...stream(
            90,
            () => 80,
            () => ({}),
            5,
            300,
          ),
        ],
        295,
      ),
    ).toBeNull();
  });

  it('trend against the athlete’s own earlier readings, no categories', () => {
    const r = (d: string, drop: number) => ({ date: `2026-10-${d}`, dropBpm: drop });
    const t = hrrTrend([
      r('01', 20),
      r('04', 22),
      r('07', 21),
      r('10', 23),
      r('13', 19),
      r('16', 25),
      r('19', 26),
      r('22', 27),
    ])!;
    expect([t.recentAvg, t.earlierAvg, t.changeBpm]).toEqual([26, 21, 5]);
    expect(t.line).toBe(
      'Heart rate recovery is 5 bpm faster than your earlier readings (last 3 readings against the 5 before)',
    );
    expect(t.coachLine).toBe(
      'Heart rate recovery is 5 bpm faster than their earlier readings (last 3 readings against the 5 before)',
    );
    expect(hrrTrend([r('01', 20), r('04', 22), r('07', 21), r('10', 23)])).toBeNull();
  });
});

describe('TRIMP', () => {
  it('Banister with the published constants when sex and resting HR are known', () => {
    // 30 min exactly at ΔHR 0.5 (HR 125 with rest 60, max 190).
    const s = stream(1800, () => 125);
    const m = trimp(s, { maxHr: 190, restingHr: 60, sex: 'male' }, 1800)!;
    const f = trimp(s, { maxHr: 190, restingHr: 60, sex: 'female' }, 1800)!;
    expect(m.method).toBe('banister');
    expect(m.value).toBe(Math.round(30 * 0.5 * 0.64 * Math.exp(1.92 * 0.5)));
    expect(f.value).toBe(Math.round(30 * 0.5 * 0.86 * Math.exp(1.67 * 0.5)));
    expect(BANISTER_CONSTANTS).toEqual({
      male: { k: 0.64, b: 1.92 },
      female: { k: 0.86, b: 1.67 },
    });
  });

  it('Edwards zone TRIMP otherwise, and says why', () => {
    // 10 min at 55% (×1), 10 min at 75% (×3), 10 min at 95% (×5), 10 min at 40% (×0) of max 200.
    const s = [
      ...stream(600, () => 110),
      ...stream(
        600,
        () => 150,
        () => ({}),
        5,
        600,
      ),
      ...stream(
        600,
        () => 190,
        () => ({}),
        5,
        1200,
      ),
      ...stream(
        600,
        () => 80,
        () => ({}),
        5,
        1800,
      ),
    ];
    const e = trimp(s, { maxHr: 200 }, 2400)!;
    expect(e).toEqual({
      value: 90,
      method: 'edwards',
      note: 'Zone TRIMP (Edwards) from heart rate and max 200 bpm, because sex isn’t set',
    });
    expect(trimp(s, { maxHr: 200, sex: 'female' }, 2400)!.note).toMatch(
      /resting heart rate isn’t known/,
    );
  });

  it('a harder session scores higher on the same method', () => {
    const easy = trimp(
      stream(1800, () => 120),
      { maxHr: 190, restingHr: 55, sex: 'female' },
    )!;
    const hard = trimp(
      stream(1800, () => 165),
      { maxHr: 190, restingHr: 55, sex: 'female' },
    )!;
    expect(hard.value).toBeGreaterThan(easy.value);
  });
});

describe('Keytel heart-rate energy (fuel.ts)', () => {
  it('matches the published equations', () => {
    // men: (−55.0969 + 0.6309×150 + 0.1988×80 + 0.2017×35) / 4.184 × 30
    expect(keytelKcal(30, 150, { weightKg: 80, age: 35, sex: 'male' })).toBe(
      Math.round(((-55.0969 + 0.6309 * 150 + 0.1988 * 80 + 0.2017 * 35) / 4.184) * 30),
    );
    expect(keytelKcal(30, 150, { weightKg: 63.5, age: 35, sex: 'female' })).toBe(
      Math.round(((-20.4022 + 0.4472 * 150 - 0.1263 * 63.5 + 0.074 * 35) / 4.184) * 30),
    );
    expect(keytelKcal(30, 150, { weightKg: 63.5, age: 35, sex: 'female' })).toBe(296);
  });

  it('no estimate outside the valid HR range, with sex unknown, or with missing inputs', () => {
    expect(keytelKcal(30, 85, { weightKg: 70, age: 30, sex: 'male' })).toBeNull();
    expect(keytelKcal(30, 205, { weightKg: 70, age: 30, sex: 'male' })).toBeNull();
    expect(keytelKcal(30, 150, { weightKg: 70, age: 30, sex: null })).toBeNull();
    expect(keytelKcal(30, null, { weightKg: 70, age: 30, sex: 'male' })).toBeNull();
    expect(keytelKcal(30, 150, { weightKg: null, age: 30, sex: 'male' })).toBeNull();
  });

  it('session estimate takes resting energy off, and falls back to METs', () => {
    const gross = keytelKcal(60, 140, { weightKg: 70, age: 40, sex: 'female' })!;
    const hr = exerciseKcalEstimateHr({ durationMin: 60, feel: 3, avgHr: 140 }, 70, {
      age: 40,
      sex: 'female',
    });
    expect(hr.kcal).toBe(gross - 70);
    expect(hr.note).toBe('Estimated from heart rate: 60 min at an average of 140 bpm');
    expect(
      exerciseKcalEstimateHr({ durationMin: 60, feel: 3 }, 70, { age: 40, sex: 'female' }),
    ).toEqual(exerciseKcalEstimate({ durationMin: 60, feel: 3 }, 70));
    expect(exerciseKcalEstimateHr({ durationMin: 60, feel: 3, avgHr: 140 }, 70, null)).toEqual(
      exerciseKcalEstimate({ durationMin: 60, feel: 3 }, 70),
    );
  });

  it('exerciseForDay keeps its old behaviour and uses heart rate when given a person', () => {
    const sessions = [{ durationMin: 60, feel: 3, avgHr: 140 }];
    expect(exerciseForDay(sessions, 70, null)).toEqual({
      exerciseKcal: exerciseKcalEstimate(sessions[0]!, 70).kcal,
      exerciseSource: 'estimate',
    });
    expect(exerciseForDay(sessions, 70, null, { age: 40, sex: 'female' }).exerciseKcal).toBe(
      keytelKcal(60, 140, { weightKg: 70, age: 40, sex: 'female' })! - 70,
    );
    expect(exerciseForDay(sessions, 70, 500, { age: 40, sex: 'female' })).toEqual({
      exerciseKcal: 500,
      exerciseSource: 'wearable',
    });
  });
});
