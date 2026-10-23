import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { DEFAULT_LIGHTER, LighterRule, sharedRead, uuidv7, type DailyCheck, type DailyRead, type SharedBrief } from '@spotter/core';
import {
  DEMO_CLIENT,
  EMPTY_SHARED_READS,
  coachClientIdFor,
  demoDailyChecks,
  lighterKey,
  readsKey,
  type LighterRules,
  type SessionVariant,
  type SharedReadsDoc,
} from '@spotter/core/demo';
import { readShared, writeShared } from '@spotter/ui';
import { kv } from '../storage';
import { syncQueue } from '../sync';
import { IS_DEMO, tenant } from '../env';
import { localDate } from '../nutrition/store';

/**
 * The client's daily check (client JTBD: train around body variance, share the read without extra effort).
 * Offline first: checks are stored on the phone and queued as daily_check.submit.
 */

export interface DailySettings {
  reminderOn: boolean;
  /** Local hour for the morning reminder. */
  reminderHour: number;
  /** Cycle tracking is off until the client turns it on; it is always private by default. */
  cycleTracking: boolean;
  /** Default for "Share today's read with {coach}". */
  shareDefault: boolean;
  reminderId: string | null;
}

export type CheckInput = Omit<DailyCheck, 'id' | 'date' | 'submittedAt'>;

interface DailyState {
  hydrated: boolean;
  checks: DailyCheck[];
  /** Date the client chose "Skip today" on, so the prompt doesn't nag. */
  skippedOn: string | null;
  settings: DailySettings;
  /** `brief`, when given, adds the shared daily brief (brief.ts sharedBrief) to what the coach sees. */
  submit(input: CheckInput, read: (check: DailyCheck) => DailyRead, brief?: (check: DailyCheck, read: DailyRead) => SharedBrief): Promise<DailyCheck>;
  skipToday(): void;
  setSettings(patch: Partial<DailySettings>): Promise<void>;
  recordVariant(sessionId: string, date: string, title: string, variant: SessionVariant): Promise<void>;
  reset(): void;
}

const DEFAULT_SETTINGS: DailySettings = { reminderOn: false, reminderHour: 7, cycleTracking: false, shareDefault: true, reminderId: null };

const myCoachSideId = () => coachClientIdFor(DEMO_CLIENT.id);

/** MOCK: publish the coach-visible projection for the demo coach app. Private reads publish nothing but the fact. */
async function publishRead(check: DailyCheck, read: DailyRead, brief: SharedBrief | null) {
  const doc = await readShared<SharedReadsDoc>(readsKey(tenant.slug), EMPTY_SHARED_READS);
  const id = myCoachSideId();
  const shared = sharedRead(read, check);
  const entries = (doc.reads[id] ?? []).filter((e) => e.date !== check.date);
  entries.push({ date: check.date, submittedAt: check.submittedAt, shared: !!shared, read: shared, brief: shared ? brief : null });
  await writeShared(readsKey(tenant.slug), { ...doc, reads: { ...doc.reads, [id]: entries.slice(-14) } });
}

async function scheduleReminder(s: DailySettings): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    if (s.reminderId) await Notifications.cancelScheduledNotificationAsync(s.reminderId);
    if (!s.reminderOn) return null;
    return await Notifications.scheduleNotificationAsync({
      content: { title: 'How are you today?', body: `30 seconds: sleep, energy, soreness. ${tenant.coach.name.split(' ')[0]} sees the read.` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: s.reminderHour, minute: 0 },
    });
  } catch {
    // Notifications denied or unavailable: the setting stays, the card on Today still prompts.
    return null;
  }
}

export const useDaily = create<DailyState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      // MOCK: demo builds start with two weeks of sample checks.
      checks: IS_DEMO ? demoDailyChecks() : [],
      skippedOn: null,
      settings: DEFAULT_SETTINGS,

      async submit(input, toRead, toBrief) {
        const date = localDate();
        const check: DailyCheck = { ...input, id: uuidv7(), date, submittedAt: new Date().toISOString() };
        // Phone first, so the read shows immediately even with no signal.
        set({ checks: [...get().checks.filter((c) => c.date !== date), check] });
        const read = toRead(check);
        const shared = sharedRead(read, check);
        const brief = shared && toBrief ? toBrief(check, read) : null;
        await syncQueue.enqueue('daily_check.submit', {
          checkId: check.id,
          date,
          sleepHours: check.sleepHours,
          sleepSource: check.sleepSource,
          energy: check.energy,
          soreness: check.soreness,
          stress: check.stress,
          cyclePhase: check.cyclePhase,
          shareCycle: check.shareCycle,
          note: check.note,
          shareWithCoach: check.shareWithCoach,
          sharedRead: shared
            ? { tone: shared.tone, headline: shared.headline, factors: shared.factors, suggestLighter: shared.suggestLighter, ...(brief ? { brief } : {}) }
            : null,
          submittedAt: check.submittedAt,
        });
        void syncQueue.flush();
        if (IS_DEMO) await publishRead(check, read, brief);
        return check;
      },

      skipToday: () => set({ skippedOn: localDate() }),

      async setSettings(patch) {
        const next = { ...get().settings, ...patch };
        if ('reminderOn' in patch || 'reminderHour' in patch) next.reminderId = await scheduleReminder(next);
        set({ settings: next });
      },

      async recordVariant(sessionId, date, title, variant) {
        if (variant === 'planned') return;
        await syncQueue.enqueue('session.variant', { sessionId, variant });
        void syncQueue.flush();
        if (IS_DEMO) {
          const doc = await readShared<SharedReadsDoc>(readsKey(tenant.slug), EMPTY_SHARED_READS);
          const id = myCoachSideId();
          const list = [...(doc.variants[id] ?? []), { date, title, variant }].slice(-14);
          await writeShared(readsKey(tenant.slug), { ...doc, variants: { ...doc.variants, [id]: list } });
        }
      },

      reset: () => set({ checks: IS_DEMO ? demoDailyChecks() : [], skippedOn: null, settings: DEFAULT_SETTINGS }),
    }),
    {
      name: `spotter.daily.${tenant.slug}`,
      storage: createJSONStorage(() => kv),
      partialize: ({ checks, skippedOn, settings }) => ({ checks, skippedOn, settings }),
      onRehydrateStorage: () => () => useDaily.setState({ hydrated: true }),
    },
  ),
);

/** The coach's lighter rule for this client (MOCK: set in the demo coach app), else the default. */
export async function loadLighterRule(): Promise<LighterRule> {
  const rules = await readShared<LighterRules>(lighterKey(tenant.slug), {});
  const parsed = LighterRule.safeParse(rules[myCoachSideId()]);
  return parsed.success ? parsed.data : DEFAULT_LIGHTER;
}
