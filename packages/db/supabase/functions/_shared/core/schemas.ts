// GENERATED from packages/core/src/schemas.ts by scripts/sync-schemas.mjs. Do not edit.
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
    kind: z.literal('formcheck.create'),
    payload: z.object({
      formCheckId: uuid,
      videoId: uuid,
      exerciseId: z.string().min(1),
      sessionId: uuid.nullable(),
      programExerciseId: uuid.nullable(),
      setIndex: z.number().int().min(0).nullable(),
      durationMs: z.number().int().min(1).max(60_500),
      clientNote: z.string().max(1000).nullable(),
      createdAt: isoDateTime,
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('checkin.submit'),
    payload: z.object({
      checkInId: uuid,
      dueDate: isoDate,
      answers: z.record(z.string(), z.unknown()),
      photoIds: z.array(uuid).max(3),
      submittedAt: isoDateTime,
    }),
  }),
  // AI (churn signal): the client opened the app. Sent at most every few hours.
  z.object({ ...base, kind: z.literal('app.open'), payload: z.object({ openedAt: isoDateTime }) }),
  // Nutrition (C-8). Kept inline so this file stays self-contained for the Edge Functions copy.
  z.object({
    ...base,
    kind: z.literal('food.log'),
    payload: z.object({
      logId: uuid,
      date: isoDate,
      meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
      foodId: z.string().max(80).nullable(),
      name: z.string().min(1).max(120),
      grams: z.number().min(0).max(5000).nullable(),
      kcal: z.number().min(0).max(10000),
      proteinG: z.number().min(0).max(1000),
      carbsG: z.number().min(0).max(1000),
      fatG: z.number().min(0).max(1000),
      portions: z
        .object({ protein: z.number().min(0), carbs: z.number().min(0), fat: z.number().min(0), veg: z.number().min(0) })
        .nullable(),
      loggedAt: isoDateTime,
    }),
  }),
  z.object({ ...base, kind: z.literal('food.delete'), payload: z.object({ logId: uuid, deletedAt: isoDateTime }) }),
  z.object({
    ...base,
    kind: z.literal('habit.check'),
    payload: z.object({ habitId: z.string().min(1).max(80), date: isoDate, done: z.boolean(), checkedAt: isoDateTime }),
  }),
  // Platform (C-6 attachments and read receipts, consent at signup).
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
  // Coach memory (docs/jtbd.md, coach job): follow-ups and body-variance signals.
  'follow_up_due',
  'sleep_short_streak',
  'load_spike',
]);
export type TriageReason = z.infer<typeof TriageReason>;

/* ---------- Media (form checks, progress photos) ---------- */

/** POST /videos-upload-url: start a resumable upload. */
export const VideoUploadRequest = z.object({
  action: z.literal('start'),
  videoId: uuid,
  kind: z.enum(['form_check', 'voice_over', 'demo']),
  contentType: z.string().regex(/^(video|audio)\//),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024),
  durationMs: z.number().int().positive().max(60_500),
});
/** POST /videos-upload-url with action "complete": the tus upload finished; create the Mux asset. */
export const VideoUploadComplete = z.object({ action: z.literal('complete'), videoId: uuid });
export const VideoUploadBody = z.discriminatedUnion('action', [VideoUploadRequest, VideoUploadComplete]);
export type VideoUploadBody = z.infer<typeof VideoUploadBody>;

/** POST /media-signed-url: a short-lived playback or view link for private media the caller may see. */
export const SignedUrlRequest = z.object({
  kind: z.enum(['video', 'progress_photo']),
  id: uuid,
});
export type SignedUrlRequest = z.infer<typeof SignedUrlRequest>;
/** Private media links never outlive an hour (Security and privacy). */
export const SIGNED_URL_MAX_S = 3600;
/* ---------- Payments (Edge Function inputs) ---------- */

/** POST /stripe/checkout: buy a plan or a storefront program from the trainer's page. */
export const CheckoutRequest = z
  .object({
    tenantSlug: z.string().regex(/^[a-z0-9-]{3,40}$/),
    planId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    couponCode: z.string().regex(/^[A-Za-z0-9-]{3,24}$/).optional(),
    referralCode: z.string().max(40).optional(),
    email: z.string().email().optional(),
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
  })
  .refine((r) => !!r.planId !== !!r.productId, { message: 'Choose one plan or one program.' });
export type CheckoutRequest = z.infer<typeof CheckoutRequest>;

/** POST /stripe/connect/onboard and /stripe/portal: return URLs only; identity comes from the JWT. */
export const ReturnUrlsRequest = z.object({ returnUrl: z.string().url(), refreshUrl: z.string().url().optional() });
export type ReturnUrlsRequest = z.infer<typeof ReturnUrlsRequest>;
/* ---------- Publishing (W-2/W-3): Edge Function inputs ---------- */

export const TenantsPublishRequest = z.object({
  platforms: z.array(z.enum(['ios', 'android'])).min(1).max(2),
  kind: z.enum(['build', 'update', 'submit']),
});
export type TenantsPublishRequest = z.infer<typeof TenantsPublishRequest>;

/** Store credentials are only ever sent to the store-credentials function, never stored in plaintext. */
export const StoreCredentialUpload = z.discriminatedUnion('platform', [
  z.object({
    platform: z.literal('ios'),
    keyId: z.string().regex(/^[A-Z0-9]{8,12}$/),
    // Apple issuer IDs are UUID-shaped but don't follow RFC 4122 variants, so match the shape only.
    issuerId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    privateKeyP8: z.string().includes('BEGIN PRIVATE KEY').max(4000),
  }),
  z.object({
    platform: z.literal('android'),
    serviceAccountJson: z
      .string()
      .max(20000)
      .refine((s) => {
        try {
          const j = JSON.parse(s) as { type?: string; client_email?: string; private_key?: string };
          return j.type === 'service_account' && !!j.client_email && !!j.private_key;
        } catch {
          return false;
        }
      }, 'Upload the service-account JSON file from Google Cloud.'),
  }),
]);
export type StoreCredentialUpload = z.infer<typeof StoreCredentialUpload>;
