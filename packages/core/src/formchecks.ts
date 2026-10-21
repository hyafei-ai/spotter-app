import { z } from 'zod';

/**
 * Form checks (C-5, K-5): a client sends a short video of a set; the coach replies on the video
 * with timestamped notes, drawings (line, angle, circle) and an optional voice-over.
 */

export const MAX_FORM_CHECK_S = 60;

export type DurationCheck = { ok: true } | { ok: false; reason: 'too_long' | 'empty'; seconds: number };

/** Picked or recorded clips over 60 s are refused with the actual length, so the message can say it. */
export function checkDuration(durationMs: number | null | undefined): DurationCheck {
  const seconds = Math.round((durationMs ?? 0) / 1000);
  if (!durationMs || durationMs <= 0) return { ok: false, reason: 'empty', seconds: 0 };
  // Pickers report 60.4 s for a 60 s recording; allow half a second of slack.
  if (durationMs > MAX_FORM_CHECK_S * 1000 + 500) return { ok: false, reason: 'too_long', seconds };
  return { ok: true };
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------- annotations ---------- */

/** Points are normalised to the video frame: 0–1 on both axes, origin top-left. */
export const Point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export type Point = z.infer<typeof Point>;

export const AnnotationKind = z.enum(['note', 'line', 'angle', 'circle', 'voice']);
export type AnnotationKind = z.infer<typeof AnnotationKind>;

export const Annotation = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), atMs: z.number().int().min(0), kind: z.literal('note'), text: z.string().trim().min(1).max(500) }),
  z.object({ id: z.string(), atMs: z.number().int().min(0), kind: z.literal('line'), a: Point, b: Point }),
  z.object({ id: z.string(), atMs: z.number().int().min(0), kind: z.literal('angle'), a: Point, vertex: Point, b: Point }),
  z.object({ id: z.string(), atMs: z.number().int().min(0), kind: z.literal('circle'), center: Point, edge: Point }),
  z.object({ id: z.string(), atMs: z.number().int().min(0), kind: z.literal('voice'), uri: z.string().min(1), durationMs: z.number().int().min(0) }),
]);
export type Annotation = z.infer<typeof Annotation>;
export type DrawnAnnotation = Extract<Annotation, { kind: 'line' | 'angle' | 'circle' }>;

/** How many points each drawing tool needs, placed by tapping (a button alternative to dragging). */
export const TOOL_POINTS = { line: 2, angle: 3, circle: 2 } as const;
export type DrawTool = keyof typeof TOOL_POINTS;

/**
 * Interior angle at `vertex`, in whole degrees. Points are normalised, so `aspect` (width / height of the
 * displayed video) rescales x before measuring, otherwise a 9:16 clip would report wrong angles.
 */
export function angleDegrees(a: Point, vertex: Point, b: Point, aspect = 1): number {
  const ax = (a.x - vertex.x) * aspect;
  const ay = a.y - vertex.y;
  const bx = (b.x - vertex.x) * aspect;
  const by = b.y - vertex.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la === 0 || lb === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)));
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

/** Circle radius in normalised x units, measured with the same aspect correction. */
export function circleRadius(center: Point, edge: Point, aspect = 1): number {
  return Math.hypot((edge.x - center.x) * aspect, edge.y - center.y) / aspect;
}

export function buildDrawing(tool: DrawTool, points: Point[], atMs: number, id: string): DrawnAnnotation | null {
  if (points.length < TOOL_POINTS[tool]) return null;
  const [p0, p1, p2] = points as [Point, Point, Point?];
  if (tool === 'line') return { id, atMs, kind: 'line', a: p0, b: p1 };
  if (tool === 'circle') return { id, atMs, kind: 'circle', center: p0, edge: p1 };
  return { id, atMs, kind: 'angle', a: p0, vertex: p1, b: p2! };
}

/** Drawings stay on screen this long after their timestamp, so they can be read at normal speed. */
export const DRAWING_HOLD_MS = 2000;

export function visibleDrawings(annotations: Annotation[], atMs: number, holdMs = DRAWING_HOLD_MS): DrawnAnnotation[] {
  return annotations.filter(
    (x): x is DrawnAnnotation => (x.kind === 'line' || x.kind === 'angle' || x.kind === 'circle') && atMs >= x.atMs - 50 && atMs <= x.atMs + holdMs,
  );
}

export function sortByTime<T extends { atMs: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.atMs - b.atMs);
}

/** Frame stepping at the 30 fps most phones record at. */
export const FRAME_S = 1 / 30;

/* ---------- upload state machine ---------- */

export type UploadState =
  | { status: 'queued' }
  | { status: 'uploading'; sent: number; total: number }
  | { status: 'paused'; sent: number; total: number; reason: 'offline' | 'user' | 'app_closed' }
  | { status: 'failed'; sent: number; total: number; message: string }
  | { status: 'processing' }
  | { status: 'sent' }
  | { status: 'replied'; repliedAt: string };

export type UploadEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sent: number; total: number }
  | { type: 'pause'; reason: 'offline' | 'user' | 'app_closed' }
  | { type: 'resume' }
  | { type: 'fail'; message: string }
  | { type: 'uploaded' }
  | { type: 'processed' }
  | { type: 'replied'; at: string };

/** Pure reducer. Events that don't apply to the current state are ignored, never thrown. */
export function uploadReducer(state: UploadState, e: UploadEvent): UploadState {
  const sentOf = (s: UploadState) => ('sent' in s ? s.sent : 0);
  const totalOf = (s: UploadState, fallback = 0) => ('total' in s ? s.total : fallback);
  switch (e.type) {
    case 'start':
      return state.status === 'queued' ? { status: 'uploading', sent: 0, total: e.total } : state;
    case 'progress':
      return state.status === 'uploading' ? { status: 'uploading', sent: Math.min(e.sent, e.total), total: e.total } : state;
    case 'pause':
      return state.status === 'uploading' || state.status === 'queued'
        ? { status: 'paused', sent: sentOf(state), total: totalOf(state), reason: e.reason }
        : state;
    case 'resume':
      return state.status === 'paused' || state.status === 'failed'
        ? { status: 'uploading', sent: sentOf(state), total: totalOf(state) }
        : state;
    case 'fail':
      return state.status === 'uploading' || state.status === 'queued'
        ? { status: 'failed', sent: sentOf(state), total: totalOf(state), message: e.message }
        : state;
    case 'uploaded':
      return state.status === 'uploading' ? { status: 'processing' } : state;
    case 'processed':
      return state.status === 'processing' ? { status: 'sent' } : state;
    case 'replied':
      return state.status === 'sent' || state.status === 'processing' ? { status: 'replied', repliedAt: e.at } : state;
  }
}

/** After an app kill nothing is mid-upload any more; resume from where tus left off. */
export function afterRestart(state: UploadState): UploadState {
  return state.status === 'uploading' ? { status: 'paused', sent: state.sent, total: state.total, reason: 'app_closed' } : state;
}

export function uploadLabel(s: UploadState): string {
  switch (s.status) {
    case 'queued':
      return 'Waiting to upload';
    case 'uploading':
      return s.total > 0 ? `Uploading ${Math.floor((s.sent / s.total) * 100)}%` : 'Uploading';
    case 'paused':
      return s.reason === 'offline' ? 'Paused · waiting for signal' : 'Paused';
    case 'failed':
      return 'Upload failed';
    case 'processing':
      return 'Sent · processing';
    case 'sent':
      return 'Sent · waiting for your coach';
    case 'replied':
      return 'Coach replied';
  }
}

/* ---------- form check records ---------- */

export interface FormCheck {
  id: string;
  clientId: string;
  exerciseId: string;
  exerciseName: string;
  /** e.g. "set 3 · 82.5 kg × 8"; null when sent from the Coach tab without a set. */
  setLabel: string | null;
  sessionId: string | null;
  programExerciseId: string | null;
  setIndex: number | null;
  videoUri: string;
  durationMs: number;
  clientNote: string | null;
  createdAt: string;
  upload: UploadState;
  annotations: Annotation[];
  /** Coach's written summary that heads the reply. */
  replySummary: string | null;
}

/** The most recent earlier check of the same lift by the same client, for side-by-side compare. */
export function previousOfSameLift(all: FormCheck[], check: FormCheck): FormCheck | null {
  return (
    all
      .filter((c) => c.id !== check.id && c.clientId === check.clientId && c.exerciseId === check.exerciseId && c.createdAt < check.createdAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

export function needsCoach(c: FormCheck): boolean {
  return c.upload.status === 'sent' || c.upload.status === 'processing';
}
