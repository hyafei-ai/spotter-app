import { z } from 'zod';

/**
 * Weekly check-ins (C-7). The coach picks which fields a client answers and the day it's due;
 * the client gets a reminder the morning it's due. Progress photos are private to client + coach.
 */

export const MEASUREMENTS = ['waist', 'hips', 'chest', 'arm', 'thigh'] as const;
export type Measurement = (typeof MEASUREMENTS)[number];
export const MEASUREMENT_LABEL: Record<Measurement, string> = { waist: 'Waist', hips: 'Hips', chest: 'Chest', arm: 'Upper arm', thigh: 'Thigh' };

export const PHOTO_POSES = ['front', 'side', 'back'] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];

export const ADHERENCE = ['all', 'most', 'some', 'little'] as const;
export const ADHERENCE_LABEL: Record<(typeof ADHERENCE)[number], string> = { all: 'All of it', most: 'Most', some: 'Some', little: 'Not much' };

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const CheckInTemplate = z.object({
  id: z.string(),
  fields: z.object({
    bodyweight: z.boolean(),
    measurements: z.array(z.enum(MEASUREMENTS)),
    photos: z.boolean(),
    sleep: z.boolean(),
    stress: z.boolean(),
    adherence: z.boolean(),
    notes: z.boolean(),
  }),
  /** 0 = Sunday. */
  dueWeekday: z.number().int().min(0).max(6),
  /** Local hour for the morning-of reminder. */
  reminderHour: z.number().int().min(5).max(12),
});
export type CheckInTemplate = z.infer<typeof CheckInTemplate>;

export const DEFAULT_CHECK_IN_TEMPLATE: CheckInTemplate = {
  id: 'default',
  fields: { bodyweight: true, measurements: ['waist'], photos: true, sleep: true, stress: true, adherence: true, notes: true },
  dueWeekday: 0,
  reminderHour: 8,
};

export const CheckInAnswers = z.object({
  bodyweightKg: z.number().positive().max(400).nullable(),
  measurementsCm: z.record(z.string(), z.number().positive().max(300)),
  /** Average hours per night this week. */
  sleepHours: z.number().min(0).max(16).nullable(),
  /** 1 (calm) – 5 (very stressed). */
  stress: z.number().int().min(1).max(5).nullable(),
  adherence: z.enum(ADHERENCE).nullable(),
  notes: z.string().max(2000).nullable(),
});
export type CheckInAnswers = z.infer<typeof CheckInAnswers>;

export const EMPTY_ANSWERS: CheckInAnswers = { bodyweightKg: null, measurementsCm: {}, sleepHours: null, stress: null, adherence: null, notes: null };

export interface CheckInPhoto {
  id: string;
  pose: PhotoPose;
  uri: string;
}

export interface CheckInSubmission {
  id: string;
  clientId: string;
  dueDate: string;
  submittedAt: string;
  answers: CheckInAnswers;
  photos: CheckInPhoto[];
  reviewedAt: string | null;
}

/* ---------- dates (local calendar days as YYYY-MM-DD) ---------- */

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}
export function dayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
}

/** The due date on or after `today` (today itself if today is the due weekday). */
export function nextDueDate(t: Pick<CheckInTemplate, 'dueWeekday'>, today: string): string {
  const d = parseDay(today);
  const delta = (t.dueWeekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return dayString(d);
}

/** The most recent due date on or before `today`. */
export function lastDueDate(t: Pick<CheckInTemplate, 'dueWeekday'>, today: string): string {
  const d = parseDay(today);
  const delta = (d.getDay() - t.dueWeekday + 7) % 7;
  d.setDate(d.getDate() - delta);
  return dayString(d);
}

export type DueState =
  | { kind: 'due_today'; dueDate: string }
  | { kind: 'overdue'; dueDate: string; days: number }
  /** The latest one is in; `next` is the following due date. */
  | { kind: 'submitted'; dueDate: string; next: string; daysToNext: number }
  /** Nothing owed yet (joined after the last due date). */
  | { kind: 'upcoming'; dueDate: string; days: number };

/**
 * What Today should show. A missed check-in stays "overdue" until the next one is due,
 * then the older one is dropped (nobody should owe two at once). `since` is the client's start
 * date: a due date before they joined is never owed.
 */
export function dueState(t: Pick<CheckInTemplate, 'dueWeekday'>, submittedDueDates: Set<string>, today: string, since?: string): DueState {
  const last = lastDueDate(t, today);
  if (since && last < since) {
    // last < since means today isn't a due day on or after joining, so the next one is strictly ahead.
    const n = nextDueDate(t, since > today ? since : today);
    return { kind: 'upcoming', dueDate: n, days: daysBetween(today, n) };
  }
  if (!submittedDueDates.has(last)) {
    const days = daysBetween(last, today);
    return days === 0 ? { kind: 'due_today', dueDate: last } : { kind: 'overdue', dueDate: last, days };
  }
  const following = parseDay(last);
  following.setDate(following.getDate() + 7);
  const next = dayString(following);
  return { kind: 'submitted', dueDate: last, next, daysToNext: daysBetween(today, next) };
}

/** When the morning-of reminder fires, as a local Date. */
export function reminderAt(t: Pick<CheckInTemplate, 'reminderHour'>, dueDate: string): Date {
  const d = parseDay(dueDate);
  d.setHours(t.reminderHour, 0, 0, 0);
  return d;
}

/** Required fields the client hasn't filled. Photos are optional, everything else the coach turned on is required. */
export function missingCheckInFields(t: CheckInTemplate, a: CheckInAnswers): string[] {
  const out: string[] = [];
  if (t.fields.bodyweight && a.bodyweightKg == null) out.push('bodyweight');
  for (const m of t.fields.measurements) if (a.measurementsCm[m] == null) out.push(MEASUREMENT_LABEL[m].toLowerCase());
  if (t.fields.sleep && a.sleepHours == null) out.push('sleep');
  if (t.fields.stress && a.stress == null) out.push('stress');
  if (t.fields.adherence && a.adherence == null) out.push('how much of the plan you did');
  return out;
}

/** Change since the previous submission, only when both weeks have a real number. */
export function delta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  return Math.round((current - previous) * 10) / 10;
}
