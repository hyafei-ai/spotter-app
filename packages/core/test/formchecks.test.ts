import { describe, expect, it } from 'vitest';
import {
  afterRestart,
  angleDegrees,
  buildDrawing,
  checkDuration,
  circleRadius,
  clock,
  previousOfSameLift,
  uploadLabel,
  uploadReducer,
  visibleDrawings,
  type Annotation,
  type FormCheck,
  type UploadState,
} from '../src/formchecks';
import {
  DEFAULT_CHECK_IN_TEMPLATE,
  EMPTY_ANSWERS,
  delta,
  dueState,
  lastDueDate,
  missingCheckInFields,
  nextDueDate,
  reminderAt,
} from '../src/checkins';
import { Mutation } from '../src/schemas';
import { uuidv7 } from '../src/ids';

describe('duration', () => {
  it('allows up to 60 s with half a second of slack', () => {
    expect(checkDuration(60_400)).toEqual({ ok: true });
    expect(checkDuration(84_000)).toEqual({ ok: false, reason: 'too_long', seconds: 84 });
    expect(checkDuration(0)).toMatchObject({ ok: false, reason: 'empty' });
    expect(clock(84_000)).toBe('1:24');
  });
});

describe('annotation geometry', () => {
  it('measures the angle at the vertex', () => {
    expect(angleDegrees({ x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 })).toBe(90);
    expect(angleDegrees({ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 })).toBe(180);
    expect(angleDegrees({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 })).toBe(0);
  });
  it('corrects for the video aspect ratio', () => {
    // On a 9:16 frame, equal normalised steps in x and y are not 45°.
    const a = { x: 0.6, y: 0.5 };
    const v = { x: 0.5, y: 0.5 };
    const b = { x: 0.6, y: 0.4 };
    expect(angleDegrees(a, v, b, 1)).toBe(45);
    expect(angleDegrees(a, v, b, 9 / 16)).toBe(61);
    expect(circleRadius({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 9 / 16)).toBeCloseTo(0.1, 6);
  });
  it('builds drawings only once enough points are placed', () => {
    const p = { x: 0.1, y: 0.1 };
    expect(buildDrawing('angle', [p, p], 0, 'a')).toBeNull();
    expect(buildDrawing('angle', [p, p, p], 1200, 'a')).toMatchObject({ kind: 'angle', atMs: 1200 });
    expect(buildDrawing('circle', [p, { x: 0.2, y: 0.2 }], 0, 'c')).toMatchObject({ kind: 'circle', center: p });
  });
  it('shows drawings around their timestamp only', () => {
    const list: Annotation[] = [
      { id: '1', atMs: 1000, kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
      { id: '2', atMs: 1000, kind: 'note', text: 'Knees out' },
      { id: '3', atMs: 5000, kind: 'circle', center: { x: 0.5, y: 0.5 }, edge: { x: 0.6, y: 0.5 } },
    ];
    expect(visibleDrawings(list, 500).map((a) => a.id)).toEqual([]);
    expect(visibleDrawings(list, 2500).map((a) => a.id)).toEqual(['1']);
    expect(visibleDrawings(list, 5200).map((a) => a.id)).toEqual(['3']);
  });
});

describe('upload state machine', () => {
  const run = (events: Parameters<typeof uploadReducer>[1][], from: UploadState = { status: 'queued' }) => events.reduce(uploadReducer, from);

  it('goes Uploading → Sent → Coach replied', () => {
    const s = run([
      { type: 'start', total: 1000 },
      { type: 'progress', sent: 420, total: 1000 },
    ]);
    expect(uploadLabel(s)).toBe('Uploading 42%');
    const done = run([{ type: 'uploaded' }, { type: 'processed' }, { type: 'replied', at: '2026-10-21T10:00:00Z' }], s);
    expect(done).toEqual({ status: 'replied', repliedAt: '2026-10-21T10:00:00Z' });
  });
  it('pauses offline and resumes from the same byte', () => {
    const s = run([{ type: 'start', total: 1000 }, { type: 'progress', sent: 300, total: 1000 }, { type: 'pause', reason: 'offline' }]);
    expect(s).toEqual({ status: 'paused', sent: 300, total: 1000, reason: 'offline' });
    expect(uploadLabel(s)).toBe('Paused · waiting for signal');
    expect(uploadReducer(s, { type: 'resume' })).toEqual({ status: 'uploading', sent: 300, total: 1000 });
  });
  it('fails with a message and can be retried', () => {
    const s = run([{ type: 'start', total: 10 }, { type: 'fail', message: 'Server returned 500' }]);
    expect(uploadLabel(s)).toBe('Upload failed');
    expect(uploadReducer(s, { type: 'resume' }).status).toBe('uploading');
  });
  it('ignores events that don’t apply', () => {
    const sent: UploadState = { status: 'sent' };
    expect(uploadReducer(sent, { type: 'progress', sent: 1, total: 2 })).toBe(sent);
    expect(uploadReducer(sent, { type: 'fail', message: 'x' })).toBe(sent);
  });
  it('treats an upload interrupted by an app kill as paused', () => {
    expect(afterRestart({ status: 'uploading', sent: 5, total: 10 })).toEqual({ status: 'paused', sent: 5, total: 10, reason: 'app_closed' });
    expect(afterRestart({ status: 'sent' })).toEqual({ status: 'sent' });
  });
});

describe('compare', () => {
  const fc = (id: string, exerciseId: string, createdAt: string): FormCheck => ({
    id, clientId: 'c', exerciseId, exerciseName: exerciseId, setLabel: null, sessionId: null, programExerciseId: null, setIndex: null,
    videoUri: 'x', durationMs: 1000, clientNote: null, createdAt, upload: { status: 'sent' }, annotations: [], replySummary: null,
  });
  it('finds the most recent earlier check of the same lift', () => {
    const all = [fc('a', 'squat', '2026-10-01'), fc('b', 'squat', '2026-10-10'), fc('c', 'rdl', '2026-10-12'), fc('d', 'squat', '2026-10-20')];
    expect(previousOfSameLift(all, all[3]!)?.id).toBe('b');
    expect(previousOfSameLift(all, all[0]!)).toBeNull();
  });
});

describe('check-in due dates', () => {
  const t = { ...DEFAULT_CHECK_IN_TEMPLATE, dueWeekday: 0 }; // Sunday
  it('finds the next and last Sunday', () => {
    expect(nextDueDate(t, '2026-10-21')).toBe('2026-10-25'); // Wednesday → Sunday
    expect(nextDueDate(t, '2026-10-25')).toBe('2026-10-25');
    expect(lastDueDate(t, '2026-10-21')).toBe('2026-10-18');
  });
  it('reports due today, overdue and submitted', () => {
    expect(dueState(t, new Set(), '2026-10-25')).toEqual({ kind: 'due_today', dueDate: '2026-10-25' });
    expect(dueState(t, new Set(), '2026-10-21')).toEqual({ kind: 'overdue', dueDate: '2026-10-18', days: 3 });
    expect(dueState(t, new Set(['2026-10-18']), '2026-10-21')).toEqual({ kind: 'submitted', dueDate: '2026-10-18', next: '2026-10-25', daysToNext: 4 });
  });
  it('never marks a check-in from before the client joined as overdue', () => {
    expect(dueState(t, new Set(), '2026-10-21', '2026-10-20')).toEqual({ kind: 'upcoming', dueDate: '2026-10-25', days: 4 });
  });
  it('schedules the reminder for the morning it is due', () => {
    const r = reminderAt({ reminderHour: 8 }, '2026-10-25');
    expect([r.getFullYear(), r.getMonth(), r.getDate(), r.getHours()]).toEqual([2026, 9, 25, 8]);
  });
  it('lists required fields still empty; photos are optional', () => {
    expect(missingCheckInFields(DEFAULT_CHECK_IN_TEMPLATE, EMPTY_ANSWERS)).toEqual(['bodyweight', 'waist', 'sleep', 'stress', 'how much of the plan you did']);
    const full = { ...EMPTY_ANSWERS, bodyweightKg: 80, measurementsCm: { waist: 84 }, sleepHours: 7, stress: 2, adherence: 'most' as const };
    expect(missingCheckInFields(DEFAULT_CHECK_IN_TEMPLATE, full)).toEqual([]);
  });
  it('only shows a change when both weeks have a number', () => {
    expect(delta(80.4, 81)).toBe(-0.6);
    expect(delta(80, null)).toBeNull();
  });
});

describe('mutations', () => {
  it('validates formcheck.create and checkin.submit', () => {
    const now = new Date().toISOString();
    const fcm = {
      clientMutationId: uuidv7(), createdAt: now, kind: 'formcheck.create',
      payload: { formCheckId: uuidv7(), videoId: uuidv7(), exerciseId: 'back-squat', sessionId: null, programExerciseId: null, setIndex: null, durationMs: 42_000, clientNote: null, createdAt: now },
    };
    expect(Mutation.safeParse(fcm).success).toBe(true);
    expect(Mutation.safeParse({ ...fcm, payload: { ...fcm.payload, durationMs: 90_000 } }).success).toBe(false);
    const ci = { clientMutationId: uuidv7(), createdAt: now, kind: 'checkin.submit', payload: { checkInId: uuidv7(), dueDate: '2026-10-25', answers: {}, photoIds: [], submittedAt: now } };
    expect(Mutation.safeParse(ci).success).toBe(true);
  });
});
