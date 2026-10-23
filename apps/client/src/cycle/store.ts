import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  activeCalibrator,
  appliedPctFor,
  estimateCycle,
  mergePeriods,
  phaseOnFor,
  uuidv7,
  type Calibration,
  type CalibrationSession,
  type CycleMode,
  type CycleProfile,
  type PeriodLog,
  type Symptom,
  type SymptomLog,
} from '@spotter/core';
import { DEMO_CLIENT, coachClientIdFor, cycleKey, demoCycleProfile, demoCycleSessions, type SharedCycle, type SharedCycleDoc } from '@spotter/core/demo';
import { readShared, writeShared } from '@spotter/ui';
import { kv } from '../storage';
import { syncQueue } from '../sync';
import { IS_DEMO, tenant } from '../env';
import { localDate } from '../nutrition/store';
import { useApp, type CompletedSession } from '../store';

/**
 * Cycle tracking (docs/features/cycle.md). Private by default: everything here stays on the phone and in
 * the client's own rows. The coach only gets today's phase and the calibration summary, and only when the
 * client turns sharing on. Offline first: changes are queued as cycle.* mutations.
 */

export type StoredPeriod = PeriodLog & { id: string };

interface CycleState {
  hydrated: boolean;
  mode: CycleMode;
  birthYear: number | null;
  shareWithCoach: boolean;
  periods: StoredPeriod[];
  symptoms: SymptomLog[];
  /** Session the client switched back to planned loads in ("Use planned loads instead"). */
  plannedLoadsFor: string | null;
  /** Last date the coach-visible projection was refreshed. */
  publishedOn: string | null;
  setMode(mode: CycleMode): Promise<void>;
  setShare(on: boolean): Promise<void>;
  savePeriod(p: { id?: string; start: string; end: string | null }): Promise<void>;
  deletePeriod(id: string): Promise<void>;
  /** Adds periods read from the health app that aren't already logged. Returns how many were added. */
  importPeriods(imported: { start: string; end: string | null }[]): Promise<number>;
  logSymptom(symptom: Symptom, level: number): Promise<void>;
  choosePlannedLoads(sessionId: string | null): void;
  /** Re-sends today's phase and calibration summary (the server copy goes stale as days pass). */
  refreshToday(): Promise<void>;
  reset(): void;
}

/** MOCK: demo builds start with Jordan's sample cycle (natural, private). */
function seed() {
  if (!IS_DEMO) return { mode: 'not_tracking' as CycleMode, birthYear: null, shareWithCoach: false, periods: [] as StoredPeriod[] };
  const p = demoCycleProfile();
  return { mode: p.mode, birthYear: p.birthYear, shareWithCoach: p.shareWithCoach, periods: p.periods.map((x) => ({ ...x, id: uuidv7() })) };
}

/** Lifts for calibration: the client's finished sessions, plus (demo only) six months of MOCK history. */
export function calibrationSessions(completed: CompletedSession[]): CalibrationSession[] {
  const own = completed.map((s) => ({
    date: s.date,
    feel: s.feel || null,
    sets: s.sets
      .filter((x) => x.weightKg != null && x.reps != null)
      .map((x) => ({ exerciseId: x.exerciseId, weightKg: x.weightKg!, reps: x.reps!, rpe: x.rpe })),
  }));
  return IS_DEMO ? [...demoCycleSessions(), ...own] : own;
}

export function profileOf(s: Pick<CycleState, 'mode' | 'birthYear' | 'shareWithCoach' | 'periods'>): CycleProfile {
  return { mode: s.mode, birthYear: s.birthYear, shareWithCoach: s.shareWithCoach, periods: s.periods.map(({ start, end, source }) => ({ start, end, source })) };
}

export function calibrate(profile: CycleProfile, completed: CompletedSession[], today: string): Calibration {
  return activeCalibrator().calibrate({ today, sessions: calibrationSessions(completed), phaseOn: phaseOnFor(profile) });
}

/** What the coach may see. Nothing but the fact of not sharing when sharing is off. */
export function sharedProjection(profile: CycleProfile, calibration: Calibration, today: string): SharedCycle {
  const e = estimateCycle(profile, today);
  const shared = profile.shareWithCoach && profile.mode !== 'not_tracking';
  return {
    shared,
    date: today,
    phase: shared ? e.phase : null,
    calibration: shared
      ? { method: calibration.method, ready: calibration.ready, summary: calibration.summary, appliedPctToday: appliedPctFor(calibration, e.phase) }
      : null,
    updatedAt: new Date().toISOString(),
  };
}

export const useCycle = create<CycleState>()(
  persist(
    (set, get) => {
      /** Queue the profile with today's phase and calibration summary; in the demo, publish the projection. */
      const publish = async () => {
        const today = localDate();
        const profile = profileOf(get());
        const calibration = calibrate(profile, useApp.getState().completed, today);
        const projection = sharedProjection(profile, calibration, today);
        const e = estimateCycle(profile, today);
        await syncQueue.enqueue('cycle.profile.set', {
          mode: profile.mode,
          birthYear: profile.birthYear,
          shareWithCoach: profile.shareWithCoach,
          todayPhase: e.phase,
          todayPhaseOn: e.phase ? today : null,
          calibrationSummary: { method: calibration.method, ready: calibration.ready, summary: calibration.summary.slice(0, 600), appliedPctToday: appliedPctFor(calibration, e.phase) },
          updatedAt: new Date().toISOString(),
        });
        void syncQueue.flush();
        set({ publishedOn: today });
        if (IS_DEMO) {
          // MOCK transport: only the shared projection is written, never periods, symptoms or the mode.
          const doc = await readShared<SharedCycleDoc>(cycleKey(tenant.slug), {});
          await writeShared(cycleKey(tenant.slug), { ...doc, [coachClientIdFor(DEMO_CLIENT.id)]: projection });
        }
      };

      return {
        hydrated: false,
        ...seed(),
        symptoms: [],
        plannedLoadsFor: null,
        publishedOn: null,

        async setMode(mode) {
          set({ mode });
          await publish();
        },

        async setShare(on) {
          set({ shareWithCoach: on });
          await publish();
        },

        async savePeriod({ id, start, end }) {
          const existing = id ? get().periods.find((p) => p.id === id) : undefined;
          const period: StoredPeriod = { id: id ?? uuidv7(), start, end, source: existing?.source ?? 'manual' };
          set({ periods: [...get().periods.filter((p) => p.id !== period.id), period].sort((a, b) => a.start.localeCompare(b.start)) });
          await syncQueue.enqueue('cycle.period.upsert', { periodId: period.id, start, end, source: period.source ?? 'manual', updatedAt: new Date().toISOString() });
          await publish();
        },

        async deletePeriod(id) {
          set({ periods: get().periods.filter((p) => p.id !== id) });
          await syncQueue.enqueue('cycle.period.delete', { periodId: id, deletedAt: new Date().toISOString() });
          await publish();
        },

        async importPeriods(imported) {
          const merged = mergePeriods(get().periods, imported);
          const added: StoredPeriod[] = merged.filter((p): p is PeriodLog => !('id' in p)).map((p) => ({ ...p, id: uuidv7() }));
          if (!added.length) return 0;
          set({ periods: [...get().periods, ...added].sort((a, b) => a.start.localeCompare(b.start)) });
          for (const p of added) {
            await syncQueue.enqueue('cycle.period.upsert', { periodId: p.id, start: p.start, end: p.end, source: 'health', updatedAt: new Date().toISOString() });
          }
          await publish();
          return added.length;
        },

        async logSymptom(symptom, level) {
          const date = localDate();
          const prev = get().symptoms.find((s) => s.date === date);
          const entry: SymptomLog = { date, scores: { ...(prev?.scores ?? {}), [symptom]: level } };
          set({ symptoms: [...get().symptoms.filter((s) => s.date !== date), entry].slice(-120) });
          await syncQueue.enqueue('cycle.symptoms.log', { date, scores: entry.scores, loggedAt: new Date().toISOString() });
          void syncQueue.flush();
        },

        choosePlannedLoads: (sessionId) => set({ plannedLoadsFor: sessionId }),

        refreshToday: () => publish(),

        reset: () => set({ ...seed(), symptoms: [], plannedLoadsFor: null, publishedOn: null }),
      };
    },
    {
      name: `spotter.cycleprofile.${tenant.slug}`, // not spotter.cycle.*: that key is the coach-visible shared doc
      storage: createJSONStorage(() => kv),
      partialize: ({ mode, birthYear, shareWithCoach, periods, symptoms, plannedLoadsFor, publishedOn }) => ({
        mode,
        birthYear,
        shareWithCoach,
        periods,
        symptoms,
        plannedLoadsFor,
        publishedOn,
      }),
      onRehydrateStorage: () => () => useCycle.setState({ hydrated: true }),
    },
  ),
);
