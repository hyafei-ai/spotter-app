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

/* ---------- Blocks: multi-sport sessions (docs/features/multisport-core.md, docs/ports.md row 1) ---------- */

/**
 * A session is an ordered list of blocks. `strength` is the existing exercise list (it points at the session's
 * exercises by id, so sets, supersets and progression keep their meaning); every other kind carries its own
 * movements and timing. Kept inline (zod only) so this file stays self-contained for the Edge Functions copy.
 */
export const BLOCK_KINDS = [
  'strength',
  'rounds_for_time',
  'amrap',
  'interval_amrap',
  'emom',
  'for_time',
  'rep_scheme',
  'tabata',
  'intervals',
  'station_race',
  'timed',
  'rest',
  'note',
] as const;
export const BlockKind = z.enum(BLOCK_KINDS);
export type BlockKind = z.infer<typeof BlockKind>;

/** How a block's result is scored: total time, rounds + reps, heaviest load, reps, distance, calories, or not at all. */
export const SCORING_MODES = ['time', 'rounds_reps', 'load', 'reps', 'distance', 'calories', 'none'] as const;
export const ScoringMode = z.enum(SCORING_MODES);
export type ScoringMode = z.infer<typeof ScoringMode>;

export const INTERVAL_MODALITIES = ['run', 'row', 'bike', 'ski', 'swim', 'other'] as const;
export const IntervalModality = z.enum(INTERVAL_MODALITIES);
export type IntervalModality = z.infer<typeof IntervalModality>;

/** Same shape as the watch contract's IntervalTarget (watch.ts). */
export const BlockTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pace'), secPerKm: z.number().int().min(60).max(1200) }),
  z.object({ kind: z.literal('watts'), watts: z.number().int().min(1).max(2000) }),
  z.object({ kind: z.literal('hr_zone'), zone: z.number().int().min(1).max(5) }),
  z.object({ kind: z.literal('rpe'), rpe: z.number().min(1).max(10) }),
]);
export type BlockTarget = z.infer<typeof BlockTarget>;

/** One movement line inside a block: "21 Thrusters 43 kg", "500 m Row", "15/12 cal Bike". */
export const BlockMovement = z.object({
  id: z.string().min(1).max(64),
  /** Library id (library.ts), or null for a movement written by name only. */
  movementId: z.string().max(80).nullable(),
  name: z.string().trim().min(1).max(60),
  reps: z.number().int().min(0).max(1000).nullable(),
  /** Second number of a pair ("15/12"), kept without saying who it is for. */
  repsAlt: z.number().int().min(0).max(1000).nullable(),
  loadKg: z.number().min(0).max(500).nullable(),
  loadKgAlt: z.number().min(0).max(500).nullable(),
  /** 0–1.2 of the client's estimated max. */
  pct1rm: z.number().min(0).max(1.2).nullable(),
  calories: z.number().int().min(0).max(1000).nullable(),
  caloriesAlt: z.number().int().min(0).max(1000).nullable(),
  distanceM: z.number().min(0).max(100_000).nullable(),
  durationSec: z.number().int().min(0).max(7200).nullable(),
  note: z.string().max(120).nullable(),
  /** A number from a race standard nobody has checked yet: shown with "Check against the current official standard". */
  verify: z.boolean(),
});
export type BlockMovement = z.infer<typeof BlockMovement>;

export const RaceSegment = BlockMovement.extend({ kind: z.enum(['run', 'station']) });
export type RaceSegment = z.infer<typeof RaceSegment>;

const blockBase = {
  id: z.string().min(1).max(64),
  /** "Fran", "Engine", "Metcon". Null shows the kind's own label. */
  title: z.string().max(60).nullable(),
  /** The coach's note for this part. */
  note: z.string().max(300).nullable(),
  scoring: ScoringMode,
  timeCapSec: z.number().int().min(10).max(14_400).nullable(),
  /** The template it came from ("benchmark.fran"), so repeats compare with each other. */
  templateId: z.string().max(80).nullable(),
};
const movements = z.array(BlockMovement).max(30);
const sec = (min: number, max: number) => z.number().int().min(min).max(max);

export const Block = z.discriminatedUnion('kind', [
  z.object({ ...blockBase, kind: z.literal('strength'), exerciseIds: z.array(z.string().min(1)).max(30) }),
  z.object({ ...blockBase, kind: z.literal('rounds_for_time'), rounds: z.number().int().min(1).max(100), restSec: sec(0, 1800).nullable(), movements }),
  z.object({ ...blockBase, kind: z.literal('amrap'), durationSec: sec(30, 7200), movements }),
  z.object({ ...blockBase, kind: z.literal('interval_amrap'), rounds: z.number().int().min(1).max(30), workSec: sec(10, 3600), restSec: sec(0, 1800), movements }),
  z.object({ ...blockBase, kind: z.literal('emom'), intervalSec: sec(10, 600), rounds: z.number().int().min(1).max(120), rotate: z.boolean(), movements }),
  z.object({ ...blockBase, kind: z.literal('for_time'), movements }),
  z.object({ ...blockBase, kind: z.literal('rep_scheme'), scheme: z.array(z.number().int().min(1).max(500)).min(1).max(20), movements }),
  z.object({ ...blockBase, kind: z.literal('tabata'), rounds: z.number().int().min(1).max(40), workSec: sec(5, 600), restSec: sec(0, 600), movements }),
  z.object({
    ...blockBase,
    kind: z.literal('intervals'),
    modality: IntervalModality,
    reps: z.number().int().min(1).max(60),
    /** Work by time or by distance (then the client taps Done). Exactly one is set. */
    workSec: sec(5, 7200).nullable(),
    distanceM: z.number().min(1).max(100_000).nullable(),
    restSec: sec(0, 1800),
    target: BlockTarget.nullable(),
  }),
  z.object({ ...blockBase, kind: z.literal('station_race'), segments: z.array(RaceSegment).min(1).max(40) }),
  z.object({ ...blockBase, kind: z.literal('timed'), durationSec: sec(5, 14_400), movements }),
  z.object({ ...blockBase, kind: z.literal('rest'), durationSec: sec(5, 3600) }),
  z.object({ ...blockBase, kind: z.literal('note'), text: z.string().max(500) }),
]);
export type Block = z.infer<typeof Block>;
export type BlockOf<K extends BlockKind> = Extract<Block, { kind: K }>;

/** The coach-approved "Strategy & Stimulus" for a day (an AI draft until the coach approves it). */
export const DayBrief = z.object({
  /** What the session should feel like. */
  stimulus: z.string().trim().min(1).max(400),
  /** How to pace and approach it. */
  strategy: z.string().trim().min(1).max(600),
});
export type DayBrief = z.infer<typeof DayBrief>;

export const SessionPlan = z.object({
  programDayId: uuid,
  title: z.string().min(1),
  scheduledDate: isoDate,
  coachNote: z.string().nullable(),
  exercises: z.array(ProgramExercise),
  /** The day's blocks in order (absent on plans made before blocks: treat as one strength block). */
  blocks: z.array(Block).max(40).optional(),
  /** Strategy & Stimulus, only once the coach approved it. */
  brief: DayBrief.nullable().optional(),
});
export type SessionPlan = z.infer<typeof SessionPlan>;

/** A block's score. Unused fields stay null. */
export const BlockScore = z.object({
  timeSec: z.number().min(0).max(86_400).nullable(),
  rounds: z.number().int().min(0).max(1000).nullable(),
  reps: z.number().int().min(0).max(10_000).nullable(),
  loadKg: z.number().min(0).max(1000).nullable(),
  distanceM: z.number().min(0).max(1_000_000).nullable(),
  calories: z.number().int().min(0).max(10_000).nullable(),
  /** Hit the time cap: the score is the work done (rounds/reps), not a time. */
  capped: z.boolean(),
  scaled: z.boolean(),
});
export type BlockScore = z.infer<typeof BlockScore>;

export const BlockSplit = z.object({
  kind: z.enum(['round', 'window', 'interval', 'run', 'station']),
  name: z.string().max(60),
  index: z.number().int().min(0),
  sec: z.number().min(0).max(7200),
  distanceM: z.number().min(0).max(100_000).nullable(),
  avgHr: z.number().int().min(30).max(240).nullable(),
  maxHr: z.number().int().min(30).max(240).nullable(),
});
export type BlockSplit = z.infer<typeof BlockSplit>;

/** One block's result in a session (mutation `block.result`; a later result for the same block replaces it). */
export const BlockResult = z.object({
  sessionId: uuid,
  blockId: z.string().min(1).max(64),
  kind: BlockKind,
  /** Which repeats compare with each other ("benchmark.fran", "intervals:run:5x1000"). */
  key: z.string().min(1).max(120),
  /** "Fran", "AMRAP 20 min", "5 × 1 km". */
  label: z.string().min(1).max(80),
  scoring: ScoringMode,
  score: BlockScore,
  splits: z.array(BlockSplit).max(100),
  rpe: z.number().min(1).max(10).nullable(),
  loggedAt: isoDateTime,
});
export type BlockResult = z.infer<typeof BlockResult>;

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
  // Daily read (client JTBD): the 30-second check, and which version of a session the client chose.
  z.object({
    ...base,
    kind: z.literal('daily_check.submit'),
    payload: z.object({
      checkId: uuid,
      date: isoDate,
      sleepHours: z.number().min(0).max(16).nullable(),
      sleepSource: z.enum(['health', 'manual']).nullable(),
      energy: z.number().int().min(1).max(5).nullable(),
      soreness: z.number().int().min(1).max(5).nullable(),
      stress: z.number().int().min(1).max(5).nullable(),
      cyclePhase: z.enum(['menstrual', 'follicular', 'ovulation', 'luteal']).nullable(),
      shareCycle: z.boolean(),
      note: z.string().max(300).nullable(),
      shareWithCoach: z.boolean(),
      /** The read as the coach may see it (cycle phase removed unless shared); null when private. */
      sharedRead: z
        .object({
          tone: z.enum(['steady', 'watch', 'ease']),
          headline: z.string().max(300),
          factors: z.array(z.object({ kind: z.string().max(40), text: z.string().max(400), strain: z.boolean() })).max(20),
          suggestLighter: z.boolean(),
          /** The daily brief as shared (brief.ts sharedBrief): cycle, fuel and pain reasons only when shared. */
          brief: z
            .object({
              tone: z.enum(['steady', 'watch', 'ease']),
              feel: z.string().max(200),
              why: z.array(z.object({ source: z.string().max(20), text: z.string().max(300) })).max(3),
              todo: z.array(z.string().max(300)).max(3),
              suggestLighter: z.boolean(),
            })
            .optional(),
        })
        .nullable(),
      submittedAt: isoDateTime,
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('session.variant'),
    payload: z.object({ sessionId: uuid, variant: z.enum(['planned', 'lighter', 'recovery']) }),
  }),
  // Cycle tracking (docs/features/cycle.md). Private to the client; the coach only ever gets the shared
  // projection (today's phase + calibration summary) through cycle_shared_for_coach, and only when shared.
  z.object({
    ...base,
    kind: z.literal('cycle.profile.set'),
    payload: z.object({
      mode: z.enum(['natural', 'hormonal', 'irregular', 'perimenopause', 'postmenopause', 'not_tracking', 'pregnant_postpartum']),
      birthYear: z.number().int().min(1900).max(2100).nullable(),
      shareWithCoach: z.boolean(),
      /** Computed on the phone: today's estimated phase and the calibration summary. */
      todayPhase: z.enum(['menstrual', 'follicular', 'ovulation', 'luteal']).nullable(),
      todayPhaseOn: isoDate.nullable(),
      calibrationSummary: z
        .object({ method: z.string().max(80), ready: z.boolean(), summary: z.string().max(600), appliedPctToday: z.number().min(-5).max(5) })
        .nullable(),
      updatedAt: isoDateTime,
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('cycle.period.upsert'),
    payload: z.object({ periodId: uuid, start: isoDate, end: isoDate.nullable(), source: z.enum(['manual', 'health']), updatedAt: isoDateTime }),
  }),
  z.object({ ...base, kind: z.literal('cycle.period.delete'), payload: z.object({ periodId: uuid, deletedAt: isoDateTime }) }),
  z.object({
    ...base,
    kind: z.literal('cycle.symptoms.log'),
    payload: z.object({
      date: isoDate,
      scores: z.partialRecord(
        z.enum(['hot_flashes', 'night_sweats', 'poor_sleep', 'joint_aches', 'low_mood', 'brain_fog', 'cramps', 'bloating', 'headache']),
        z.number().int().min(0).max(3),
      ),
      loggedAt: isoDateTime,
    }),
  }),
  // Fuel check (docs/features/fuel.md): the athlete's settings, and the level they chose to share.
  z.object({
    ...base,
    kind: z.literal('fuel.settings.set'),
    payload: z.object({
      bodyFatPct: z.number().min(3).max(70).nullable(),
      useEstimate: z.boolean(),
      intakeSource: z.enum(['health', 'spotter', 'auto']),
      shareWithCoach: z.boolean(),
      updatedAt: isoDateTime,
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('fuel.pattern.share'),
    payload: z.object({
      date: isoDate,
      level: z.enum(['none', 'watch', 'talk_to_someone']),
      /** The signs' plain text only: never food logs or EA figures. */
      signs: z.array(z.string().max(200)).max(6),
      sharedAt: isoDateTime,
    }),
  }),
  // Daily brief (docs/features/brief.md): pain logs, wearable days and workouts imported from the health app.
  z.object({
    ...base,
    kind: z.literal('pain.log'),
    payload: z.object({
      painId: uuid,
      date: isoDate,
      region: z.enum(['neck', 'shoulder', 'elbow', 'wrist', 'upper_back', 'lower_back', 'hip', 'knee', 'ankle', 'foot', 'other']),
      side: z.enum(['left', 'right', 'both']).nullable(),
      level: z.number().int().min(0).max(10),
      note: z.string().max(300).nullable(),
      shareWithCoach: z.boolean(),
      loggedAt: isoDateTime,
    }),
  }),
  z.object({ ...base, kind: z.literal('pain.delete'), payload: z.object({ painId: uuid, deletedAt: isoDateTime }) }),
  z.object({
    ...base,
    kind: z.literal('wearable.days'),
    payload: z.object({
      days: z
        .array(
          z.object({
            date: isoDate,
            source: z.enum(['apple_health', 'health_connect', 'manual']),
            sleepHours: z.number().min(0).max(16).nullable(),
            hrvMs: z.number().min(0).max(500).nullable(),
            restingHr: z.number().min(20).max(250).nullable(),
            activeKcal: z.number().min(0).max(20000).nullable(),
          }),
        )
        .min(1)
        .max(60),
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('workout.import'),
    payload: z.object({
      workouts: z
        .array(
          z.object({
            externalId: z.string().min(1).max(200),
            date: isoDate,
            startedAt: isoDateTime,
            durationMin: z.number().min(0).max(1440),
            activity: z.enum(['run', 'walk', 'hike', 'ride', 'swim', 'row', 'strength', 'hiit', 'yoga', 'pilates', 'dance', 'class', 'other', 'flexibility', 'mind_and_body']),
            activeKcal: z.number().min(0).max(20000).nullable(),
            distanceM: z.number().min(0).max(1_000_000).nullable(),
            avgHr: z.number().min(20).max(250).nullable(),
            maxHr: z.number().min(20).max(250).nullable(),
            source: z.enum(['apple_health', 'health_connect']),
            sourceApp: z.string().max(120).nullable(),
            shareWithCoach: z.boolean(),
          }),
        )
        .min(1)
        .max(100),
    }),
  }),
  // Mobility (docs/features/patterns.md): a quick "Did mobility" log. Training data, shared with the coach like sessions.
  z.object({
    ...base,
    kind: z.literal('mobility.log'),
    payload: z.object({
      mobilityId: uuid,
      date: isoDate,
      minutes: z.number().int().min(1).max(240),
      kind: z.enum(['routine', 'yoga', 'stretching', 'pilates', 'other']),
      routineId: z.string().max(80).nullable(),
      loggedAt: isoDateTime,
      /** Who sees what (client experience build): absent means shared, as before. */
      shareWithCoach: z.boolean().optional(),
    }),
  }),
  z.object({ ...base, kind: z.literal('mobility.delete'), payload: z.object({ mobilityId: uuid, deletedAt: isoDateTime }) }),
  // Who sees what: the client turns the coach's view of their mobility logs on or off (all logs, past and future).
  z.object({ ...base, kind: z.literal('mobility.share.set'), payload: z.object({ shareWithCoach: z.boolean(), updatedAt: isoDateTime }) }),
  // Apple Watch (docs/features/watch.md): heart-rate summary of a session logged on the watch. Summary only
  // (average, peak, recovery after 1 and 2 minutes, splits); raw samples stay in Apple Health. The coach sees
  // it only while the client's "Heart rate from watch sessions" switch is on.
  z.object({
    ...base,
    kind: z.literal('session.watch'),
    payload: z.object({
      sessionId: uuid,
      source: z.literal('apple_watch'),
      avgHr: z.number().int().min(30).max(240).nullable(),
      maxHr: z.number().int().min(30).max(240).nullable(),
      hrrPeak: z.number().int().min(30).max(240).nullable(),
      hrr60: z.number().int().min(-60).max(200).nullable(),
      hrr120: z.number().int().min(-60).max(200).nullable(),
      splits: z
        .array(
          z.object({
            kind: z.enum(['interval', 'station', 'timed']),
            name: z.string().max(60),
            rep: z.number().int().min(0),
            sec: z.number().int().min(0).max(7200),
            distanceM: z.number().min(0).nullable(),
            avgHr: z.number().int().min(30).max(240).nullable(),
            maxHr: z.number().int().min(30).max(240).nullable(),
          }),
        )
        .max(60),
      shareWithCoach: z.boolean(),
      recordedAt: isoDateTime,
    }),
  }),
  // The client's switch for the above, applied to every watch summary (past and future).
  z.object({ ...base, kind: z.literal('watch.share.set'), payload: z.object({ shareWithCoach: z.boolean(), updatedAt: isoDateTime }) }),
  // Multi-sport blocks (docs/features/multisport-core.md): a block's score and splits in a session. Training data,
  // shared with the coach like sets. A later result for the same session and block replaces the earlier one.
  z.object({ ...base, kind: z.literal('block.result'), payload: BlockResult }),
  z.object({
    ...base,
    kind: z.literal('block.void'),
    payload: z.object({ sessionId: uuid, blockId: z.string().min(1).max(64), voidedAt: isoDateTime }),
  }),
  // Race goal (race.ts RaceGoal): set by the client in Me, or by their coach on the client page.
  z.object({
    ...base,
    kind: z.literal('race.goal.set'),
    payload: z.object({
      goalId: uuid,
      event: z.string().trim().min(1).max(80),
      kind: z.enum(['race_sim', 'run', 'other']),
      date: isoDate,
      targetSec: z.number().int().positive().max(86_400).nullable(),
      division: z.enum(['open_women', 'open_men', 'pro_women', 'pro_men']).nullable(),
      format: z.enum(['full', 'half']).nullable(),
      updatedAt: isoDateTime,
    }),
  }),
  z.object({ ...base, kind: z.literal('race.goal.clear'), payload: z.object({ goalId: uuid, clearedAt: isoDateTime }) }),
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
  // Owner asked a coach to check in on a member (docs/features/retention.md).
  'check_in_request',
  // Fuel check shared at "worth talking to someone" (docs/features/fuel.md).
  'fuel_pattern',
  // Daily brief: pain logged 3+ days of 14 (or 6/10+), shared with the coach (docs/features/brief.md).
  'pain_ongoing',
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
