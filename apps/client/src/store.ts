import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  evaluateProgression,
  setKey,
  uuidv7,
  type ExerciseSessionResult,
  type LoggedSet,
  type ProgramExercise,
  type ProgressionSuggestion,
  type SessionPlan,
} from '@spotter/core';
import { DEMO_HISTORY, LOWER_A, isoDay, type PastSession } from '@spotter/core/demo';
import { lookupDay, planFor } from './programs';
import { kv, clearLocalData } from './storage';
import { syncQueue } from './sync';
import { APP_VERSION } from './env';

export interface ActiveSession {
  sessionId: string;
  plan: SessionPlan;
  startedAt: string;
  sets: LoggedSet[];
  restEndsAt: number | null;
  restNotificationId: string | null;
  /** programExerciseId → coach-approved alternative chosen for this session */
  swaps: Record<string, { exerciseId: string; name: string }>;
  /** programExerciseId → client chose "Keep current load" over the suggestion */
  keptLoad: Record<string, boolean>;
}

/** `plan` is what was prescribed that day, kept so History can show targets after the program changes. */
export type CompletedSession = PastSession & { note: string | null; plan?: SessionPlan };

export interface ChatMessage {
  id: string;
  from: 'client' | 'coach';
  body: string;
  sentAt: string;
  mutationId: string | null;
}

export type TodayMode = 'session' | 'rest' | 'none';

interface AppState {
  hydrated: boolean;
  intake: { answers: Record<string, unknown>; parqFlag: boolean } | null;
  waiver: { signedName: string; signedAt: string } | null;
  notificationsAsked: boolean;
  active: ActiveSession | null;
  completed: CompletedSession[];
  messages: ChatMessage[];
  demo: { todayMode: TodayMode; billingProblem: boolean; offline: boolean };

  submitIntake(form: { id: string; version: number }, answers: Record<string, unknown>, parqFlag: boolean): Promise<void>;
  signWaiver(signedName: string, signatureSvg: string): Promise<void>;
  setNotificationsAsked(): void;
  startSession(plan: SessionPlan): Promise<string>;
  logSet(entry: Omit<LoggedSet, 'id' | 'sessionId' | 'loggedAt'>): Promise<LoggedSet>;
  undoSet(programExerciseId: string, setIndex: number): Promise<void>;
  setRest(endsAt: number | null, notificationId: string | null): void;
  swapExercise(programExerciseId: string, alt: { exerciseId: string; name: string } | null): void;
  keepLoad(programExerciseId: string): void;
  finishSession(feel: number | null, note: string | null): Promise<CompletedSession | null>;
  sendMessage(body: string): Promise<void>;
  setDemo(patch: Partial<AppState['demo']>): void;
  resetDemo(): Promise<void>;
}

/* MOCK DATA — seeded history and coach messages for the demo tenant. */
const seed = () => ({
  completed: DEMO_HISTORY.map((s) => ({ ...s, note: null })),
  messages: [
    {
      id: uuidv7(Date.parse(`${isoDay(-7)}T19:02:00Z`)),
      from: 'coach' as const,
      body: 'Nice work on Lower A. Those last squat reps looked smooth on the numbers. Same weight next time, and log your RPE if you can.',
      sentAt: `${isoDay(-7)}T19:02:00.000Z`,
      mutationId: null,
    },
  ],
});

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      intake: null,
      waiver: null,
      notificationsAsked: false,
      active: null,
      ...seed(),
      demo: { todayMode: 'session', billingProblem: false, offline: false },

      async submitIntake(form, answers, parqFlag) {
        await syncQueue.enqueue('intake.submit', { responseId: uuidv7(), formId: form.id, formVersion: form.version, answers, parqFlag });
        set({ intake: { answers, parqFlag } });
      },

      async signWaiver(signedName, signatureSvg) {
        const signedAt = new Date().toISOString();
        // IP is recorded server-side at upload (see docs/design/ux-validation.md, H3).
        await syncQueue.enqueue('waiver.sign', {
          signatureId: uuidv7(),
          waiverVersion: 1,
          signedName,
          signatureSvg,
          signedAt,
          appVersion: APP_VERSION,
        });
        set({ waiver: { signedName, signedAt } });
      },

      setNotificationsAsked: () => set({ notificationsAsked: true }),

      async startSession(plan) {
        const existing = get().active;
        if (existing && existing.plan.programDayId === plan.programDayId) return existing.sessionId;
        const sessionId = uuidv7();
        const startedAt = new Date().toISOString();
        await syncQueue.enqueue('session.start', {
          sessionId,
          programDayId: plan.programDayId,
          scheduledDate: plan.scheduledDate,
          startedAt,
        });
        set({ active: { sessionId, plan, startedAt, sets: [], restEndsAt: null, restNotificationId: null, swaps: {}, keptLoad: {} } });
        return sessionId;
      },

      async logSet(entry) {
        const active = get().active;
        if (!active) throw new Error('No active session');
        const logged: LoggedSet = { ...entry, id: uuidv7(), sessionId: active.sessionId, loggedAt: new Date().toISOString() };
        // State first so the strike and haptic don't wait on disk; the queue write follows immediately.
        const k = setKey(entry.programExerciseId, entry.setIndex);
        set({
          active: {
            ...active,
            sets: [...active.sets.filter((s) => setKey(s.programExerciseId, s.setIndex) !== k), logged],
          },
        });
        await syncQueue.enqueue('set.log', logged);
        void syncQueue.flush();
        return logged;
      },

      async undoSet(programExerciseId, setIndex) {
        const active = get().active;
        if (!active) return;
        const k = setKey(programExerciseId, setIndex);
        set({ active: { ...active, sets: active.sets.filter((s) => setKey(s.programExerciseId, s.setIndex) !== k) } });
        await syncQueue.enqueue('set.void', { sessionId: active.sessionId, programExerciseId, setIndex, voidedAt: new Date().toISOString() });
        void syncQueue.flush();
      },

      setRest(restEndsAt, restNotificationId) {
        const active = get().active;
        if (active) set({ active: { ...active, restEndsAt, restNotificationId } });
      },

      swapExercise(programExerciseId, alt) {
        const active = get().active;
        if (!active) return;
        const swaps = { ...active.swaps };
        if (alt) swaps[programExerciseId] = alt;
        else delete swaps[programExerciseId];
        set({ active: { ...active, swaps } });
      },

      keepLoad(programExerciseId) {
        const active = get().active;
        if (active) set({ active: { ...active, keptLoad: { ...active.keptLoad, [programExerciseId]: true } } });
      },

      async finishSession(feel, note) {
        const active = get().active;
        if (!active) return null;
        const finishedAt = new Date().toISOString();
        await syncQueue.enqueue('session.finish', { sessionId: active.sessionId, finishedAt, feel, note });
        void syncQueue.flush();
        const done: CompletedSession = {
          sessionId: active.sessionId,
          title: active.plan.title,
          date: active.plan.scheduledDate,
          startedAt: active.startedAt,
          finishedAt,
          feel: feel ?? 0,
          note,
          sets: [...active.sets].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
          plan: active.plan,
        };
        set({ active: null, completed: [...get().completed, done] });
        return done;
      },

      async sendMessage(body) {
        const id = uuidv7();
        const sentAt = new Date().toISOString();
        const m = await syncQueue.enqueue('message.send', { messageId: id, threadId: '0192f0a1-0000-7000-8000-000000000002', body, sentAt });
        set({ messages: [...get().messages, { id, from: 'client', body, sentAt, mutationId: m.clientMutationId }] });
        void syncQueue.flush();
      },

      setDemo: (patch) => set({ demo: { ...get().demo, ...patch } }),

      async resetDemo() {
        await clearLocalData();
        await syncQueue.init();
        set({ intake: null, waiver: null, notificationsAsked: false, active: null, ...seed(), demo: { todayMode: 'session', billingProblem: false, offline: false } });
      },
    }),
    {
      name: 'spotter.app',
      storage: createJSONStorage(() => kv),
      partialize: ({ hydrated: _h, ...rest }) => rest,
      onRehydrateStorage: () => () => useApp.setState({ hydrated: true }),
    },
  ),
);

/* ---------- Derived helpers ---------- */

/**
 * Today's plan from the client's assigned program (see src/programs.ts). The demo controls in Me can
 * still force a rest day or "no program"; with no assignment at all the demo falls back to Lower A.
 */
export function todayPlan(mode: TodayMode): SessionPlan | null {
  if (mode !== 'session') return null;
  const today = isoDay(0);
  if (lookupDay(today).kind === 'no_program') return { ...LOWER_A, scheduledDate: today };
  return planFor(today, useApp.getState().completed.flatMap((s) => s.sets));
}

/** Past results for an exercise, oldest first. Matched by exercise, so it carries across weeks and programs. */
export function historyFor(completed: CompletedSession[], exerciseId: string): ExerciseSessionResult[] {
  return completed
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((s) => ({
      sets: s.sets
        .filter((x) => x.exerciseId === exerciseId)
        .sort((a, b) => a.setIndex - b.setIndex)
        .map((x) => ({ weightKg: x.weightKg, reps: x.reps, rpe: x.rpe })),
    }))
    .filter((r) => r.sets.length > 0);
}

export function suggestionFor(e: ProgramExercise, completed: CompletedSession[]): ProgressionSuggestion | null {
  const load = e.sets[0]?.loadKg;
  if (!e.progressionRule || load == null) return null;
  return evaluateProgression(e.progressionRule, e.sets, historyFor(completed, e.exerciseId), load);
}

/** Most recent logged set for the same exercise and set number ("Last time" column). */
export function previousSet(completed: CompletedSession[], exerciseId: string, setIndex: number): LoggedSet | undefined {
  const byTime = [...completed].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (let i = byTime.length - 1; i >= 0; i--) {
    const hit = byTime[i]!.sets.find((s) => s.exerciseId === exerciseId && s.setIndex === setIndex);
    if (hit) return hit;
  }
  return undefined;
}

export function isFinishedToday(completed: CompletedSession[], plan: SessionPlan | null): CompletedSession | undefined {
  if (!plan) return undefined;
  return completed.find((s) => s.date === plan.scheduledDate && s.title === plan.title);
}
