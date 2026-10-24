import { STARTER_LIBRARY } from './library';
import { relativePerformance, sessionBestE1rms } from './calibration';
import { healthSourceLabel } from './fuel';
import { isMobilityActivity, mergeMobility, type MobilitySession } from './mobility';
import { SHORT_SLEEP_HOURS, sessionLoad, type CyclePhase, type DailyCheck } from './signals';
import { resultLine, scoreValue } from './blocks';
import type { BlockKind, BlockResult, BlockScore, BlockSplit, ScoringMode } from './schemas';
import { dedupeImported, hrvStatus, importedWorkoutLoad, maxObservedHr, restingHrStatus, RESTING_HR_HIGH_BPM } from './wearables';
import {
  IMPORTED_ACTIVITY_LABEL,
  type BodyRegion,
  type CalibrationSession,
  type CycleEstimate,
  type HealthNutritionDay,
  type ImportedWorkout,
  type PainLog,
  type WearableDay,
} from './physiology';

/**
 * The client's unified daily record (docs/features/patterns.md): one row per day across training (logged
 * and imported), recovery (sleep, HRV, resting HR against the client's own baseline), mobility, nutrition,
 * cycle (only when the caller passes a shared `phaseOn`), pain and the daily check. The coach's
 * all-clients grid reads `rosterCell`, and the personal pattern finder (patterns.ts) reads a history of these.
 *
 * Nothing here is new physiology: each field comes from the existing rule in signals.ts, wearables.ts,
 * fuel.ts or calibration.ts, so a day reads the same everywhere.
 */

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- muscle groups ---------- */

const LIB_TAGS: Record<string, string[]> = Object.fromEntries(STARTER_LIBRARY.map((e) => [e.id, e.tags]));
export const MUSCLE_GROUPS = ['legs', 'posterior chain', 'push', 'pull', 'core'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export const MUSCLE_GROUP_WORDS: Record<MuscleGroup, string> = {
  legs: 'Leg',
  'posterior chain': 'Hinge',
  push: 'Push',
  pull: 'Pull',
  core: 'Core',
};

/** The main group an exercise trains, from the starter library's first tag. Unknown and custom exercises: null. */
export function mainMuscleGroup(exerciseId: string): MuscleGroup | null {
  const tag = LIB_TAGS[exerciseId]?.[0];
  return tag && (MUSCLE_GROUPS as readonly string[]).includes(tag) ? (tag as MuscleGroup) : null;
}

/* ---------- the day ---------- */

export interface TimelineSession {
  source: 'spotter' | 'imported';
  title: string;
  minutes: number;
  /** Minutes × session RPE (signals.ts sessionLoad; importedWorkoutLoad for imported ones, an estimate). */
  load: number;
  /** Sets with RPE 7 or more, or with no RPE logged (Spotter logs working sets). 0 for imported workouts. */
  hardSets: number;
  /** Main groups trained (Spotter sessions with library exercises). */
  muscles?: string[];
  /** Mean logged set RPE, else from the finish-screen feel; imported: the HR-based estimate. */
  rpe: number | null;
  /** Start hour on the client's clock (0–23), when known. */
  hour?: number | null;
  /** Lifts against the client's own rolling baseline, % (calibration.ts relativePerformance). Spotter only. */
  deltaPct?: number | null;
  /** Best estimated 1RM per exercise this session, kg. Spotter only. */
  bests?: Record<string, number>;
  /** Hard sets per main group. Spotter only. */
  groupSets?: Record<string, number>;
  /** Scored blocks (WODs, intervals, race sims) in this session. Spotter only; absent for strength-only sessions. */
  scores?: TimelineScore[];
}

/** One block result as the timeline keeps it (docs/features/multisport-core.md). */
export interface TimelineScore {
  key: string;
  label: string;
  kind: BlockKind;
  scoring: ScoringMode;
  /** Bigger is better (blocks.ts scoreValue); null when there's nothing to compare. */
  value: number | null;
  /** "Fran 4:12", "5 × 1 km avg 4:31/km". */
  text: string;
  timeSec: number | null;
  score: BlockScore;
  splits: BlockSplit[];
}

export interface ClientDay {
  date: string;
  training: { sessions: TimelineSession[]; load: number };
  recovery: {
    sleepHours: number | null;
    hrvMs: number | null;
    restingHr: number | null;
    /** Today's HRV ÷ the client's 28-day baseline (same source), e.g. 0.86. Null without a baseline. */
    hrvVsBaseline: number | null;
    /** Today's resting HR minus the 28-day baseline, bpm. */
    rhrVsBaseline: number | null;
    /** HRV more than 1 SD under the baseline (wearables.ts rule). Null without a baseline. */
    hrvLow: boolean | null;
  };
  mobility: { minutes: number; sessions: number };
  nutrition: {
    kcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    /** kcal ÷ target, e.g. 0.92. Null without a target or a log. */
    vsTarget: number | null;
    /** carbs ÷ carb target, when both are known. */
    carbsVsTarget?: number | null;
    /** "From MyMacros via Apple Health", "Logged in Spotter". */
    source: string | null;
  };
  /** Null unless the caller passed the cycle (only when the client shares it). */
  cycle: { phase: CyclePhase | null; day: number | null } | null;
  pain: { region: BodyRegion; level: number }[];
  check: { energy: number | null; soreness: number | null; stress: number | null } | null;
}

export interface TimelineSessionInput extends CalibrationSession {
  title?: string;
  durationMin?: number | null;
  /** Block results logged in the session (WOD scores, interval and race splits). */
  blocks?: Pick<BlockResult, 'key' | 'label' | 'kind' | 'scoring' | 'score' | 'splits' | 'rpe'>[];
  /** Start time on the client's clock ("2026-10-20T07:30…"); only the hour is read, as written. */
  startedAt?: string | null;
  id?: string;
}

export interface TimelineInputs {
  sessions: TimelineSessionInput[];
  imported?: ImportedWorkout[];
  wearables?: WearableDay[];
  /** Food totals from the health app (one source per day, never summed with Spotter's log). */
  healthNutrition?: HealthNutritionDay[];
  /** Food logged in Spotter, per day; used when the health app has nothing that day. */
  spotterNutrition?: { date: string; kcal: number; proteinG: number; carbsG: number }[];
  targets?: { kcal: number | null; carbsG?: number | null } | null;
  /** Pass only when the client shares the cycle with whoever reads the timeline. */
  phaseOn?: ((date: string) => CycleEstimate) | null;
  pain?: PainLog[];
  checks?: Pick<DailyCheck, 'date' | 'sleepHours' | 'energy' | 'soreness' | 'stress'>[];
  mobility?: MobilitySession[];
  /** "Apple Health" / "Health Connect", for nutrition labels. */
  provider?: string;
}

/** Minutes for a Spotter session without a recorded duration: about 2.5 minutes per logged set. An estimate. */
export const MINUTES_PER_SET_ESTIMATE = 2.5;
const FEEL_RPE = (feel: number | null) => (feel == null ? null : sessionLoad(1, feel));

function hourOf(startedAt: string | null | undefined): number | null {
  const m = startedAt?.match(/T(\d{2}):/);
  return m ? Number(m[1]) : null;
}

function spotterSession(s: TimelineSessionInput, deltaPct: number | null): TimelineSession {
  const blocks = s.blocks ?? [];
  const blockMin = blocks.reduce((a, b) => a + (b.score.timeSec ?? b.splits.reduce((x, sp) => x + sp.sec, 0)) / 60, 0);
  const minutes = Math.round(s.durationMin ?? s.sets.length * MINUTES_PER_SET_ESTIMATE + blockMin);
  const rpes = [...s.sets.map((x) => x.rpe), ...blocks.map((b) => b.rpe)].filter((x): x is number => x != null);
  const rpe = rpes.length ? r1(rpes.reduce((a, b) => a + b, 0) / rpes.length) : FEEL_RPE(s.feel);
  const hard = s.sets.filter((x) => x.rpe == null || x.rpe >= 7);
  const groupSets: Record<string, number> = {};
  for (const set of hard) {
    const g = mainMuscleGroup(set.exerciseId);
    if (g) groupSets[g] = (groupSets[g] ?? 0) + 1;
  }
  const bests: Record<string, number> = {};
  for (const [id, e] of sessionBestE1rms(s)) bests[id] = r1(e);
  return {
    source: 'spotter',
    title: s.title ?? 'Session',
    minutes,
    load: sessionLoad(minutes, s.feel, rpes.length ? rpe : null),
    hardSets: hard.length,
    muscles: Object.keys(groupSets),
    rpe,
    hour: hourOf(s.startedAt),
    deltaPct: deltaPct == null ? null : r1(deltaPct),
    bests,
    groupSets,
    ...(blocks.length
      ? {
          scores: blocks.map((b) => ({
            key: b.key,
            label: b.label,
            kind: b.kind,
            scoring: b.scoring,
            value: scoreValue(b),
            text: resultLine(b),
            timeSec: b.score.timeSec,
            score: b.score,
            splits: b.splits,
          })),
        }
      : {}),
  };
}

/** One ClientDay per date from `from` to `to` inclusive, oldest first. */
export function buildTimeline(inputs: TimelineInputs, from: string, to: string): ClientDay[] {
  const start = dayNum(from);
  const end = dayNum(to);
  if (end < start) return [];
  const provider = inputs.provider ?? 'Apple Health';

  // Training: Spotter sessions with relative performance; imported workouts that aren't the same session and aren't mobility.
  const perf = relativePerformance(inputs.sessions);
  const spans = inputs.sessions
    .filter((s) => s.startedAt && s.durationMin && s.id)
    .map((s) => ({ sessionId: s.id!, startedAt: s.startedAt!, finishedAt: new Date(Date.parse(s.startedAt!) + s.durationMin! * 60_000).toISOString() }));
  const imported = inputs.imported ?? [];
  const separate = dedupeImported(imported, spans).separate;
  const maxHr = maxObservedHr(imported);
  const sessionsOn = new Map<string, TimelineSession[]>();
  const push = (date: string, s: TimelineSession) => sessionsOn.set(date, [...(sessionsOn.get(date) ?? []), s]);
  for (const { session, deltaPct } of perf) push(session.date, spotterSession(session, deltaPct));
  for (const w of separate) {
    if (isMobilityActivity(w.activity)) continue;
    const l = importedWorkoutLoad(w, maxHr);
    push(w.date, {
      source: 'imported',
      title: w.sourceApp ? `${IMPORTED_ACTIVITY_LABEL[w.activity]} · ${w.sourceApp}` : IMPORTED_ACTIVITY_LABEL[w.activity],
      minutes: Math.round(w.durationMin),
      load: l.load,
      hardSets: 0,
      rpe: l.rpe,
      hour: hourOf(w.startedAt),
    });
  }

  const wearables = inputs.wearables ?? [];
  const mobility = mergeMobility(inputs.mobility ?? [], imported);
  const checks = new Map((inputs.checks ?? []).map((c) => [c.date, c]));
  const health = new Map((inputs.healthNutrition ?? []).map((d) => [d.date, d]));
  const spotterFood = new Map((inputs.spotterNutrition ?? []).map((d) => [d.date, d]));
  const target = inputs.targets ?? null;

  const out: ClientDay[] = [];
  for (let n = start; n <= end; n++) {
    const date = isoOf(n);
    const sessions = sessionsOn.get(date) ?? [];
    const hrv = wearables.length ? hrvStatus(wearables, date) : null;
    const rhr = wearables.length ? restingHrStatus(wearables, date) : null;
    const wearSleep = wearables.find((w) => w.date === date && w.sleepHours != null)?.sleepHours ?? null;
    const check = checks.get(date) ?? null;

    const h = health.get(date);
    const sp = spotterFood.get(date);
    const food =
      h && h.kcal != null && h.kcal > 0
        ? { kcal: Math.round(h.kcal), proteinG: h.proteinG, carbsG: h.carbsG, source: healthSourceLabel(h.sources, provider) }
        : sp && sp.kcal > 0
          ? { kcal: Math.round(sp.kcal), proteinG: sp.proteinG, carbsG: sp.carbsG, source: 'Logged in Spotter' }
          : { kcal: null, proteinG: null, carbsG: null, source: null };

    let cycle: ClientDay['cycle'] = null;
    if (inputs.phaseOn) {
      try {
        const e = inputs.phaseOn(date);
        cycle = { phase: e.confidence === 'none' ? null : e.phase, day: e.dayOfCycle };
      } catch {
        cycle = { phase: null, day: null };
      }
    }

    const mob = mobility.filter((m) => m.date === date);
    out.push({
      date,
      training: { sessions, load: sessions.reduce((a, s) => a + s.load, 0) },
      recovery: {
        sleepHours: wearSleep ?? check?.sleepHours ?? null,
        hrvMs: hrv?.today ?? null,
        restingHr: rhr?.today ?? null,
        hrvVsBaseline: hrv?.today != null && hrv.baseline ? r2(hrv.today / hrv.baseline) : null,
        rhrVsBaseline: rhr?.delta ?? null,
        hrvLow: hrv && hrv.status !== 'unknown' ? hrv.status === 'low' : null,
      },
      mobility: { minutes: mob.reduce((a, m) => a + m.minutes, 0), sessions: mob.length },
      nutrition: {
        ...food,
        vsTarget: food.kcal != null && target?.kcal ? r2(food.kcal / target.kcal) : null,
        carbsVsTarget: food.carbsG != null && target?.carbsG ? r2(food.carbsG / target.carbsG) : null,
      },
      cycle,
      pain: (inputs.pain ?? []).filter((p) => p.date === date && p.level > 0).map((p) => ({ region: p.region, level: p.level })),
      check: check ? { energy: check.energy, soreness: check.soreness, stress: check.stress } : null,
    });
  }
  return out;
}

/* ---------- the all-clients grid ---------- */

export type RosterFlag = 'short_sleep' | 'low_hrv' | 'pain' | 'under_fuelled';
export interface RosterCell {
  trained: boolean;
  /** Same rule as the daily read: 2+ strain signals ease, 1 watch, 0 steady. Null with nothing to read. */
  tone: 'steady' | 'watch' | 'ease' | null;
  flags: RosterFlag[];
}

/** Under this share of the calorie target counts as under-fuelled (signals.ts fuelStatus uses the same 75%). */
export const UNDER_FUELLED_SHARE = 0.75;

/**
 * A compact status for one client on one day. Strain signals: short sleep (under 6.5 h), low HRV,
 * resting HR 5+ bpm over usual, pain at 4/10 or more, under 75% of the calorie target, and the check's
 * soreness ≥ 4, energy ≤ 2, stress ≥ 4. Flags name the first four kinds so the grid can show icons.
 */
export function rosterCell(day: ClientDay): RosterCell {
  const flags: RosterFlag[] = [];
  const r = day.recovery;
  if (r.sleepHours != null && r.sleepHours < SHORT_SLEEP_HOURS) flags.push('short_sleep');
  if (r.hrvLow) flags.push('low_hrv');
  if (day.pain.length) flags.push('pain');
  if (day.nutrition.vsTarget != null && day.nutrition.vsTarget < UNDER_FUELLED_SHARE) flags.push('under_fuelled');
  let strain = 0;
  if (flags.includes('short_sleep')) strain++;
  if (flags.includes('low_hrv')) strain++;
  if (r.rhrVsBaseline != null && r.rhrVsBaseline >= RESTING_HR_HIGH_BPM) strain++;
  if (day.pain.some((p) => p.level >= 4)) strain++;
  if (flags.includes('under_fuelled')) strain++;
  const c = day.check;
  if (c?.soreness != null && c.soreness >= 4) strain++;
  if (c?.energy != null && c.energy <= 2) strain++;
  if (c?.stress != null && c.stress >= 4) strain++;
  const anything = r.sleepHours != null || r.hrvMs != null || r.restingHr != null || c != null || day.pain.length > 0 || day.nutrition.kcal != null;
  const tone: RosterCell['tone'] = !anything ? null : strain >= 2 ? 'ease' : strain === 1 ? 'watch' : 'steady';
  return { trained: day.training.sessions.length > 0, tone, flags };
}
