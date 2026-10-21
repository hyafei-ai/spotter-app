import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { create } from 'zustand';
import {
  CheckInTemplate,
  dayString,
  dueState,
  reminderAt,
  uuidv7,
  type CheckInAnswers,
  type CheckInPhoto,
  type CheckInSubmission,
  type DueState,
} from '@spotter/core';
import { DEMO_CLIENT, DEMO_CLIENTS, DEMO_KEYS, demoCheckInTemplate } from '@spotter/core/demo';
import { keepMedia, onSharedChange, readShared, writeShared } from '@spotter/ui';
import { syncQueue } from '../sync';
import { tenant } from '../env';
import '../formchecks/store'; // registers the SQLite-backed demo store before first read

/**
 * Weekly check-ins (C-7), client side. The template comes from the coach (GET /sync/pull in real
 * builds; MOCK: the shared demo store). Submissions go through the offline queue.
 */

/** MOCK: the demo client's start date (from the coach's client list). */
export const CLIENT_SINCE = DEMO_CLIENTS[0]!.startDate;

interface State {
  loaded: boolean;
  template: CheckInTemplate;
  submissions: CheckInSubmission[];
  reviews: Record<string, string>;
  load(): Promise<void>;
  submit(dueDate: string, answers: CheckInAnswers, photos: { pose: CheckInPhoto['pose']; uri: string }[]): Promise<CheckInSubmission>;
}

let watching = false;

export const useCheckIns = create<State>((set, get) => ({
  loaded: false,
  template: demoCheckInTemplate(),
  submissions: [],
  reviews: {},

  async load() {
    const raw = await readShared<unknown>(DEMO_KEYS.checkInTemplate, null);
    const parsed = CheckInTemplate.safeParse(raw);
    const template = parsed.success ? parsed.data : demoCheckInTemplate();
    const submissions = await readShared<CheckInSubmission[]>(DEMO_KEYS.checkIns, []);
    const reviews = await readShared<Record<string, string>>(DEMO_KEYS.checkInReviews, {});
    set({ loaded: true, template, submissions, reviews });
    void scheduleReminder(template, submissions);
    if (!watching) {
      watching = true;
      onSharedChange((key) => {
        if (key === DEMO_KEYS.checkInTemplate || key === DEMO_KEYS.checkInReviews) void get().load();
      });
    }
  },

  async submit(dueDate, answers, photos) {
    const id = uuidv7();
    const kept: CheckInPhoto[] = [];
    for (const p of photos) {
      const pid = uuidv7();
      kept.push({ id: pid, pose: p.pose, uri: await keepMedia(pid, p.uri, 'jpg') });
    }
    const submission: CheckInSubmission = {
      id,
      clientId: DEMO_CLIENT.id,
      dueDate,
      submittedAt: new Date().toISOString(),
      answers,
      photos: kept,
      reviewedAt: null,
    };
    const submissions = [...get().submissions.filter((s) => s.dueDate !== dueDate), submission];
    set({ submissions });
    await writeShared(DEMO_KEYS.checkIns, submissions);
    await syncQueue.enqueue('checkin.submit', {
      checkInId: id,
      dueDate,
      answers: answers as unknown as Record<string, unknown>,
      photoIds: kept.map((p) => p.id),
      submittedAt: submission.submittedAt,
    });
    void syncQueue.flush();
    void Notifications.cancelScheduledNotificationAsync(reminderId(dueDate)).catch(() => {});
    return submission;
  },
}));

export function todayString(): string {
  return dayString(new Date());
}

export function useDueState(): DueState | null {
  const loaded = useCheckIns((s) => s.loaded);
  const template = useCheckIns((s) => s.template);
  const submissions = useCheckIns((s) => s.submissions);
  if (!loaded) return null;
  return dueState(template, new Set(submissions.map((s) => s.dueDate)), todayString(), CLIENT_SINCE);
}

const reminderId = (dueDate: string) => `checkin-${dueDate}`;

/** Morning-of reminder (C-7). Native only; replaces any earlier reminder for the same date. */
async function scheduleReminder(template: CheckInTemplate, submissions: CheckInSubmission[]) {
  if (Platform.OS === 'web') return;
  const state = dueState(template, new Set(submissions.map((s) => s.dueDate)), todayString(), CLIENT_SINCE);
  const dueDate = state.kind === 'submitted' ? state.next : state.dueDate;
  const at = reminderAt(template, dueDate);
  if (at.getTime() <= Date.now()) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderId(dueDate));
    await Notifications.scheduleNotificationAsync({
      identifier: reminderId(dueDate),
      content: { title: 'Weekly check-in today', body: `${tenant.coach.name.split(' ')[0]} uses these to plan your next week.` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  } catch {
    // Notifications are off; the Due row on Today still shows it.
  }
}
