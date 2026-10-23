import type { Macros } from './nutrition';
import type { BodyRegion, CycleEstimate, EaBand, EnergyDay, FuelLevel, FuelPattern, FuelSign, PainLog } from './physiology';
import type { DailyCheck, ReadFactor } from './signals';

/**
 * Fuelling and energy availability (docs/features/fuel.md, docs/physiology.md).
 *
 * Energy availability (EA) = (food energy − exercise energy) ÷ fat-free mass, in kcal per kg FFM per
 * day. The bands are commonly used screening cut-offs from the sports-science literature (Loucks and
 * colleagues): 45+ adequate, 30–45 reduced, under 30 low. They are a screen, not a diagnosis, and every
 * input here is rough (self-reported food under-counts, exercise energy is estimated).
 *
 * Copy rules: plain and kind, never moralising about food, no weight-loss framing, no pronouns.
 */

/* ---------- fat-free mass ---------- */

/** The assumption behind "Use an estimate", spelled out wherever an estimated figure is shown. */
export const ASSUMED_BODY_FAT_PCT = 30;

export interface FfmResult {
  kg: number;
  estimated: boolean;
  /** Plain words for "How this is worked out". */
  note: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Fat-free mass from bodyweight and body fat %. Unknown body fat gives null: never guessed silently. */
export function fatFreeMassKg(bodyweightKg: number, bodyFatPct: number | null): number | null {
  if (bodyFatPct == null || !(bodyweightKg > 0) || bodyFatPct < 3 || bodyFatPct > 70) return null;
  return r1(bodyweightKg * (1 - bodyFatPct / 100));
}

/** Only when the athlete chose "Use an estimate": assumes 30% body fat, and says so. */
export function estimatedFfm(bodyweightKg: number): FfmResult {
  return {
    kg: r1(bodyweightKg * (1 - ASSUMED_BODY_FAT_PCT / 100)),
    estimated: true,
    note: `Estimated: assumes ${ASSUMED_BODY_FAT_PCT}% body fat, because body fat isn’t entered`,
  };
}

/** The FFM the fuel check uses: measured when body fat is entered, the labelled estimate only on opt-in. */
export function ffmFor(bodyweightKg: number | null, bodyFatPct: number | null, useEstimate: boolean): FfmResult | null {
  if (bodyweightKg == null || !(bodyweightKg > 0)) return null;
  const measured = fatFreeMassKg(bodyweightKg, bodyFatPct);
  if (measured != null) return { kg: measured, estimated: false, note: `From ${r1(bodyweightKg)} kg at ${bodyFatPct}% body fat` };
  return useEstimate ? estimatedFfm(bodyweightKg) : null;
}

/* ---------- exercise energy ---------- */

/**
 * Strength-training METs (Compendium of Physical Activities ranges): about 5 for a moderate session and
 * about 6 for a hard one. "Hard" comes from the finish screen's feel (1 rough, 2 tough). One MET is
 * taken off so only the energy above resting counts, which is how exercise energy enters EA.
 */
export const STRENGTH_MET = { moderate: 5, hard: 6 } as const;

export interface ExerciseEstimate {
  kcal: number;
  source: 'estimate';
  /** "Estimated: 60 min of strength training at about 5 METs" */
  note: string;
}

export function exerciseKcalEstimate(session: { durationMin: number; feel: number | null }, bodyweightKg: number): ExerciseEstimate {
  const hard = session.feel != null && session.feel <= 2;
  const met = hard ? STRENGTH_MET.hard : STRENGTH_MET.moderate;
  const minutes = Math.max(0, Math.round(session.durationMin));
  const kcal = Math.round((met - 1) * Math.max(0, bodyweightKg) * (minutes / 60));
  return { kcal, source: 'estimate', note: `Estimated: ${minutes} min of strength training at about ${met} METs` };
}

/* ---------- heart-rate estimate (Keytel et al. 2005), ported from Station Zero's calories.ts ---------- */

/**
 * Keytel et al. 2005 ("Prediction of energy expenditure from heart rate monitoring during submaximal exercise",
 * J Sports Sci 23(3):289–297), the equations without VO2max, in kJ per minute:
 *   men:   −55.0969 + 0.6309 × HR + 0.1988 × weight (kg) + 0.2017 × age
 *   women: −20.4022 + 0.4472 × HR − 0.1263 × weight (kg) + 0.0740 × age
 * ÷ 4.184 for kcal. Verify coefficients against the paper before relying on them in copy. The source app's
 * coefficients are kept as they were; they match the commonly cited form.
 *
 * Guards kept from the source: average HR outside 90–200 bpm gives no estimate (the source's comment said it
 * returns nothing outside the range but its code clamped; here it returns nothing, as documented), and more than
 * 25 kcal a minute is treated as the formula misbehaving. Verify the valid HR range against the paper too.
 * Changed: with sex unknown the source averaged the two equations; that average isn't a published equation, so
 * here there is no HR estimate and the MET estimate is used instead.
 */
export const KEYTEL_COEFFICIENTS = {
  male: { intercept: -55.0969, hr: 0.6309, weightKg: 0.1988, age: 0.2017 },
  female: { intercept: -20.4022, hr: 0.4472, weightKg: -0.1263, age: 0.074 },
} as const;
export const KEYTEL_HR_RANGE = { min: 90, max: 200 } as const;
export const KEYTEL_MAX_KCAL_PER_MIN = 25;
const KJ_PER_KCAL = 4.184;

export interface HrPerson {
  weightKg: number | null;
  age: number | null;
  sex: 'male' | 'female' | null;
}

/**
 * Gross energy (kcal) for a session from its average heart rate, or null when an input is missing or out of
 * range. Gross includes resting energy; `exerciseKcalEstimateHr` takes resting off for energy availability.
 */
export function keytelKcal(durationMin: number, avgHr: number | null, person: HrPerson): number | null {
  const { weightKg, age, sex } = person;
  if (!(durationMin > 0) || avgHr == null || !sex || !(weightKg != null && weightKg > 0) || !(age != null && age > 0)) return null;
  if (avgHr < KEYTEL_HR_RANGE.min || avgHr > KEYTEL_HR_RANGE.max) return null;
  const c = KEYTEL_COEFFICIENTS[sex];
  const kcalPerMin = (c.intercept + c.hr * avgHr + c.weightKg * weightKg + c.age * age) / KJ_PER_KCAL;
  if (!Number.isFinite(kcalPerMin) || kcalPerMin <= 0 || kcalPerMin > KEYTEL_MAX_KCAL_PER_MIN) return null;
  return Math.round(kcalPerMin * durationMin);
}

/**
 * Exercise energy for one session: from average heart rate (Keytel, less one MET of resting energy so it matches
 * the MET estimate's "above resting" basis) when heart rate, weight, age and sex are known, else the MET estimate.
 */
export function exerciseKcalEstimateHr(session: { durationMin: number; feel: number | null; avgHr?: number | null }, bodyweightKg: number, person?: Omit<HrPerson, 'weightKg'> | null): ExerciseEstimate {
  const minutes = Math.max(0, Math.round(session.durationMin));
  const gross = person ? keytelKcal(minutes, session.avgHr ?? null, { ...person, weightKg: bodyweightKg }) : null;
  if (gross == null) return exerciseKcalEstimate(session, bodyweightKg);
  const resting = bodyweightKg * (minutes / 60);
  return { kcal: Math.max(0, Math.round(gross - resting)), source: 'estimate', note: `Estimated from heart rate: ${minutes} min at an average of ${Math.round(session.avgHr!)} bpm` };
}

/**
 * A day's exercise energy: the wearable's active kcal during workouts when there is one, else the estimate summed
 * over that day's sessions (from heart rate when `person` and a session's average HR are known, else METs), else
 * null (rest day or nothing known).
 */
export function exerciseForDay(
  sessions: { durationMin: number; feel: number | null; avgHr?: number | null }[],
  bodyweightKg: number | null,
  wearableWorkoutKcal: number | null,
  person?: Omit<HrPerson, 'weightKg'> | null,
): Pick<EnergyDay, 'exerciseKcal' | 'exerciseSource'> {
  if (wearableWorkoutKcal != null && wearableWorkoutKcal > 0) return { exerciseKcal: Math.round(wearableWorkoutKcal), exerciseSource: 'wearable' };
  if (!sessions.length || bodyweightKg == null) return { exerciseKcal: sessions.length ? null : 0, exerciseSource: null };
  const kcal = sessions.reduce((n, s) => n + exerciseKcalEstimateHr(s, bodyweightKg, person).kcal, 0);
  return { exerciseKcal: kcal, exerciseSource: 'estimate' };
}

/* ---------- where the food number comes from ---------- */

/**
 * One day of food read from the phone's health store (written there by apps like MyMacros).
 * Structural copy of physiology.ts `HealthNutritionDay` (added by the brief builder); kept local so
 * this file builds on its own. TODO-INTEGRATE: switch to the shared type once both are merged.
 */
export interface HealthNutritionDayLike {
  date: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Apps that wrote the food, e.g. ["MyMacros"]. */
  sources: string[];
}

export type IntakeSourcePref = 'health' | 'spotter' | 'auto';
export const INTAKE_SOURCE_LABEL: Record<IntakeSourcePref, string> = {
  auto: 'Apple Health when it has food, else Spotter',
  health: 'Apple Health',
  spotter: 'Logged in Spotter',
};

export interface DayIntake {
  kcal: number | null;
  source: 'health' | 'spotter' | null;
  /** "From MyMacros via Apple Health", "Logged in Spotter", or null when nothing was logged. */
  label: string | null;
}

export function healthSourceLabel(sources: string[], provider = 'Apple Health'): string {
  const apps = [...new Set(sources.map((s) => s.trim()).filter((s) => s && s !== provider && s !== 'Health'))];
  return apps.length ? `From ${apps.join(' and ')} via ${provider}` : `From ${provider}`;
}

/**
 * Which food number a day uses. Never adds the two: many apps write the same food to the health store,
 * and Spotter can write there too, so summing would double-count.
 * - auto: the health store when it has food that day, else Spotter's log
 * - health / spotter: only that source (null when it has nothing)
 */
export function intakeForDay(
  spotterLog: Macros | null,
  health: HealthNutritionDayLike | null,
  pref: IntakeSourcePref,
  provider = 'Apple Health',
): DayIntake {
  const fromHealth: DayIntake | null = health && health.kcal > 0 ? { kcal: Math.round(health.kcal), source: 'health', label: healthSourceLabel(health.sources, provider) } : null;
  const fromSpotter: DayIntake | null = spotterLog && spotterLog.kcal > 0 ? { kcal: Math.round(spotterLog.kcal), source: 'spotter', label: 'Logged in Spotter' } : null;
  const none: DayIntake = { kcal: null, source: null, label: null };
  if (pref === 'health') return fromHealth ?? none;
  if (pref === 'spotter') return fromSpotter ?? none;
  return fromHealth ?? fromSpotter ?? none;
}

/* ---------- energy availability ---------- */

export const EA_CUTOFFS = { adequate: 45, low: 30 } as const;

/** kcal per kg fat-free mass, one decimal. Null when no food was logged (never treated as zero). */
export function energyAvailability(day: EnergyDay, ffmKg: number | null): number | null {
  if (day.intakeKcal == null || ffmKg == null || !(ffmKg > 0)) return null;
  return r1((day.intakeKcal - (day.exerciseKcal ?? 0)) / ffmKg);
}

/** Screening bands, not a diagnosis: 45+ adequate, 30–45 reduced, under 30 low. */
export function eaBand(value: number | null): EaBand {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value >= EA_CUTOFFS.adequate) return 'adequate';
  if (value >= EA_CUTOFFS.low) return 'reduced';
  return 'low';
}

export const EA_BAND_LABEL: Record<EaBand, string> = {
  adequate: 'Adequate (45 or more)',
  reduced: 'Reduced (30 to 45)',
  low: 'Low (under 30)',
  unknown: 'Not enough logged yet',
};

export const FUEL_LEVEL_LABEL: Record<FuelLevel, string> = {
  none: 'Nothing to flag',
  watch: 'Worth watching',
  talk_to_someone: 'Worth talking to someone',
};

/* ---------- the low-energy pattern screen ---------- */

export const FUEL_WINDOW_DAYS = 14;
/** Logged intake days needed before any EA judgement. */
export const FUEL_MIN_LOGGED_DAYS = 5;
export const FUEL_SPARSE_NOTE = 'Log food on a few more days to see this';
export const FUEL_NO_FFM_NOTE = 'Add your body fat %, or choose “Use an estimate”, to see energy availability';

export interface FuelPatternInput {
  today: string;
  days: EnergyDay[];
  ffmKg: number | null;
  cycle: CycleEstimate | null;
  painLogs: PainLog[];
  /** Estimated-max trend over the last 6 weeks, % (from progress.ts). */
  e1rmTrendPct: number | null;
  checks: Pick<DailyCheck, 'date' | 'energy'>[];
  bodyweights: { date: string; kg: number }[];
}

export interface FuelDayRead {
  date: string;
  ea: number | null;
  band: EaBand;
  trained: boolean;
}

/** FuelPattern plus what the screen needs to explain itself. */
export interface FuelCheck extends FuelPattern {
  loggedDays: number;
  /** Each day in the window, oldest first (today left out: it isn't finished). */
  perDay: FuelDayRead[];
  /** Plain words when the EA part can't be judged yet, e.g. FUEL_SPARSE_NOTE. */
  note: string | null;
}

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const REGION_WORD: Record<BodyRegion, string> = {
  neck: 'neck',
  shoulder: 'shoulder',
  elbow: 'elbow',
  wrist: 'wrist',
  upper_back: 'upper back',
  lower_back: 'lower back',
  hip: 'hip',
  knee: 'knee',
  ankle: 'ankle',
  foot: 'foot',
  other: 'one area',
};
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** 90+ days since the last period in a natural or irregular cycle. */
function noPeriod90(cycle: CycleEstimate | null): boolean {
  if (!cycle || (cycle.mode !== 'natural' && cycle.mode !== 'irregular')) return false;
  return (cycle.dayOfCycle != null && cycle.dayOfCycle > 90) || cycle.irregularities.some((s) => /no period/i.test(s));
}

/**
 * Screens for the low-energy (RED-S) pattern: low energy availability together with the signs that
 * tend to come with it. Rules (thresholds live here and in tests):
 * - low_ea: EA under 30 on at least half of the logged days (needs 5+ logged days)
 * - cycle_change: irregularities from the cycle estimate, natural or irregular mode only
 * - injury_repeat: pain in one area on 3+ days in 14, or pain in 2+ areas
 * - performance_drop: estimated max down 5% or more over 6 weeks
 * - energy_mood_low: energy 2 or lower on 5+ daily checks in 14 days
 * - weight_drop: more than 2% bodyweight lost in 4 weeks, only alongside low_ea
 * Level: talk_to_someone = low_ea + any of cycle/injury/performance/weight, or no period for 90+ days;
 * watch = low_ea alone, or reduced EA with 2+ other signs; else none.
 */
export function fuelPattern(input: FuelPatternInput): FuelCheck {
  const t = dayNum(input.today);
  const inWindow = (d: string) => t - dayNum(d) >= 1 && t - dayNum(d) <= FUEL_WINDOW_DAYS;
  const inLast14 = (d: string) => t - dayNum(d) >= 0 && t - dayNum(d) < FUEL_WINDOW_DAYS;

  const byDate = new Map<string, EnergyDay>();
  for (const d of input.days) if (inWindow(d.date)) byDate.set(d.date, d);
  const perDay: FuelDayRead[] = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const ea = energyAvailability(d, input.ffmKg);
      return { date: d.date, ea, band: eaBand(ea), trained: (d.exerciseKcal ?? 0) > 0 || d.exerciseSource != null };
    });
  const logged = perDay.filter((d) => d.ea != null);
  const enough = logged.length >= FUEL_MIN_LOGGED_DAYS;
  const eaAverage = enough ? r1(logged.reduce((n, d) => n + d.ea!, 0) / logged.length) : null;
  const band = eaBand(eaAverage);
  const lowDays = logged.filter((d) => d.ea! < EA_CUTOFFS.low).length;
  const lowEa = enough && lowDays * 2 >= logged.length;

  const signs: FuelSign[] = [];
  if (lowEa) signs.push({ kind: 'low_ea', text: `Energy availability under 30 on ${lowDays} of ${logged.length} logged days` });

  // Cycle changes count only where a regular period is expected.
  const cycle = input.cycle;
  const amenorrhoea = noPeriod90(cycle);
  if (cycle && (cycle.mode === 'natural' || cycle.mode === 'irregular') && (cycle.irregularities.length || amenorrhoea)) {
    const text = cycle.irregularities.length ? cycle.irregularities.join('; ') : 'No period for 90 days or more';
    signs.push({ kind: 'cycle_change', text: `Cycle change: ${text.charAt(0).toLowerCase()}${text.slice(1)}` });
  }

  const pain = input.painLogs.filter((p) => p.level > 0 && inLast14(p.date));
  const daysByRegion = new Map<BodyRegion, Set<string>>();
  for (const p of pain) daysByRegion.set(p.region, (daysByRegion.get(p.region) ?? new Set()).add(p.date));
  const repeat = [...daysByRegion.entries()].sort((a, b) => b[1].size - a[1].size).find(([, d]) => d.size >= 3);
  if (repeat) {
    signs.push({ kind: 'injury_repeat', text: `Pain in the ${REGION_WORD[repeat[0]]} on ${repeat[1].size} days in the last two weeks` });
  } else if (daysByRegion.size >= 2) {
    signs.push({ kind: 'injury_repeat', text: `Pain in ${daysByRegion.size} different areas in the last two weeks` });
  }

  if (input.e1rmTrendPct != null && input.e1rmTrendPct <= -5) {
    signs.push({ kind: 'performance_drop', text: `Estimated max down ${Math.abs(r1(input.e1rmTrendPct))}% over 6 weeks` });
  }

  const recentChecks = input.checks.filter((c) => inLast14(c.date) && c.energy != null);
  const lowEnergy = recentChecks.filter((c) => c.energy! <= 2).length;
  if (lowEnergy >= 5) signs.push({ kind: 'energy_mood_low', text: `Low energy on ${lowEnergy} of ${recentChecks.length} daily checks` });

  if (lowEa) {
    const weights = input.bodyweights.filter((w) => dayNum(w.date) <= t && w.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
    const latest = weights[weights.length - 1];
    const before = weights
      .filter((w) => t - dayNum(w.date) >= 21 && t - dayNum(w.date) <= 35)
      .sort((a, b) => Math.abs(t - dayNum(a.date) - 28) - Math.abs(t - dayNum(b.date) - 28))[0];
    if (latest && before && t - dayNum(latest.date) <= 7) {
      const pct = ((before.kg - latest.kg) / before.kg) * 100;
      if (pct > 2) signs.push({ kind: 'weight_drop', text: `Bodyweight down ${r1(pct)}% in about 4 weeks` });
    }
  }

  const has = (k: FuelSign['kind']) => signs.some((s) => s.kind === k);
  const others = signs.filter((s) => s.kind !== 'low_ea').length;
  let level: FuelLevel = 'none';
  if ((lowEa && (has('cycle_change') || has('injury_repeat') || has('performance_drop') || has('weight_drop'))) || amenorrhoea) {
    level = 'talk_to_someone';
  } else if (lowEa || (band === 'reduced' && others >= 2)) {
    level = 'watch';
  }

  return {
    level,
    signs,
    fixes: fuelFixes({ level, band, lowEa, perDay, ffmKg: input.ffmKg, cycle }),
    eaAverage,
    eaBand: band,
    loggedDays: logged.length,
    perDay,
    note: input.ffmKg == null ? FUEL_NO_FFM_NOTE : enough ? null : FUEL_SPARSE_NOTE,
  };
}

/** Concrete, kind fixes. Food is fuel here: no "good" or "bad" foods, no weight talk. */
function fuelFixes(p: { level: FuelLevel; band: EaBand; lowEa: boolean; perDay: FuelDayRead[]; ffmKg: number | null; cycle: CycleEstimate | null }): string[] {
  const under = p.lowEa || p.band === 'reduced' || p.band === 'low';
  const fixes: string[] = [];
  if (under) {
    // How much more on a training day would bring that day's EA up to 45, rounded and kept modest.
    const training = p.perDay.filter((d) => d.trained && d.ea != null);
    const gap = training.length && p.ffmKg ? (EA_CUTOFFS.adequate - training.reduce((n, d) => n + d.ea!, 0) / training.length) * p.ffmKg : 300;
    const kcal = Math.min(500, Math.max(150, roundTo(gap, 50)));
    fixes.push(`Add about ${kcal} kcal on training days, mostly carbs: a bagel with peanut butter is roughly 300`);
    fixes.push('Eat something with carbs and protein within an hour after training');
    fixes.push('Don’t train fasted before heavy sessions: a banana or toast beforehand is plenty');
    if (p.cycle?.phase === 'luteal') {
      fixes.push('Many people find appetite runs higher in the days before a period. Eating to it on training days is fine');
    }
  }
  if (p.level === 'talk_to_someone') {
    fixes.push('Worth booking a doctor or sports dietitian. Bring: this screen, your period dates, and recent injuries');
  }
  return fixes;
}

/**
 * The fuel check as a factor for the daily read or brief (same shape as signals.ts ReadFactor).
 * Null when there's nothing to flag.
 */
export function fuelFactorFromPattern(p: Pick<FuelPattern, 'level' | 'signs'>): ReadFactor | null {
  if (p.level === 'none') return null;
  const lowEa = p.signs.some((s) => s.kind === 'low_ea');
  if (p.level === 'talk_to_someone') return { kind: 'fuel_low', strain: true, text: 'Fuel check: a low-energy pattern worth talking to someone about' };
  return lowEa
    ? { kind: 'fuel_low', strain: true, text: 'Eating less than training needs on several days lately' }
    : { kind: 'fuel_low', strain: false, text: 'Fuel check: eating a little under what training needs' };
}

/** A training day's calorie target: the coach's base target plus the session's energy, rounded to 50. */
export function trainingDayTargetKcal(baseTarget: number, sessionKcal: number | null): number {
  if (sessionKcal == null || !(sessionKcal > 0)) return baseTarget;
  return baseTarget + roundTo(sessionKcal, 50);
}
