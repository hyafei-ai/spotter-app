import { create } from 'zustand';
import { afterRestart, uploadReducer, uuidv7, type FormCheck, type UploadEvent } from '@spotter/core';
import { DEMO_CLIENT, DEMO_KEYS, demoFormChecks, demoReplies, type FormCheckReply } from '@spotter/core/demo';
import { keepMedia, onSharedChange, readShared, setDemoBackend, writeShared } from '@spotter/ui';
import { kv } from '../storage';
import { syncQueue } from '../sync';
import { uploader } from './uploader';

/**
 * Client-side form checks (C-5). Records live on the device (SQLite on native) and the create
 * mutation goes through the offline queue; the video goes through the resumable uploader.
 * MOCK: coach replies arrive through the shared demo store instead of GET /sync/pull.
 */
setDemoBackend({ getItem: kv.getItem, setItem: async (k, v) => void (await kv.setItem(k, v)) });

export interface NewFormCheck {
  exerciseId: string;
  exerciseName: string;
  programExerciseId: string | null;
  sessionId: string | null;
  setIndex: number | null;
  setLabel: string | null;
  uri: string;
  durationMs: number;
  sizeBytes: number;
  contentType: string;
  clientNote: string | null;
}

/** Coach asked for a form check on a lift (shown as a Due row on Today). */
export interface FormCheckRequest {
  id: string;
  exerciseId: string;
  exerciseName: string;
  requestedAt: string;
  fulfilledBy: string | null;
}
export const REQUESTS_KEY = 'spotter.formchecks.requests';

interface State {
  loaded: boolean;
  checks: FormCheck[];
  replies: Record<string, FormCheckReply>;
  requests: FormCheckRequest[];
  load(): Promise<void>;
  create(input: NewFormCheck): Promise<FormCheck>;
  pause(id: string): void;
  resume(id: string): void;
}

function applyReplies(checks: FormCheck[], replies: Record<string, FormCheckReply>): FormCheck[] {
  return checks.map((c) => {
    const r = replies[c.id];
    if (!r) return c;
    return { ...c, upload: { status: 'replied', repliedAt: r.repliedAt }, annotations: r.annotations, replySummary: r.summary };
  });
}

let started = false;

export const useFormChecks = create<State>((set, get) => {
  const persist = () => writeShared(DEMO_KEYS.formChecks, get().checks);

  const dispatch = (id: string, e: UploadEvent) => {
    set({ checks: get().checks.map((c) => (c.id === id ? { ...c, upload: uploadReducer(c.upload, e) } : c)) });
    void persist();
  };

  const startUpload = (c: FormCheck, job: Omit<NewFormCheck, 'exerciseId' | 'exerciseName' | 'programExerciseId' | 'sessionId' | 'setIndex' | 'setLabel' | 'clientNote'> & { videoId: string }) => {
    uploader.start({ id: c.id, videoId: job.videoId, uri: job.uri, sizeBytes: job.sizeBytes, durationMs: job.durationMs, contentType: job.contentType }, (e) => dispatch(c.id, e));
  };

  return {
    loaded: false,
    checks: [],
    replies: {},
    requests: [],

    async load() {
      const stored = await readShared<FormCheck[] | null>(DEMO_KEYS.formChecks, null);
      const checks = (stored ?? demoFormChecks()).map((c) => ({ ...c, upload: afterRestart(c.upload) }));
      const replies = await readShared<Record<string, FormCheckReply>>(DEMO_KEYS.replies, demoReplies());
      const requests = await readShared<FormCheckRequest[]>(REQUESTS_KEY, []);
      set({ loaded: true, checks, replies, requests });
      if (!stored) await persist();
      if (!started) {
        started = true;
        // Uploads interrupted by an app kill pick up again (tus resumes from the server's offset).
        for (const c of checks) {
          if (c.upload.status === 'paused' && c.upload.reason === 'app_closed') {
            set({ checks: get().checks.map((x) => (x.id === c.id ? { ...x, upload: { status: 'queued' } } : x)) });
            startUpload(c, { uri: c.videoUri, durationMs: c.durationMs, sizeBytes: c.upload.total, contentType: 'video/mp4', videoId: c.id });
          }
        }
        onSharedChange((key) => {
          if (key === DEMO_KEYS.replies) void readShared<Record<string, FormCheckReply>>(DEMO_KEYS.replies, {}).then((r) => set({ replies: r }));
          if (key === REQUESTS_KEY) void readShared<FormCheckRequest[]>(REQUESTS_KEY, []).then((r) => set({ requests: r }));
        });
      }
    },

    async create(input) {
      const id = uuidv7();
      const videoId = uuidv7();
      const ext = input.contentType.includes('webm') ? 'webm' : input.contentType.includes('quicktime') ? 'mov' : 'mp4';
      const ref = await keepMedia(id, input.uri, ext);
      const createdAt = new Date().toISOString();
      const check: FormCheck = {
        id,
        clientId: DEMO_CLIENT.id,
        exerciseId: input.exerciseId,
        exerciseName: input.exerciseName,
        setLabel: input.setLabel,
        sessionId: input.sessionId,
        programExerciseId: input.programExerciseId,
        setIndex: input.setIndex,
        videoUri: ref,
        durationMs: input.durationMs,
        clientNote: input.clientNote,
        createdAt,
        upload: { status: 'queued' },
        annotations: [],
        replySummary: null,
      };
      set({ checks: [check, ...get().checks] });
      await persist();
      await syncQueue.enqueue('formcheck.create', {
        formCheckId: id,
        videoId,
        exerciseId: input.exerciseId,
        sessionId: input.sessionId,
        programExerciseId: input.programExerciseId,
        setIndex: input.setIndex,
        durationMs: Math.min(input.durationMs, 60_500),
        clientNote: input.clientNote,
        createdAt,
      });
      void syncQueue.flush();
      // Fulfil an open request for the same lift.
      const open = get().requests.find((r) => r.exerciseId === input.exerciseId && !r.fulfilledBy);
      if (open) {
        const requests = get().requests.map((r) => (r.id === open.id ? { ...r, fulfilledBy: id } : r));
        set({ requests });
        await writeShared(REQUESTS_KEY, requests);
      }
      startUpload(check, { uri: input.uri, durationMs: input.durationMs, sizeBytes: input.sizeBytes, contentType: input.contentType, videoId });
      return check;
    },

    pause: (id) => uploader.pause(id),
    resume(id) {
      const c = get().checks.find((x) => x.id === id);
      if (!c) return;
      if (c.upload.status === 'failed') {
        // A failed upload restarts; tus resumes from whatever the server already has.
        set({ checks: get().checks.map((x) => (x.id === id ? { ...x, upload: { status: 'queued' } } : x)) });
        startUpload(c, { uri: c.videoUri, durationMs: c.durationMs, sizeBytes: c.upload.total || 1, contentType: 'video/mp4', videoId: c.id });
      } else uploader.resume(id);
    },
  };
});

/** Checks with any coach reply merged in, newest first. */
export function useMergedChecks(): FormCheck[] {
  const checks = useFormChecks((s) => s.checks);
  const replies = useFormChecks((s) => s.replies);
  return applyReplies(checks, replies).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
