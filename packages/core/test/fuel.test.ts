import { describe, expect, it } from 'vitest';
import {
  FUEL_NO_FFM_NOTE,
  FUEL_SPARSE_NOTE,
  eaBand,
  energyAvailability,
  estimatedFfm,
  exerciseForDay,
  exerciseKcalEstimate,
  fatFreeMassKg,
  ffmFor,
  fuelFactorFromPattern,
  fuelPattern,
  intakeForDay,
  trainingDayTargetKcal,
  type FuelPatternInput,
} from '../src/fuel';
import type { CycleEstimate, EnergyDay, PainLog } from '../src/physiology';
import { Mutation } from '../src/schemas';
import { reasonText } from '../src/triage';
import { demoFuelCheck } from '../src/demo/fuel';

const TODAY = '2026-10-23';
const iso = (offset: number) => {
  const d = new Date(Date.UTC(2026, 9, 23 + offset));
  return d.toISOString().slice(0, 10);
};
/** n logged days before today, each with this intake and exercise. */
const days = (n: number, intakeKcal: number | null, exerciseKcal = 0): EnergyDay[] =>
  Array.from({ length: n }, (_, i) => ({ date: iso(-(i + 1)), intakeKcal, exerciseKcal, exerciseSource: exerciseKcal ? 'estimate' : null }));

const base = (over: Partial<FuelPatternInput> = {}): FuelPatternInput => ({
  today: TODAY,
  days: [],
  ffmKg: 45,
  cycle: null,
  painLogs: [],
  e1rmTrendPct: null,
  checks: [],
  bodyweights: [],
  ...over,
});
const cycle = (over: Partial<CycleEstimate>): CycleEstimate => ({
  date: TODAY,
  mode: 'natural',
  phase: 'luteal',
  dayOfCycle: 20,
  typicalLength: 28,
  confidence: 'medium',
  nextPeriod: null,
  note: '',
  irregularities: [],
  ...over,
});
const pain = (offset: number, region: PainLog['region']): PainLog => ({ id: `${region}${offset}`, date: iso(offset), region, side: null, level: 3, note: null });

describe('fat-free mass', () => {
  it('is null when body fat is unknown (never guessed silently)', () => {
    expect(fatFreeMassKg(62, null)).toBeNull();
    expect(ffmFor(62, null, false)).toBeNull();
  });
  it('uses body fat when entered', () => {
    expect(fatFreeMassKg(60, 25)).toBe(45);
    expect(ffmFor(60, 25, true)).toMatchObject({ kg: 45, estimated: false });
  });
  it('offers a labelled estimate only on opt-in', () => {
    expect(estimatedFfm(62)).toMatchObject({ kg: 43.4, estimated: true });
    expect(ffmFor(62, null, true)?.note).toMatch(/assumes 30% body fat/);
  });
});

describe('exercise energy', () => {
  it('estimates strength training from METs, harder from feel', () => {
    expect(exerciseKcalEstimate({ durationMin: 60, feel: 4 }, 60)).toMatchObject({ kcal: 240, source: 'estimate' });
    expect(exerciseKcalEstimate({ durationMin: 60, feel: 1 }, 60).kcal).toBe(300);
  });
  it('prefers the wearable when there is one', () => {
    expect(exerciseForDay([{ durationMin: 60, feel: 3 }], 60, 410)).toEqual({ exerciseKcal: 410, exerciseSource: 'wearable' });
    expect(exerciseForDay([], 60, null)).toEqual({ exerciseKcal: 0, exerciseSource: null });
  });
});

describe('intakeForDay', () => {
  const spotter = { kcal: 1200, proteinG: 80, carbsG: 120, fatG: 40 };
  const health = { date: TODAY, kcal: 1900, proteinG: 110, carbsG: 200, fatG: 60, sources: ['MyMacros'] };
  it('auto prefers the health store', () => {
    expect(intakeForDay(spotter, health, 'auto')).toEqual({ kcal: 1900, source: 'health', label: 'From MyMacros via Apple Health' });
  });
  it('auto falls back to Spotter when the health store has nothing', () => {
    expect(intakeForDay(spotter, null, 'auto')).toEqual({ kcal: 1200, source: 'spotter', label: 'Logged in Spotter' });
    expect(intakeForDay(spotter, { ...health, kcal: 0 }, 'auto').source).toBe('spotter');
  });
  it('never sums the two', () => {
    for (const pref of ['auto', 'health', 'spotter'] as const) {
      expect(intakeForDay(spotter, health, pref).kcal).not.toBe(3100);
    }
    expect(intakeForDay(spotter, health, 'spotter').kcal).toBe(1200);
    expect(intakeForDay(null, null, 'auto')).toEqual({ kcal: null, source: null, label: null });
    expect(intakeForDay(spotter, null, 'health').kcal).toBeNull();
  });
});

describe('energy availability', () => {
  it('is (intake − exercise) ÷ FFM, and null when nothing was logged', () => {
    expect(energyAvailability({ date: TODAY, intakeKcal: 2000, exerciseKcal: 200, exerciseSource: 'estimate' }, 45)).toBe(40);
    expect(energyAvailability({ date: TODAY, intakeKcal: null, exerciseKcal: 200, exerciseSource: 'estimate' }, 45)).toBeNull();
    expect(energyAvailability({ date: TODAY, intakeKcal: 2000, exerciseKcal: 0, exerciseSource: null }, null)).toBeNull();
  });
  it('bands at 45 and 30', () => {
    expect(eaBand(45)).toBe('adequate');
    expect(eaBand(44.9)).toBe('reduced');
    expect(eaBand(30)).toBe('reduced');
    expect(eaBand(29.9)).toBe('low');
    expect(eaBand(null)).toBe('unknown');
  });
});

describe('fuelPattern', () => {
  it('says unknown with sparse logs', () => {
    const p = fuelPattern(base({ days: days(4, 1000) }));
    expect(p.eaBand).toBe('unknown');
    expect(p.eaAverage).toBeNull();
    expect(p.note).toBe(FUEL_SPARSE_NOTE);
    expect(p.level).toBe('none');
  });
  it('handles missing FFM without guessing', () => {
    const p = fuelPattern(base({ ffmKg: null, days: days(10, 1000) }));
    expect(p.eaBand).toBe('unknown');
    expect(p.note).toBe(FUEL_NO_FFM_NOTE);
    expect(p.signs).toEqual([]);
    expect(p.level).toBe('none');
  });
  it('adequate fuelling flags nothing', () => {
    const p = fuelPattern(base({ days: days(10, 2400, 200) }));
    expect(p.eaBand).toBe('adequate');
    expect(p.level).toBe('none');
    expect(p.fixes).toEqual([]);
  });
  it('low EA alone is "watch", with concrete fixes', () => {
    const p = fuelPattern(base({ days: days(8, 1400, 200) })); // (1400−200)/45 = 26.7
    expect(p.eaBand).toBe('low');
    expect(p.signs.map((s) => s.kind)).toEqual(['low_ea']);
    expect(p.level).toBe('watch');
    expect(p.fixes.join(' ')).toMatch(/carbs and protein within an hour/);
    expect(p.fixes.join(' ')).not.toMatch(/doctor/);
  });
  it('low EA with a repeat injury is talk_to_someone, and points to a doctor or sports dietitian', () => {
    const p = fuelPattern(base({ days: days(8, 1400, 200), painLogs: [pain(-1, 'knee'), pain(-3, 'knee'), pain(-5, 'knee')] }));
    expect(p.signs.map((s) => s.kind)).toEqual(['low_ea', 'injury_repeat']);
    expect(p.level).toBe('talk_to_someone');
    expect(p.fixes[p.fixes.length - 1]).toMatch(/doctor or sports dietitian/);
  });
  it('a repeat injury without low EA is not talk_to_someone', () => {
    const p = fuelPattern(base({ days: days(8, 2400), painLogs: [pain(-1, 'knee'), pain(-3, 'knee'), pain(-5, 'knee')] }));
    expect(p.level).toBe('none');
  });
  it('reduced EA with 2+ other signs is "watch"', () => {
    const checks = Array.from({ length: 6 }, (_, i) => ({ date: iso(-i), energy: 2 }));
    const p = fuelPattern(base({ days: days(8, 1800), e1rmTrendPct: -6, checks })); // 40
    expect(p.eaBand).toBe('reduced');
    expect(p.signs.map((s) => s.kind)).toEqual(['performance_drop', 'energy_mood_low']);
    expect(p.level).toBe('watch');
  });
  it('no period for 90+ days triggers talk_to_someone on its own', () => {
    const p = fuelPattern(base({ days: days(2, 2400), cycle: cycle({ dayOfCycle: 95, phase: null, irregularities: ['No period for 95 days'] }) }));
    expect(p.eaBand).toBe('unknown');
    expect(p.level).toBe('talk_to_someone');
    expect(p.signs[0]!.kind).toBe('cycle_change');
  });
  it('ignores cycle changes in hormonal or post-menopause modes', () => {
    const p = fuelPattern(base({ days: days(8, 1400, 200), cycle: cycle({ mode: 'postmenopause', dayOfCycle: 400, irregularities: ['No period for 400 days'] }) }));
    expect(p.signs.map((s) => s.kind)).toEqual(['low_ea']);
    expect(p.level).toBe('watch');
  });
  it('counts weight_drop only while EA is low', () => {
    const bodyweights = [
      { date: iso(-28), kg: 62 },
      { date: iso(-1), kg: 60.2 },
    ];
    const low = fuelPattern(base({ days: days(8, 1400, 200), bodyweights }));
    expect(low.signs.map((s) => s.kind)).toContain('weight_drop');
    expect(low.level).toBe('talk_to_someone');
    const fine = fuelPattern(base({ days: days(8, 2400), bodyweights }));
    expect(fine.signs.map((s) => s.kind)).not.toContain('weight_drop');
  });
  it('adds a gentle luteal line only when under-fuelled', () => {
    const under = fuelPattern(base({ days: days(8, 1400, 200), cycle: cycle({ phase: 'luteal' }) }));
    expect(under.fixes.join(' ')).toMatch(/appetite runs higher/);
    const fine = fuelPattern(base({ days: days(8, 2400), cycle: cycle({ phase: 'luteal' }) }));
    expect(fine.fixes).toEqual([]);
  });
  it('never uses weight-loss or moralising words', () => {
    const p = fuelPattern(base({ days: days(8, 1400, 200), painLogs: [pain(-1, 'knee'), pain(-2, 'hip')], cycle: cycle({ phase: 'luteal' }) }));
    const text = [...p.fixes, ...p.signs.map((s) => s.text)].join(' ');
    expect(text).not.toMatch(/lose weight|weight loss|cheat|junk|guilt|bad food|clean eating/i);
  });
});

describe('training days and the read', () => {
  it('raises the target by the session energy, rounded to 50', () => {
    expect(trainingDayTargetKcal(2200, 248)).toBe(2450);
    expect(trainingDayTargetKcal(2200, null)).toBe(2200);
  });
  it('turns a pattern into a read factor', () => {
    expect(fuelFactorFromPattern({ level: 'none', signs: [] })).toBeNull();
    expect(fuelFactorFromPattern({ level: 'talk_to_someone', signs: [] })).toMatchObject({ kind: 'fuel_low', strain: true });
  });
});

describe('demo fuel data', () => {
  it('reads "reduced" and "watch" with signs that make sense', () => {
    const p = demoFuelCheck(new Date(2026, 9, 23, 9, 0, 0));
    expect(p.loggedDays).toBe(12);
    expect(p.eaBand).toBe('reduced');
    expect(p.level).toBe('watch');
    expect(p.signs.map((s) => s.kind)).toEqual(['injury_repeat', 'performance_drop']);
  });
});

describe('fuel mutations and triage', () => {
  const m = { clientMutationId: '0192f0a5-0000-7000-8000-000000000099', createdAt: '2026-10-23T07:00:00Z' };
  it('accepts settings and a shared level', () => {
    expect(Mutation.safeParse({ ...m, kind: 'fuel.settings.set', payload: { bodyFatPct: null, useEstimate: true, intakeSource: 'auto', shareWithCoach: false, updatedAt: '2026-10-23T07:00:00Z' } }).success).toBe(true);
    expect(Mutation.safeParse({ ...m, kind: 'fuel.pattern.share', payload: { date: TODAY, level: 'talk_to_someone', signs: ['x'], sharedAt: '2026-10-23T07:00:00Z' } }).success).toBe(true);
    expect(Mutation.safeParse({ ...m, kind: 'fuel.pattern.share', payload: { date: TODAY, level: 'red', signs: [], sharedAt: '2026-10-23T07:00:00Z' } }).success).toBe(false);
  });
  it('has coach copy for the triage reason', () => {
    expect(reasonText({ id: '1', clientId: 'c', reason: 'fuel_pattern', since: '2026-10-23T07:00:00Z', snoozedUntil: null, handledAt: null })).toBe(
      'Fuel check flagged: worth a conversation',
    );
  });
});
