import { describe, expect, it } from 'vitest';
import {
  compareMeans,
  cyclePhasePattern,
  findPatterns,
  fuelPerformance,
  mobilitySoreness,
  pinPattern,
  recoveryTime,
  shortNight,
  sleepPerformance,
  sleepRpe,
  timeOfDay,
  volumeResponse,
} from '../src/patterns';
import type { ClientDay, TimelineSession } from '../src/timeline';
import type { Calibration } from '../src/physiology';
import { DEMO_JORDAN_ID, DEMO_MEI_ID, demoClientDays, demoClientPatterns } from '../src/demo/patterns';

const DAY = 86_400_000;
const add = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const START = '2026-06-01';

/** Deterministic noise in −1…1 (a small LCG), so "no effect" histories are noisy but repeatable. */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x / 2147483648) * 2 - 1;
  };
}

function session(over: Partial<TimelineSession> = {}): TimelineSession {
  return { source: 'spotter', title: 'S', minutes: 50, load: 300, hardSets: 9, rpe: 7, hour: 7, deltaPct: 0, bests: {}, groupSets: {}, ...over };
}

function blank(i: number): ClientDay {
  return {
    date: add(START, i),
    training: { sessions: [], load: 0 },
    recovery: { sleepHours: 7.5, hrvMs: 50, restingHr: 58, hrvVsBaseline: 1, rhrVsBaseline: 0, hrvLow: false },
    mobility: { minutes: 0, sessions: 0 },
    nutrition: { kcal: null, proteinG: null, carbsG: null, vsTarget: null, source: null },
    cycle: null,
    pain: [],
    check: null,
  };
}

/** n days; on every other day a session from `make(i)`. `edit` adjusts each day afterwards. */
function history(n: number, make: (i: number) => Partial<TimelineSession> | null, edit?: (d: ClientDay, i: number) => void): ClientDay[] {
  return Array.from({ length: n }, (_, i) => {
    const d = blank(i);
    const over = i % 2 === 0 ? make(i) : null;
    if (over) {
      const s = session(over);
      d.training = { sessions: [s], load: s.load };
    }
    edit?.(d, i);
    return d;
  });
}

const isShort = (i: number) => i % 10 === 0 || i % 10 === 4; // every 5th night, on session days

describe('compareMeans (the statistics rule)', () => {
  it('needs at least 6 per group', () => {
    expect(compareMeans([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6])).toBeNull();
    expect(compareMeans([1, 2, 3], [4, 5, 6], 3)).not.toBeNull();
  });
  it('uses the Welch standard error and |diff| ÷ SE for confidence', () => {
    const a = [10, 11, 9, 10, 11, 9];
    const b = [5, 6, 4, 5, 6, 4];
    const c = compareMeans(a, b)!;
    expect(c.diff).toBe(5);
    expect(c.se).toBeCloseTo(Math.sqrt(0.8 / 6 + 0.8 / 6), 6);
    expect(c.confidence).toBe('high');
  });
  it('medium between 1.5 and 2, nothing under 1.5', () => {
    const b = [0, 1, -1, 0, 1, -1];
    const se = Math.sqrt((0.8 / 6) * 2);
    expect(compareMeans(b.map((x) => x + 1.7 * se), b)!.confidence).toBe('medium');
    expect(compareMeans(b.map((x) => x + 1.2 * se), b)!.confidence).toBeNull();
  });
  it('handles no spread: equal → nothing, different → high', () => {
    expect(compareMeans([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1])!.confidence).toBeNull();
    expect(compareMeans([2, 2, 2, 2, 2, 2], [1, 1, 1, 1, 1, 1])!.confidence).toBe('high');
  });
});

describe('shortNight', () => {
  it('is under 6.5 h, or an hour under the 14 nights before (5+)', () => {
    const days = history(20, () => null, (d, i) => (d.recovery.sleepHours = i === 19 ? 7 : 8.5));
    expect(shortNight(days, 19)).toBe(true); // 1.5 h under usual
    days[19]!.recovery.sleepHours = 6.2;
    expect(shortNight(days, 19)).toBe(true);
    days[19]!.recovery.sleepHours = 8;
    expect(shortNight(days, 19)).toBe(false);
    days[19]!.recovery.sleepHours = null;
    expect(shortNight(days, 19)).toBeNull();
  });
});

describe('sleep_performance and sleep_rpe', () => {
  const noise = rng(7);
  const withEffect = history(
    112,
    (i) => ({ deltaPct: (isShort(i) ? -5 : 0) + noise() * 1.5, rpe: 7 + (isShort(i) ? 1 : 0) + noise() * 0.3 }),
    (d, i) => (d.recovery.sleepHours = isShort(i) ? 5.8 : 7.6),
  );

  it('finds lifts lower after short nights, with the numbers in the title', () => {
    const p = sleepPerformance(withEffect)!;
    expect(p.kind).toBe('sleep_performance');
    expect(p.title).toBe('Lifts tend to run 5% lower after short nights');
    expect(p.n.a).toBeGreaterThanOrEqual(6);
    expect(p.confidence).toBe('high');
    expect(p.effect.unit).toBe('%');
    expect(p.detail).toMatch(/sessions after short nights .* vs \d+ after normal nights/);
  });

  it('finds sessions feel harder after short nights', () => {
    const p = sleepRpe(withEffect)!;
    expect(p.title).toBe('Sessions feel 1 RPE harder after short nights');
  });

  it('stays quiet on noise', () => {
    const n2 = rng(11);
    const noisy = history(112, () => ({ deltaPct: n2() * 3, rpe: 7 + n2() }), (d, i) => (d.recovery.sleepHours = isShort(i) ? 5.8 : 7.6));
    expect(sleepPerformance(noisy)).toBeNull();
    expect(sleepRpe(noisy)).toBeNull();
  });

  it('stays quiet with too little data', () => {
    expect(sleepPerformance(withEffect.slice(0, 20))).toBeNull();
  });

  it('ignores tiny differences even when steady', () => {
    const tiny = history(112, (i) => ({ deltaPct: isShort(i) ? -0.5 : 0 }), (d, i) => (d.recovery.sleepHours = isShort(i) ? 5.8 : 7.6));
    expect(sleepPerformance(tiny)).toBeNull();
  });
});

describe('recovery_time', () => {
  /** Heavy session every 8 days (load 600), others 300; after heavy ones HRV is low for 1 day (back on day 2). */
  function hrvHistory(dipDays: number) {
    const days = history(112, (i) => ({ load: i % 8 === 0 ? 600 : 300 }));
    days.forEach((d, i) => {
      const lastHeavy = i - (i % 8);
      d.recovery.hrvLow = i > lastHeavy && i - lastHeavy <= dipDays;
    });
    return days;
  }

  it('finds HRV takes about 2 days after heavy sessions', () => {
    const p = recoveryTime(hrvHistory(1))!;
    expect(p.title).toBe('HRV takes about 2 days to recover after heavy sessions');
    expect(p.detail).toMatch(/heavy sessions \(top quarter of load\) vs \d+ others: back to usual in 2 days vs 1 day/);
    expect(p.suggestion).toMatch(/2 days between heavy sessions/);
  });

  it('nothing when heavy sessions recover like the rest', () => {
    expect(recoveryTime(hrvHistory(0))).toBeNull();
  });

  it('nothing without HRV', () => {
    const days = hrvHistory(1);
    days.forEach((d) => (d.recovery.hrvLow = null));
    expect(recoveryTime(days)).toBeNull();
  });
});

describe('fuel_performance', () => {
  it('finds lifts higher on well-fuelled days', () => {
    const noise = rng(3);
    const fed = (i: number) => i % 6 !== 0;
    const days = history(112, (i) => ({ deltaPct: (fed(i) ? 1.5 : -1.5) + noise() }), (d, i) => (d.nutrition.vsTarget = fed(i) ? 1 : 0.7));
    const p = fuelPerformance(days)!;
    expect(p.title).toBe('Lifts tend to run 3% higher on well-fuelled days');
  });
  it('counts carbs at target as fuelled', () => {
    const days = history(112, (i) => ({ deltaPct: i % 6 ? 2 : -2 }), (d, i) => {
      d.nutrition.vsTarget = 0.8;
      d.nutrition.carbsVsTarget = i % 6 ? 1 : 0.5;
    });
    expect(fuelPerformance(days)?.effect.value).toBe(4);
  });
  it('nothing without food logs', () => {
    expect(fuelPerformance(history(112, () => ({ deltaPct: 1 })))).toBeNull();
  });
});

describe('time_of_day', () => {
  it('compares morning and evening sessions', () => {
    const noise = rng(5);
    const days = history(112, (i) => ({ hour: i % 4 === 0 ? 7 : 18, deltaPct: (i % 4 === 0 ? 2 : -2) + noise() }));
    expect(timeOfDay(days)!.title).toBe('Lifts tend to run 4% higher in morning sessions');
  });
  it('needs 6 of each', () => {
    const days = history(112, (i) => ({ hour: i < 10 ? 18 : 7, deltaPct: i < 10 ? -3 : 3 }));
    expect(timeOfDay(days)).toBeNull();
  });
});

describe('mobility_soreness', () => {
  function mob(effect: number) {
    return history(112, () => null, (d, i) => {
      const week = Math.floor(i / 7);
      const more = week % 2 === 0;
      if (more && (i % 7 === 1 || i % 7 === 4)) d.mobility = { minutes: 15, sessions: 1 };
      d.check = { energy: 4, soreness: Math.round(2 + (more ? 0 : effect) + (i % 3 === 0 ? 1 : 0)), stress: 2 };
    });
  }
  it('finds less soreness in weeks with 2+ mobility sessions', () => {
    const p = mobilitySoreness(mob(1))!;
    expect(p.title).toMatch(/^Less sore in weeks with 2\+ mobility sessions \(\d\.?\d? vs \d\.?\d? of 5\)$/);
    expect(p.n).toEqual({ a: 8, b: 8 });
  });
  it('nothing when soreness is the same', () => {
    expect(mobilitySoreness(mob(0))).toBeNull();
  });
});

describe('volume_response', () => {
  /** 16 weeks: weekly sets change in 2-week blocks; strength rises 1%/week after 12-set weeks, barely otherwise. */
  function vol(weeks = 16) {
    const blocks = [8, 12, 18, 12, 8, 18, 12, 8];
    let e = 100;
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = blank(i);
      const w = Math.floor(i / 7);
      const sets = blocks[Math.floor(w / 2)] ?? 12;
      if (i % 7 === 1 || i % 7 === 4) {
        const s = session({ hardSets: sets / 2, groupSets: { legs: sets / 2 }, bests: { 'back-squat': Math.round(e * 10) / 10 } });
        d.training = { sessions: [s], load: s.load };
      }
      // The week's training shows up from the next week.
      if (i % 7 === 6) e *= sets === 12 ? 1.01 : sets === 18 ? 0.999 : 1.002;
      return d;
    });
  }
  it('reports the best range and where progress stalls (medium at most)', () => {
    const p = volumeResponse(vol())!;
    expect(p.title).toBe('Leg lifts progress best at 12 hard sets a week');
    expect(p.detail).toMatch(/progress stalls/);
    expect(p.confidence).toBe('medium');
  });
  it('needs 12 weeks', () => {
    expect(volumeResponse(vol(11))).toBeNull();
  });
});

describe('cycle_phase', () => {
  const calibration: Calibration = {
    method: 'personal-baseline-v1',
    ready: true,
    cyclesObserved: 5,
    summary: '',
    adjustments: [
      { phase: 'menstrual', deltaPct: 1, appliedPct: 0, sessions: 10, cycles: 5, confidence: 'high' },
      { phase: 'follicular', deltaPct: 0.5, appliedPct: 0, sessions: 12, cycles: 5, confidence: 'high' },
      { phase: 'ovulation', deltaPct: 0, appliedPct: 0, sessions: 4, cycles: 3, confidence: 'low' },
      { phase: 'luteal', deltaPct: -3.1, appliedPct: -3, sessions: 20, cycles: 5, confidence: 'high' },
    ],
  };
  it('wraps the calibration result, phase the app acts on first', () => {
    const p = cyclePhasePattern(calibration)!;
    expect(p.title).toBe('Lifts tend to run 3% lower in the luteal phase');
    expect(p.n).toEqual({ a: 20, b: 5 });
    expect(p.domains).toContain('cycle');
  });
  it('nothing when not ready or not shared', () => {
    expect(cyclePhasePattern({ ...calibration, ready: false })).toBeNull();
    expect(cyclePhasePattern(null)).toBeNull();
  });
});

describe('findPatterns', () => {
  it('returns nothing on a noisy history', () => {
    const n = rng(42);
    const days = history(112, () => ({ deltaPct: n() * 3, rpe: 7 + n(), hour: n() > 0 ? 7 : 18, load: 300 + Math.round(n() * 100) }), (d) => {
      d.recovery.sleepHours = 7 + n();
      d.recovery.hrvLow = n() > 0.7;
      d.nutrition.vsTarget = 0.9 + n() * 0.2;
      d.check = { energy: 4, soreness: Math.round(2.5 + n()), stress: 2 };
      if (n() > 0.6) d.mobility = { minutes: 10, sessions: 1 };
    });
    expect(findPatterns(days)).toEqual([]);
  });
  it('sorts by confidence then effect size', () => {
    const patterns = demoClientPatterns(DEMO_JORDAN_ID, new Date(2026, 9, 23, 12), { includeCycle: true });
    const rank = { high: 2, medium: 1, low: 0 } as const;
    for (let i = 1; i < patterns.length; i++) {
      expect(rank[patterns[i - 1]!.confidence]).toBeGreaterThanOrEqual(rank[patterns[i]!.confidence]);
    }
  });
  it('needs one row per day', () => {
    const days = history(30, () => null);
    expect(() => findPatterns([days[0]!, days[2]!])).toThrow(/one ClientDay per day/);
  });
  it('turns a pattern into a playbook entry', () => {
    const p = cyclePhasePattern({
      method: 'm',
      ready: true,
      cyclesObserved: 4,
      summary: '',
      adjustments: [{ phase: 'luteal', deltaPct: -3, appliedPct: -3, sessions: 12, cycles: 4, confidence: 'medium' }],
    })!;
    expect(pinPattern(p, 'x', '2026-10-23T10:00:00Z')).toEqual({ id: 'x', patternId: 'cycle_phase:luteal', text: p.suggestion, pinnedAt: '2026-10-23T10:00:00Z', source: 'pattern' });
  });
});

describe('MOCK demo histories', () => {
  const now = new Date(2026, 9, 23, 12);
  it('Jordan: 16 weeks, and 3–5 believable patterns (cycle only when shared)', () => {
    const days = demoClientDays(DEMO_JORDAN_ID, now);
    expect(days).toHaveLength(112);
    expect(days.every((d) => d.cycle === null)).toBe(true);
    const shared = demoClientPatterns(DEMO_JORDAN_ID, now, { includeCycle: true }).map((p) => p.kind);
    expect(shared).toEqual(expect.arrayContaining(['recovery_time', 'sleep_performance', 'volume_response', 'mobility_soreness', 'cycle_phase']));
    expect(shared.length).toBeLessThanOrEqual(5);
    const priv = demoClientPatterns(DEMO_JORDAN_ID, now).map((p) => p.kind);
    expect(priv).not.toContain('cycle_phase');
    expect(priv.length).toBeGreaterThanOrEqual(3);
  });
  it('is deterministic and works on other dates', () => {
    const a = demoClientPatterns(DEMO_JORDAN_ID, now).map((p) => p.title);
    expect(demoClientPatterns(DEMO_JORDAN_ID, now).map((p) => p.title)).toEqual(a);
    for (const d of [new Date(2026, 2, 5, 12), new Date(2027, 0, 15, 12)]) {
      expect(demoClientPatterns(DEMO_JORDAN_ID, d).length).toBeGreaterThanOrEqual(3);
    }
  });
  it('Mei has a timeline; other clients have none', () => {
    expect(demoClientDays(DEMO_MEI_ID, now)).toHaveLength(112);
    expect(demoClientDays('nobody', now)).toEqual([]);
  });
});
