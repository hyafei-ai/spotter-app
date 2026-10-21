/*
 * MOCK DATA — demo form checks and check-ins shared by the client and coach apps.
 * The video is the labelled sample clip ("sample"), not a real person; the coach's notes are sample text.
 */
import type { Annotation, FormCheck } from '../formchecks';
import type { CheckInSubmission, CheckInTemplate } from '../checkins';
import { DEFAULT_CHECK_IN_TEMPLATE } from '../checkins';
import { DEMO_CLIENT, LOWER_A } from './client';
import { DEMO_CLIENTS } from './coach';

/** Keys the two apps share on the web preview (same origin). */
export const DEMO_KEYS = {
  formChecks: 'spotter.formchecks.client',
  replies: 'spotter.formchecks.replies',
  checkInTemplate: 'spotter.checkins.template',
  checkIns: 'spotter.checkins.client',
  checkInReviews: 'spotter.checkins.reviews',
} as const;

export interface FormCheckReply {
  annotations: Annotation[];
  summary: string | null;
  repliedAt: string;
}

/** The client app's demo user is "Jordan Ellis" in the coach app's client list. */
export function coachClientIdFor(clientId: string): string {
  return clientId === DEMO_CLIENT.id ? DEMO_CLIENTS[0]!.id : clientId;
}

const fid = (n: number) => `0192f0a3-0000-7000-8000-${String(n).padStart(12, '0')}`;
const daysAgoIso = (d: number, now = Date.now()) => new Date(now - d * 86_400_000).toISOString();

export function demoFormChecks(now = Date.now()): FormCheck[] {
  const squat = LOWER_A.exercises[0]!;
  return [
    {
      id: fid(1),
      clientId: DEMO_CLIENT.id,
      exerciseId: squat.exerciseId,
      exerciseName: squat.name,
      setLabel: 'Set 3 · 80 × 8',
      sessionId: null,
      programExerciseId: squat.id,
      setIndex: 2,
      videoUri: 'sample',
      durationMs: 6000,
      clientNote: 'Last set felt like my knees caved a bit.',
      createdAt: daysAgoIso(8, now),
      upload: { status: 'replied', repliedAt: daysAgoIso(7, now) },
      annotations: [],
      replySummary: null,
    },
    {
      id: fid(2),
      clientId: DEMO_CLIENT.id,
      exerciseId: squat.exerciseId,
      exerciseName: squat.name,
      setLabel: 'Set 3 · 80 × 8',
      sessionId: null,
      programExerciseId: squat.id,
      setIndex: 2,
      videoUri: 'sample',
      durationMs: 6000,
      clientNote: 'Tried pushing knees out like you said. Better?',
      createdAt: daysAgoIso(1, now),
      upload: { status: 'sent' },
      annotations: [],
      replySummary: null,
    },
  ];
}

/** Maya's reply to the older check (so the client has a replied example and compare has a baseline). */
export function demoReplies(now = Date.now()): Record<string, FormCheckReply> {
  return {
    [fid(1)]: {
      repliedAt: daysAgoIso(7, now),
      summary: 'Depth is good. Knees drift in on the way up from the bottom; watch the angle at 0:02.',
      annotations: [
        { id: 'r1', atMs: 1500, kind: 'note', text: 'Good depth here.' },
        { id: 'r2', atMs: 2200, kind: 'angle', a: { x: 0.3, y: 0.42 }, vertex: { x: 0.5, y: 0.62 }, b: { x: 0.7, y: 0.42 } },
        { id: 'r3', atMs: 3400, kind: 'line', a: { x: 0.2, y: 0.47 }, b: { x: 0.8, y: 0.47 } },
        { id: 'r4', atMs: 3400, kind: 'note', text: 'Keep the bar path over mid-foot.' },
      ],
    },
  };
}

export function demoCheckInTemplate(): CheckInTemplate {
  return DEFAULT_CHECK_IN_TEMPLATE;
}

/** One submission from Mei (coach list shows "Check-in submitted"). No photos: none are invented. */
export function demoCoachCheckIns(now = Date.now()): CheckInSubmission[] {
  const mei = DEMO_CLIENTS[5]!;
  const day = (d: number) => daysAgoIso(d, now).slice(0, 10);
  return [
    {
      id: fid(11),
      clientId: mei.id,
      dueDate: day(7),
      submittedAt: daysAgoIso(7, now),
      answers: { bodyweightKg: 61.2, measurementsCm: { waist: 70 }, sleepHours: 7, stress: 3, adherence: 'most', notes: null },
      photos: [],
      reviewedAt: daysAgoIso(6, now),
    },
    {
      id: fid(12),
      clientId: mei.id,
      dueDate: day(0),
      submittedAt: daysAgoIso(0.5, now),
      answers: { bodyweightKg: 60.8, measurementsCm: { waist: 69.5 }, sleepHours: 6.5, stress: 4, adherence: 'most', notes: 'Work trip mid-week, missed Thursday.' },
      photos: [],
      reviewedAt: null,
    },
  ];
}
