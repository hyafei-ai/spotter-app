import { z } from 'zod';
import { isoDate } from './schemas';
import { CYCLE_PHASES, type CyclePhase, type ReadTone } from './signals';

/**
 * Shared contracts for the physiology layer (docs/physiology.md): cycle-phase calibration, fuelling
 * and energy availability, wearable days, the daily brief and drop-out risk. Implementations live in
 * cycle.ts, calibration.ts, fuel.ts, injury.ts, progress.ts and brief.ts; this file only holds the
 * shapes they agree on, so each can be built and tested on its own.
 *
 * Ground rules for everything built on these types:
 * - The athlete's own history is the baseline. No population "average woman" or "25-year-old man"
 *   numbers are applied as if they were the athlete's.
 * - Every output says which inputs produced it, in plain words, and how sure it is.
 * - Screening, never diagnosis. Health patterns point to a doctor or sports dietitian.
 * - Cycle and fuelling data are private to the athlete unless the athlete shares them, per item.
 */

/* ---------- cycle ---------- */

/**
 * How the athlete's cycle works right now. Women 35+ are often on hormonal contraception, in
 * perimenopause, or past menopause, so "28-day natural cycle" is one mode of six, not the default.
 */
export const CYCLE_MODES = ['natural', 'hormonal', 'irregular', 'perimenopause', 'postmenopause', 'not_tracking'] as const;
export const CycleMode = z.enum(CYCLE_MODES);
export type CycleMode = z.infer<typeof CycleMode>;
export const CYCLE_MODE_LABEL: Record<CycleMode, string> = {
  natural: 'Natural cycle',
  hormonal: 'Hormonal contraception',
  irregular: 'Irregular cycle',
  perimenopause: 'Perimenopause',
  postmenopause: 'Post-menopause',
  not_tracking: 'Not tracking',
};

export const PeriodLog = z.object({
  /** First day of bleeding. */
  start: isoDate,
  /** Last day of bleeding, when known. */
  end: isoDate.nullable(),
});
export type PeriodLog = z.infer<typeof PeriodLog>;

/** Symptoms worth logging in perimenopause and post-menopause (and any mode). 0 none … 3 severe. */
export const SYMPTOMS = ['hot_flashes', 'night_sweats', 'poor_sleep', 'joint_aches', 'low_mood', 'brain_fog', 'cramps', 'bloating', 'headache'] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export const CycleProfile = z.object({
  mode: CycleMode,
  periods: z.array(PeriodLog),
  /** Year only; used for life-stage copy, never shown to the coach. */
  birthYear: z.number().int().min(1900).max(2100).nullable(),
  /** Coach sees phase and calibration summary only when this is on. Off by default. */
  shareWithCoach: z.boolean(),
});
export type CycleProfile = z.infer<typeof CycleProfile>;

export type Confidence = 'none' | 'low' | 'medium' | 'high';

export interface CycleEstimate {
  date: string;
  mode: CycleMode;
  /** Null when the mode has no phases (hormonal, post-menopause, not tracking) or there's too little data. */
  phase: CyclePhase | null;
  /** Day 1 = first day of the last period. */
  dayOfCycle: number | null;
  /** The athlete's own typical cycle length (median of recent cycles), when known. */
  typicalLength: number | null;
  confidence: Confidence;
  /** Next period window, when predictable. */
  nextPeriod: { from: string; to: string } | null;
  /** Plain words: "Day 22 of about 29, luteal phase (based on your last 5 cycles)". */
  note: string;
  /** e.g. a cycle that ran 40+ days, or no period for 90 days in natural mode. Feeds the fuel screen. */
  irregularities: string[];
}

/* ---------- calibration ---------- */

/** One logged working set, enough for estimated 1RM and effort. */
export interface CalibrationSet {
  exerciseId: string;
  weightKg: number;
  reps: number;
  /** Rate of perceived exertion 1–10 when logged. */
  rpe: number | null;
}
export interface CalibrationSession {
  date: string;
  sets: CalibrationSet[];
  /** Finish-screen "how did it feel", 1 rough … 5 great. */
  feel: number | null;
}

export interface CalibrationInput {
  today: string;
  sessions: CalibrationSession[];
  /** The cycle estimate for any past date (built from the same period logs). */
  phaseOn: (date: string) => CycleEstimate;
}

export interface PhaseAdjustment {
  phase: CyclePhase;
  /** How this athlete's performance in this phase runs against their own baseline, e.g. -3.2 (%). */
  deltaPct: number;
  /** What the app does with it: the suggested-load change, capped and only when confident. 0 = no change. */
  appliedPct: number;
  sessions: number;
  cycles: number;
  confidence: Confidence;
}

export interface Calibration {
  /** Method id, so the coach and athlete can see which method produced it. */
  method: string;
  ready: boolean;
  cyclesObserved: number;
  adjustments: PhaseAdjustment[];
  /** "After 4 cycles: your lifts in the late luteal phase run about 3% under your usual." */
  summary: string;
}

/**
 * The calibration method is pluggable: `calibration.ts` ships a transparent personal-baseline method,
 * and a proprietary method can replace it by implementing this interface.
 */
export interface Calibrator {
  id: string;
  label: string;
  calibrate(input: CalibrationInput): Calibration;
}

/* ---------- fuelling ---------- */

export interface EnergyDay {
  date: string;
  /** Logged food energy; null when nothing was logged (never treated as zero). */
  intakeKcal: number | null;
  /** Exercise energy from the wearable (active kcal during workouts) or estimated from sessions. */
  exerciseKcal: number | null;
  exerciseSource: 'wearable' | 'estimate' | null;
}

/** Energy availability bands, kcal per kg fat-free mass per day. */
export type EaBand = 'adequate' | 'reduced' | 'low' | 'unknown';

export type FuelLevel = 'none' | 'watch' | 'talk_to_someone';
export interface FuelSign {
  kind: 'low_ea' | 'cycle_change' | 'injury_repeat' | 'performance_drop' | 'energy_mood_low' | 'weight_drop';
  text: string;
}
export interface FuelPattern {
  level: FuelLevel;
  signs: FuelSign[];
  /** Plain-English fixes ("Add a carb-and-protein snack within an hour after training"). */
  fixes: string[];
  /** Average energy availability over the window, when computable. */
  eaAverage: number | null;
  eaBand: EaBand;
}

/* ---------- wearables ---------- */

export interface WearableDay {
  date: string;
  sleepHours: number | null;
  /** Heart-rate variability (SDNN from Apple Health, RMSSD from Health Connect), ms. */
  hrvMs: number | null;
  restingHr: number | null;
  activeKcal: number | null;
  /** Apple Watch / phone via Apple Health, or Android via Health Connect, or typed in. */
  source: 'apple_health' | 'health_connect' | 'manual';
}

/* ---------- injury ---------- */

export const BODY_REGIONS = ['neck', 'shoulder', 'elbow', 'wrist', 'upper_back', 'lower_back', 'hip', 'knee', 'ankle', 'foot', 'other'] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

export interface PainLog {
  id: string;
  date: string;
  region: BodyRegion;
  side: 'left' | 'right' | 'both' | null;
  /** 0 none … 10 worst. */
  level: number;
  note: string | null;
}

/* ---------- the daily brief ---------- */

export interface BriefReason {
  /** Where it came from, so the UI can link to the detail. */
  source: 'sleep' | 'hrv' | 'resting_hr' | 'load' | 'cycle' | 'fuel' | 'pain' | 'check' | 'symptoms';
  text: string;
}

export interface DailyBrief {
  date: string;
  tone: ReadTone;
  /** "You're running tired today." */
  feel: string;
  /** "Here's why": at most 3 reasons, strongest first. */
  why: BriefReason[];
  /** "Here's what to do": concrete, at most 3. */
  todo: string[];
  /** The calibrated load change applied to today's session (0 = none), with the reason. */
  calibration: { appliedPct: number; reason: string } | null;
  suggestLighter: boolean;
}

/* ---------- drop-out risk (coach and owner) ---------- */

/** Physiology-side signals that predict an athlete stopping, shared only with consent. */
export interface PhysiologySignals {
  fuelLevel: FuelLevel | null;
  /** Pain logged on 3+ of the last 14 days, or a level ≥ 6. */
  painOngoing: boolean;
  /** No new best (raw or calibrated) in 8 weeks of steady training. */
  progressStalled: boolean;
  /** Easier-day reads on 4+ of the last 7 days. */
  runningTired: boolean;
}
