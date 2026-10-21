import { z } from 'zod';

/**
 * Shared Zod schemas. The same definitions validate input in the apps and in the
 * Supabase Edge Functions (see packages/db/supabase/functions/_shared).
 */

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const isoDateTime = z.string().datetime({ offset: true });
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ExerciseMetric = z.enum(['weight_reps', 'bodyweight_reps', 'time', 'distance']);
export type ExerciseMetric = z.infer<typeof ExerciseMetric>;

export const PrescribedSet = z.object({
  index: z.number().int().min(0),
  repsMin: z.number().int().min(0).nullable(),
  repsMax: z.number().int().min(0).nullable(),
  /** Absolute load resolved for this client, in kg. Null for bodyweight/time/distance. */
  loadKg: z.number().min(0).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  durationS: z.number().int().min(0).nullable(),
  distanceM: z.number().min(0).nullable(),
  amrap: z.boolean().default(false),
});
export type PrescribedSet = z.infer<typeof PrescribedSet>;

export const ProgressionRule = z.object({
  id: uuid,
  /** e.g. hit the top of the rep range at or below this RPE */
  maxRpe: z.number().min(1).max(10).nullable(),
  sessionsRequired: z.number().int().min(1).max(10),
  incrementKg: z.number().positive(),
});
export type ProgressionRule = z.infer<typeof ProgressionRule>;

export const ProgramExercise = z.object({
  id: uuid,
  exerciseId: z.string(),
  name: z.string().min(1),
  metric: ExerciseMetric,
  supersetGroup: z.string().nullable(),
  restS: z.number().int().min(0),
  tempo: z.string().nullable(),
  note: z.string().nullable(),
  trackRpe: z.boolean(),
  demoVideoId: z.string().nullable(),
  alternatives: z.array(z.object({ exerciseId: z.string(), name: z.string() })),
  progressionRule: ProgressionRule.nullable(),
  sets: z.array(PrescribedSet).min(1),
});
export type ProgramExercise = z.infer<typeof ProgramExercise>;

export const SessionPlan = z.object({
  programDayId: uuid,
  title: z.string().min(1),
  scheduledDate: isoDate,
  coachNote: z.string().nullable(),
  exercises: z.array(ProgramExercise),
});
export type SessionPlan = z.infer<typeof SessionPlan>;

export const LoggedSet = z.object({
  id: uuid,
  sessionId: uuid,
  programExerciseId: uuid,
  exerciseId: z.string(),
  setIndex: z.number().int().min(0),
  weightKg: z.number().min(0).nullable(),
  reps: z.number().int().min(0).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  durationS: z.number().int().min(0).nullable(),
  distanceM: z.number().min(0).nullable(),
  loggedAt: isoDateTime,
});
export type LoggedSet = z.infer<typeof LoggedSet>;

/* ---------- Offline mutations (POST /sync/push) ---------- */

const base = { clientMutationId: uuid, createdAt: isoDateTime };

export const Mutation = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('session.start'),
    payload: z.object({ sessionId: uuid, programDayId: uuid, scheduledDate: isoDate, startedAt: isoDateTime }),
  }),
  z.object({ ...base, kind: z.literal('set.log'), payload: LoggedSet }),
  z.object({
    ...base,
    kind: z.literal('set.void'),
    payload: z.object({ sessionId: uuid, programExerciseId: uuid, setIndex: z.number().int().min(0), voidedAt: isoDateTime }),
  }),
  z.object({
    ...base,
    kind: z.literal('session.finish'),
    payload: z.object({
      sessionId: uuid,
      finishedAt: isoDateTime,
      feel: z.number().int().min(1).max(5).nullable(),
      note: z.string().max(2000).nullable(),
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('message.send'),
    payload: z.object({ messageId: uuid, threadId: uuid, body: z.string().min(1).max(4000), sentAt: isoDateTime }),
  }),
  z.object({
    ...base,
    kind: z.literal('intake.submit'),
    payload: z.object({
      responseId: uuid,
      formId: z.string(),
      formVersion: z.number().int().min(1).optional(),
      answers: z.record(z.string(), z.unknown()),
      parqFlag: z.boolean(),
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('waiver.sign'),
    payload: z.object({
      signatureId: uuid,
      waiverVersion: z.number().int().min(1),
      signedName: z.string().min(2).max(120),
      signatureSvg: z.string().min(1),
      signedAt: isoDateTime,
      appVersion: z.string(),
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('message.attach'),
    payload: z.object({
      messageId: uuid,
      threadId: uuid,
      kind: z.enum(['voice', 'image', 'link']),
      body: z.string().max(4000).nullable(),
      /** Storage path after upload; the local file URI stays on device until then. */
      mediaPath: z.string().max(500).nullable(),
      durationMs: z.number().int().min(0).nullable(),
      link: z.object({ type: z.enum(['session', 'form_check', 'program']), id: uuid, title: z.string().max(120) }).nullable(),
      sentAt: isoDateTime,
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('message.read'),
    payload: z.object({ threadId: uuid, upTo: isoDateTime }),
  }),
  z.object({
    ...base,
    kind: z.literal('consent.record'),
    payload: z.object({
      consentId: uuid,
      kind: z.enum(['terms_privacy', 'marketing', 'health_data']),
      granted: z.boolean(),
      version: z.string().min(1).max(40),
      recordedAt: isoDateTime,
    }),
  }),
]);
export type Mutation = z.infer<typeof Mutation>;
export type MutationKind = Mutation['kind'];
export type PayloadOf<K extends MutationKind> = Extract<Mutation, { kind: K }>['payload'];

export const SyncPushRequest = z.object({ mutations: z.array(Mutation).min(1).max(100) });
export type SyncPushRequest = z.infer<typeof SyncPushRequest>;

export const RejectReason = z.enum(['not_found', 'forbidden', 'invalid', 'conflict']);
export const SyncPushResponse = z.object({
  accepted: z.array(uuid),
  rejected: z.array(z.object({ clientMutationId: uuid, reason: RejectReason, message: z.string() })),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponse>;

/* ---------- Triage ---------- */

export const TriageReason = z.enum([
  'payment_failed',
  'parq_flag',
  'form_check_waiting',
  'check_in_submitted',
  'unread_message',
  'missed_sessions',
  'churn_risk',
  'new_client',
]);
export type TriageReason = z.infer<typeof TriageReason>;
