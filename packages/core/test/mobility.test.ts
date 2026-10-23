import { describe, expect, it } from 'vitest';
import { MOBILITY_ACTIVITIES, STARTER_MOBILITY_ROUTINES, mergeMobility, mobilityFromImported, mobilityWeek, routineMinutes, type MobilitySession } from '../src/mobility';
import { DATA_SOURCES, EMPTY_BATCH, SOURCE_ADAPTERS, appleHealthAdapter } from '../src/sources';
import { ACTIVITY_REGIONS } from '../src/injury';
import { IMPORTED_ACTIVITIES, IMPORTED_ACTIVITY_LABEL, type ImportedWorkout, type WearableDay } from '../src/physiology';
import { Mutation } from '../src/schemas';

const w = (activity: ImportedWorkout['activity'], over: Partial<ImportedWorkout> = {}): ImportedWorkout => ({
  id: `hk-${activity}`,
  date: '2026-10-20',
  startedAt: '2026-10-20T19:00:00Z',
  durationMin: 29.6,
  activity,
  activeKcal: null,
  distanceM: null,
  avgHr: null,
  maxHr: null,
  source: 'apple_health',
  sourceApp: 'Apple Watch',
  ...over,
});

describe('mobility', () => {
  it('imported activities: yoga, pilates, flexibility and mind-and-body are mobility, appended to the list', () => {
    expect(IMPORTED_ACTIVITIES.slice(-2)).toEqual(['flexibility', 'mind_and_body']);
    expect(IMPORTED_ACTIVITY_LABEL.flexibility).toBe('Stretching');
    expect(ACTIVITY_REGIONS.mind_and_body).toEqual([]);
    expect(Object.keys(MOBILITY_ACTIVITIES).sort()).toEqual(['flexibility', 'mind_and_body', 'pilates', 'yoga']);
    expect(mobilityFromImported(w('flexibility'))).toEqual({ id: 'imported:hk-flexibility', date: '2026-10-20', minutes: 30, kind: 'stretching', source: 'imported', routineId: null });
    expect(mobilityFromImported(w('run'))).toBeNull();
  });

  it('a Spotter log and an imported session of the same kind on the same day count once', () => {
    const logged: MobilitySession[] = [{ id: 'm', date: '2026-10-20', minutes: 25, kind: 'yoga', source: 'spotter', routineId: null }];
    const merged = mergeMobility(logged, [w('yoga'), w('pilates', { id: 'p' }), w('run')]);
    expect(merged.map((m) => `${m.kind}:${m.source}`)).toEqual(['yoga:spotter', 'pilates:imported']);
  });

  it('weekly totals over the 7 days ending today', () => {
    const s = (date: string, minutes: number): MobilitySession => ({ id: date, date, minutes, kind: 'routine', source: 'spotter', routineId: null });
    expect(mobilityWeek([s('2026-10-14', 10), s('2026-10-17', 10), s('2026-10-23', 15), s('2026-10-24', 5)], '2026-10-23')).toEqual({ sessions: 2, minutes: 25 });
  });

  it('ships three MOCK starter routines with minutes', () => {
    expect(STARTER_MOBILITY_ROUTINES).toHaveLength(3);
    for (const r of STARTER_MOBILITY_ROUTINES) {
      expect(r.title).toMatch(/\(MOCK\)$/);
      expect(routineMinutes(r)).toBeGreaterThan(0);
    }
  });

  it('mobility.log and mobility.delete are sync mutations', () => {
    const base = { clientMutationId: '01900000-0000-7000-8000-000000008701', createdAt: '2026-10-23T08:00:00Z' };
    const ok = Mutation.safeParse({
      ...base,
      kind: 'mobility.log',
      payload: { mobilityId: '01900000-0000-7000-8000-0000000087a1', date: '2026-10-23', minutes: 15, kind: 'stretching', routineId: null, loggedAt: '2026-10-23T08:00:00Z' },
    });
    expect(ok.success).toBe(true);
    expect(Mutation.safeParse({ ...base, kind: 'mobility.log', payload: { mobilityId: 'x', date: '2026-10-23', minutes: 0, kind: 'nap', routineId: null, loggedAt: 'x' } }).success).toBe(false);
    expect(Mutation.safeParse({ ...base, kind: 'mobility.delete', payload: { mobilityId: '01900000-0000-7000-8000-0000000087a1', deletedAt: '2026-10-23T08:00:00Z' } }).success).toBe(true);
    expect(Mutation.safeParse({ ...base, kind: 'workout.import', payload: { workouts: [{ externalId: 'a', date: '2026-10-23', startedAt: '2026-10-23T08:00:00Z', durationMin: 20, activity: 'mind_and_body', activeKcal: null, distanceM: null, avgHr: null, maxHr: null, source: 'apple_health', sourceApp: null, shareWithCoach: true }] } }).success).toBe(true);
  });
});

describe('sources', () => {
  it('lists the two live phone stores and documents planned vendor APIs', () => {
    expect(DATA_SOURCES.filter((s) => s.status === 'live' && s.via === 'os_aggregator').map((s) => s.id)).toEqual(['apple_health', 'health_connect', 'manual']);
    expect(DATA_SOURCES.filter((s) => s.via === 'vendor_api').every((s) => s.status === 'planned')).toBe(true);
  });

  it('the OS adapters keep only their own rows, so HRV methods never mix', () => {
    const day = (source: WearableDay['source']): WearableDay => ({ date: '2026-10-20', sleepHours: 7, hrvMs: 40, restingHr: 58, activeKcal: null, source });
    const out = appleHealthAdapter.normalize({ days: [day('apple_health'), day('health_connect')], workouts: [w('run'), w('run', { source: 'health_connect', id: 'hc' })], nutrition: [], periods: [] });
    expect(out.wearableDays.map((d) => d.source)).toEqual(['apple_health']);
    expect(out.workouts.map((x) => x.id)).toEqual(['hk-run']);
    expect(SOURCE_ADAPTERS.health_connect!.normalize({ days: [], workouts: [], nutrition: [], periods: [] })).toEqual(EMPTY_BATCH);
  });

  it('vendor APIs are stubs that refuse to run', () => {
    expect(() => SOURCE_ADAPTERS.garmin!.normalize({})).toThrow(/not built yet/);
  });
});
