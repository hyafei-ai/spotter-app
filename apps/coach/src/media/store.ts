import { create } from 'zustand';
import { CheckInTemplate, uuidv7, type Annotation, type CheckInSubmission, type FormCheck, type TriageItem, type TriageReason } from '@spotter/core';
import {
  DEMO_KEYS,
  coachClientIdFor,
  demoCheckInTemplate,
  demoCoachCheckIns,
  demoFormChecks,
  demoReplies,
  type FormCheckReply,
} from '@spotter/core/demo';
import { onSharedChange, readShared, writeShared } from '@spotter/ui';
import { useCoach } from '../store';

/*
 * Coach-side form checks and check-ins (K-5, C-7).
 * Real builds read form_checks / check_ins under RLS and write form_check_annotations; replies
 * trigger a push via POST /notify. MOCK: the shared demo store on the web preview carries the
 * client's videos and check-ins here and the coach's replies back.
 */

export const REQUESTS_KEY = 'spotter.formchecks.requests';
export interface FormCheckRequest {
  id: string;
  exerciseId: string;
  exerciseName: string;
  requestedAt: string;
  fulfilledBy: string | null;
}

interface MediaState {
  loaded: boolean;
  formChecks: FormCheck[];
  replies: Record<string, FormCheckReply>;
  requests: FormCheckRequest[];
  checkIns: CheckInSubmission[];
  reviews: Record<string, string>;
  template: CheckInTemplate;
  load(): Promise<void>;
  sendReply(check: FormCheck, annotations: Annotation[], summary: string | null): Promise<void>;
  requestFormCheck(exerciseId: string, exerciseName: string): Promise<void>;
  markReviewed(submission: CheckInSubmission): Promise<void>;
  saveTemplate(t: CheckInTemplate): Promise<void>;
}

/** Close open triage items of one reason for a client (e.g. the form check was answered). */
export function handleReason(clientId: string, reason: TriageReason) {
  const now = new Date().toISOString();
  useCoach.setState((s) => ({
    triage: s.triage.map((t) => (t.clientId === clientId && t.reason === reason && !t.handledAt ? { ...t, handledAt: now } : t)),
  }));
}

/** Add a triage item unless one of that reason is already open (mirrors the DB triggers). */
export function ensureReason(clientId: string, reason: TriageReason, since: string) {
  const open = useCoach.getState().triage.some((t) => t.clientId === clientId && t.reason === reason && !t.handledAt);
  if (open) return;
  const item: TriageItem = { id: uuidv7(), clientId, reason, since, snoozedUntil: null, handledAt: null };
  useCoach.setState((s) => ({ triage: [...s.triage, item] }));
}

let watching = false;

export const useMedia = create<MediaState>((set, get) => ({
  loaded: false,
  formChecks: [],
  replies: {},
  requests: [],
  checkIns: [],
  reviews: {},
  template: demoCheckInTemplate(),

  async load() {
    const fromClient = await readShared<FormCheck[] | null>(DEMO_KEYS.formChecks, null);
    const replies = await readShared<Record<string, FormCheckReply>>(DEMO_KEYS.replies, demoReplies());
    const requests = await readShared<FormCheckRequest[]>(REQUESTS_KEY, []);
    const clientCheckIns = await readShared<CheckInSubmission[]>(DEMO_KEYS.checkIns, []);
    const reviews = await readShared<Record<string, string>>(DEMO_KEYS.checkInReviews, {});
    const rawTemplate = await readShared<unknown>(DEMO_KEYS.checkInTemplate, null);
    const parsed = CheckInTemplate.safeParse(rawTemplate);

    // The client app's records use its own demo id; the coach list knows that person as Jordan.
    const formChecks = (fromClient ?? demoFormChecks()).map((c) => ({ ...c, clientId: coachClientIdFor(c.clientId) }));
    const checkIns = [...demoCoachCheckIns(), ...clientCheckIns.map((c) => ({ ...c, clientId: coachClientIdFor(c.clientId) }))];
    set({ loaded: true, formChecks, replies, requests, checkIns, reviews, template: parsed.success ? parsed.data : demoCheckInTemplate() });

    // New uploads and submissions show up in triage, like the DB triggers do.
    for (const c of formChecks) if (c.upload.status === 'sent' && !replies[c.id]) ensureReason(c.clientId, 'form_check_waiting', c.createdAt);
    for (const s of checkIns) if (!s.reviewedAt && !reviews[s.id]) ensureReason(s.clientId, 'check_in_submitted', s.submittedAt);

    if (!watching) {
      watching = true;
      onSharedChange((key) => {
        if (key.startsWith('spotter.formchecks.') || key.startsWith('spotter.checkins.')) void get().load();
      });
    }
  },

  async sendReply(check, annotations, summary) {
    const replies = { ...get().replies, [check.id]: { annotations, summary, repliedAt: new Date().toISOString() } };
    set({ replies });
    await writeShared(DEMO_KEYS.replies, replies);
    handleReason(check.clientId, 'form_check_waiting');
  },

  async requestFormCheck(exerciseId, exerciseName) {
    const requests = [...get().requests, { id: uuidv7(), exerciseId, exerciseName, requestedAt: new Date().toISOString(), fulfilledBy: null }];
    set({ requests });
    await writeShared(REQUESTS_KEY, requests);
  },

  async markReviewed(s) {
    const reviews = { ...get().reviews, [s.id]: new Date().toISOString() };
    set({ reviews });
    await writeShared(DEMO_KEYS.checkInReviews, reviews);
    handleReason(s.clientId, 'check_in_submitted');
  },

  async saveTemplate(t) {
    set({ template: t });
    await writeShared(DEMO_KEYS.checkInTemplate, t);
  },
}));

/** A form check with its reply (if any) applied. */
export function withReply(c: FormCheck, replies: Record<string, FormCheckReply>): FormCheck {
  const r = replies[c.id];
  return r ? { ...c, upload: { status: 'replied', repliedAt: r.repliedAt }, annotations: r.annotations, replySummary: r.summary } : c;
}

export function reviewedAt(s: CheckInSubmission, reviews: Record<string, string>): string | null {
  return reviews[s.id] ?? s.reviewedAt;
}
