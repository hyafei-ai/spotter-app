import { Upload } from 'tus-js-client';
import { VideoUploadBody, type UploadEvent } from '@spotter/core';
import { resolveMedia } from '@spotter/ui';
import { demoNetwork, useSync } from '../sync';

/**
 * Resumable video upload for form checks (C-5).
 *
 * Real: tus to Supabase Storage (resumable endpoint, 6 MB chunks as Storage requires), then
 * POST /videos-upload-url {action: "complete"} so the server creates the Mux asset. tus keeps the
 * upload's fingerprint, so after a network drop or an app restart it resumes from the last chunk.
 * JS uploads pause while the app is suspended and resume on foreground; a native background
 * session needs a dev build (see docs/features/formchecks-checkins.md).
 *
 * MOCK: without EXPO_PUBLIC_SUPABASE_URL, uploads are simulated so the states can be seen.
 */
export interface VideoUploader {
  start(job: UploadJob, emit: (e: UploadEvent) => void): void;
  pause(id: string): void;
  resume(id: string): void;
}

export interface UploadJob {
  id: string;
  videoId: string;
  uri: string;
  sizeBytes: number;
  durationMs: number;
  contentType: string;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
let accessToken: () => string | null = () => null;
/** The auth layer registers how to get the signed-in user's JWT. */
export function setUploadAuth(fn: () => string | null) {
  accessToken = fn;
}

async function callUploadFn(body: VideoUploadBody) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/videos-upload-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken() ?? ''}` },
    body: JSON.stringify(VideoUploadBody.parse(body)),
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return (await res.json()) as { endpoint: string; bucket: string; objectName: string };
}

class TusUploader implements VideoUploader {
  private uploads = new Map<string, { upload: Upload; emit: (e: UploadEvent) => void }>();

  start(job: UploadJob, emit: (e: UploadEvent) => void) {
    emit({ type: 'start', total: job.sizeBytes });
    void (async () => {
      try {
        const target = await callUploadFn({
          action: 'start',
          videoId: job.videoId,
          kind: 'form_check',
          contentType: job.contentType,
          sizeBytes: job.sizeBytes,
          durationMs: job.durationMs,
        });
        // Kept media refs ("idb:…" on web) resolve to a playable URL first.
        const src = await resolveMedia(job.uri);
        if (typeof src !== 'string') throw new Error('The video is no longer on this device.');
        const file = await (await fetch(src)).blob();
        const upload = new Upload(file, {
          endpoint: target.endpoint,
          retryDelays: [0, 2000, 5000, 10000, 20000],
          chunkSize: 6 * 1024 * 1024,
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          headers: { authorization: `Bearer ${accessToken() ?? ''}`, 'x-upsert': 'true' },
          metadata: { bucketName: target.bucket, objectName: target.objectName, contentType: job.contentType, cacheControl: '3600' },
          onProgress: (sent, total) => emit({ type: 'progress', sent, total }),
          onError: (err) => emit({ type: 'fail', message: err.message.split('\n')[0] ?? 'Upload failed' }),
          onSuccess: () => {
            emit({ type: 'uploaded' });
            callUploadFn({ action: 'complete', videoId: job.videoId }).catch(() => {
              // The webhook path still marks it ready once Mux has it; the client keeps showing "processing".
            });
          },
        });
        const previous = await upload.findPreviousUploads();
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        this.uploads.set(job.id, { upload, emit });
        upload.start();
      } catch (err) {
        emit({ type: 'fail', message: err instanceof Error ? err.message : 'Upload failed' });
      }
    })();
  }

  pause(id: string) {
    const u = this.uploads.get(id);
    if (!u) return;
    void u.upload.abort();
    u.emit({ type: 'pause', reason: 'user' });
  }

  resume(id: string) {
    const u = this.uploads.get(id);
    if (!u) return;
    u.emit({ type: 'resume' });
    u.upload.start();
  }
}

/** MOCK uploader: advances progress on a timer, pauses while the demo is "offline". */
class MockUploader implements VideoUploader {
  private jobs = new Map<string, { timer: ReturnType<typeof setInterval> | null; sent: number; total: number; emit: (e: UploadEvent) => void; paused: boolean }>();

  start(job: UploadJob, emit: (e: UploadEvent) => void) {
    const total = Math.max(job.sizeBytes, 1);
    emit({ type: 'start', total });
    this.jobs.set(job.id, { timer: null, sent: 0, total, emit, paused: false });
    this.tick(job.id);
  }

  private tick(id: string) {
    const j = this.jobs.get(id);
    if (!j) return;
    j.timer = setInterval(() => {
      if (j.paused) return;
      if (demoNetwork.offline || !useSync.getState().online) {
        j.paused = true;
        j.emit({ type: 'pause', reason: 'offline' });
        const unsub = useSync.subscribe((s) => {
          if (s.online && !demoNetwork.offline) {
            unsub();
            j.paused = false;
            j.emit({ type: 'resume' });
          }
        });
        return;
      }
      j.sent = Math.min(j.total, j.sent + j.total / 16);
      j.emit({ type: 'progress', sent: j.sent, total: j.total });
      if (j.sent >= j.total) {
        clearInterval(j.timer!);
        j.emit({ type: 'uploaded' });
        setTimeout(() => j.emit({ type: 'processed' }), 1200);
        this.jobs.delete(id);
      }
    }, 220);
  }

  pause(id: string) {
    const j = this.jobs.get(id);
    if (!j || j.paused) return;
    j.paused = true;
    j.emit({ type: 'pause', reason: 'user' });
  }

  resume(id: string) {
    const j = this.jobs.get(id);
    if (!j) return;
    j.paused = false;
    j.emit({ type: 'resume' });
  }
}

export const uploader: VideoUploader = SUPABASE_URL ? new TusUploader() : new MockUploader();
export const IS_MOCK_UPLOAD = !SUPABASE_URL;
