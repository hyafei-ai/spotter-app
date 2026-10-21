import { z } from 'zod';
import { uuidv7 } from './ids';
import { estimatedOneRepMax } from './records';
import { roundToIncrement } from './units';
import { ExerciseMetric, ProgressionRule, type LoggedSet, type ProgramExercise, type SessionPlan } from './schemas';

export * from './library';

/**
 * Program builder model (K-4): program → weeks → days → exercises → sets.
 * The client app never sees this shape directly; `resolveDay` turns one day into the
 * SessionPlan the logger runs, with % of 1RM loads resolved from the client's own history.
 */

export const LoadType = z.enum(['absolute', 'pct_1rm', 'rpe', 'bodyweight']);
export type LoadType = z.infer<typeof LoadType>;

export const LOAD_TYPE_LABEL: Record<LoadType, string> = {
  absolute: 'Weight',
  pct_1rm: '% 1RM',
  rpe: 'RPE',
  bodyweight: 'Bodyweight',
};

export const ProgramSet = z.object({
  repsMin: z.number().int().min(0).max(100).nullable(),
  repsMax: z.number().int().min(0).max(100).nullable(),
  loadType: LoadType,
  /** kg for absolute, 0–1.2 for pct_1rm, unused for rpe/bodyweight */
  loadValue: z.number().min(0).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  durationS: z.number().int().min(0).nullable(),
  distanceM: z.number().min(0).nullable(),
  amrap: z.boolean(),
});
export type ProgramSet = z.infer<typeof ProgramSet>;

export const ProgramExerciseDef = z.object({
  id: z.string(),
  exerciseId: z.string(),
  name: z.string().min(1),
  metric: ExerciseMetric,
  /** Exercises sharing a group, next to each other, run as a superset/circuit. */
  supersetGroup: z.string().nullable(),
  restS: z.number().int().min(0).max(900),
  tempo: z.string().max(12).nullable(),
  note: z.string().max(300).nullable(),
  trackRpe: z.boolean(),
  alternatives: z.array(z.object({ exerciseId: z.string(), name: z.string() })),
  progressionRule: ProgressionRule.nullable(),
  sets: z.array(ProgramSet),
});
export type ProgramExerciseDef = z.infer<typeof ProgramExerciseDef>;

export const ProgramDay = z.object({
  id: z.string(),
  title: z.string(),
  /** 1 = Monday … 7 = Sunday */
  weekday: z.number().int().min(1).max(7),
  coachNote: z.string().max(500).nullable(),
  exercises: z.array(ProgramExerciseDef),
});
export type ProgramDay = z.infer<typeof ProgramDay>;

export const ProgramWeek = z.object({ id: z.string(), days: z.array(ProgramDay) });
export type ProgramWeek = z.infer<typeof ProgramWeek>;

export const ProgramStatus = z.enum(['draft', 'published', 'archived']);
export type ProgramStatus = z.infer<typeof ProgramStatus>;

export const Program = z.object({
  id: z.string(),
  name: z.string(),
  status: ProgramStatus,
  isTemplate: z.boolean(),
  version: z.number().int().min(1),
  /** Where it came from: 'ai_draft' marks an AI program draft awaiting the coach's review. */
  source: z.enum(['coach', 'ai_draft', 'import']),
  weeks: z.array(ProgramWeek),
  updatedAt: z.string(),
});
export type Program = z.infer<typeof Program>;

/* ---------- assignment ---------- */

/**
 * A program as it was when a version took effect. Edits to a live program apply to future
 * sessions only: each save adds a version effective from the next session not yet started.
 */
export const AssignmentVersion = z.object({ effectiveFrom: z.string(), version: z.number().int(), program: Program });
export type AssignmentVersion = z.infer<typeof AssignmentVersion>;

export const Assignment = z.object({
  id: z.string(),
  clientId: z.string(),
  programId: z.string(),
  startDate: z.string(),
  status: z.enum(['active', 'paused', 'ended']),
  versions: z.array(AssignmentVersion).min(1),
  /** "Edit today's session": one-off replacements keyed by ISO date. */
  overrides: z.record(z.string(), ProgramDay),
});
export type Assignment = z.infer<typeof Assignment>;

/* ---------- dates (ISO yyyy-mm-dd, timezone-free) ---------- */

const DAY_MS = 86_400_000;
const parseDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
export const isoFromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoFromUtc(parseDay(iso) + n * DAY_MS);
/** 1 = Monday … 7 = Sunday */
export const weekdayOf = (iso: string) => ((new Date(parseDay(iso)).getUTCDay() + 6) % 7) + 1;
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Monday of the week containing `iso`. */
export const mondayOf = (iso: string) => addDays(iso, -(weekdayOf(iso) - 1));

/** Which program week a date falls in (0-based), counting calendar weeks from the start date's week. */
export function weekIndexFor(startDate: string, date: string): number {
  return Math.floor((parseDay(mondayOf(date)) - parseDay(mondayOf(startDate))) / (7 * DAY_MS));
}

/* ---------- lookups ---------- */

export function versionFor(a: Assignment, date: string): AssignmentVersion {
  const sorted = [...a.versions].sort((x, y) => x.effectiveFrom.localeCompare(y.effectiveFrom));
  let pick = sorted[0]!;
  for (const v of sorted) if (v.effectiveFrom <= date) pick = v;
  return pick;
}

export type DayLookup =
  | { kind: 'session'; day: ProgramDay; weekIndex: number; overridden: boolean }
  | { kind: 'rest'; weekIndex: number }
  | { kind: 'not_started' }
  | { kind: 'finished' }
  | { kind: 'paused' };

export function dayFor(a: Assignment, date: string): DayLookup {
  if (a.status === 'paused') return { kind: 'paused' };
  if (a.status === 'ended') return { kind: 'finished' };
  if (date < a.startDate) return { kind: 'not_started' };
  const weekIndex = weekIndexFor(a.startDate, date);
  const override = a.overrides[date];
  if (override) return { kind: 'session', day: override, weekIndex, overridden: true };
  const program = versionFor(a, date).program;
  if (weekIndex >= program.weeks.length) return { kind: 'finished' };
  const day = program.weeks[weekIndex]!.days.find((d) => d.weekday === weekdayOf(date));
  return day ? { kind: 'session', day, weekIndex, overridden: false } : { kind: 'rest', weekIndex };
}

/** Best estimated 1RM per exercise from real logged sets (never invented). */
export function e1rmByExercise(sets: Pick<LoggedSet, 'exerciseId' | 'weightKg' | 'reps'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sets) {
    if (s.weightKg == null || s.reps == null) continue;
    const e = estimatedOneRepMax(s.weightKg, s.reps);
    if (e != null && e > (out[s.exerciseId] ?? 0)) out[s.exerciseId] = e;
  }
  return out;
}

/** Load in kg for one prescribed set, or null when the client picks it (RPE, bodyweight, or no 1RM yet). */
export function resolveLoadKg(set: ProgramSet, e1rm: number | undefined, incrementKg: number): number | null {
  switch (set.loadType) {
    case 'absolute':
      return set.loadValue;
    case 'pct_1rm':
      if (set.loadValue == null || e1rm == null) return null;
      return roundToIncrement(e1rm * set.loadValue, incrementKg);
    default:
      return null;
  }
}

/** One program day → the SessionPlan the client's logger runs on `date`. */
export function resolveDay(day: ProgramDay, date: string, e1rm: Record<string, number>, incrementKg = 2.5): SessionPlan {
  return {
    programDayId: day.id,
    title: day.title.trim() || 'Session',
    scheduledDate: date,
    coachNote: day.coachNote,
    exercises: day.exercises.map(
      (e): ProgramExercise => ({
        id: e.id,
        exerciseId: e.exerciseId,
        name: e.name,
        metric: e.metric,
        supersetGroup: e.supersetGroup,
        restS: e.restS,
        tempo: e.tempo,
        note: e.note,
        trackRpe: e.trackRpe || e.sets.some((s) => s.loadType === 'rpe'),
        demoVideoId: null,
        alternatives: e.alternatives,
        progressionRule: e.progressionRule,
        sets: e.sets.map((s, index) => ({
          index,
          repsMin: s.repsMin,
          repsMax: s.repsMax,
          loadKg: e.metric === 'weight_reps' ? resolveLoadKg(s, e1rm[e.exerciseId], incrementKg) : null,
          rpe: s.rpe,
          durationS: s.durationS,
          distanceM: s.distanceM,
          amrap: s.amrap,
        })),
      }),
    ),
  };
}

/* ---------- editing ---------- */

export const emptySet = (metric: ExerciseMetric): ProgramSet => ({
  repsMin: metric === 'weight_reps' || metric === 'bodyweight_reps' ? 8 : null,
  repsMax: metric === 'weight_reps' || metric === 'bodyweight_reps' ? 10 : null,
  loadType: metric === 'weight_reps' ? 'absolute' : 'bodyweight',
  loadValue: null,
  rpe: null,
  durationS: metric === 'time' ? 30 : null,
  distanceM: metric === 'distance' ? 20 : null,
  amrap: false,
});

export function newExercise(ex: { id: string; name: string; metric: ExerciseMetric }, newId: () => string = uuidv7): ProgramExerciseDef {
  return {
    id: newId(),
    exerciseId: ex.id,
    name: ex.name,
    metric: ex.metric,
    supersetGroup: null,
    restS: ex.metric === 'weight_reps' ? 120 : 60,
    tempo: null,
    note: null,
    trackRpe: false,
    alternatives: [],
    progressionRule: null,
    sets: [0, 1, 2].map(() => emptySet(ex.metric)),
  };
}

export function newDay(weekday: number, title: string, newId: () => string = uuidv7): ProgramDay {
  return { id: newId(), title, weekday, coachNote: null, exercises: [] };
}

export function newProgram(name: string, now = new Date().toISOString(), newId: () => string = uuidv7): Program {
  return { id: newId(), name, status: 'draft', isTemplate: false, version: 1, source: 'coach', weeks: [{ id: newId(), days: [] }], updatedAt: now };
}

/** Copies get fresh ids everywhere so they can live side by side in the database. */
export function cloneDay(day: ProgramDay, newId: () => string = uuidv7): ProgramDay {
  return {
    ...day,
    id: newId(),
    exercises: day.exercises.map((e) => ({
      ...e,
      id: newId(),
      sets: e.sets.map((s) => ({ ...s })),
      alternatives: e.alternatives.map((a) => ({ ...a })),
      progressionRule: e.progressionRule ? { ...e.progressionRule, id: newId() } : null,
    })),
  };
}

export function cloneWeek(week: ProgramWeek, newId: () => string = uuidv7): ProgramWeek {
  return { id: newId(), days: week.days.map((d) => cloneDay(d, newId)) };
}

export function cloneProgram(p: Program, name: string, now = new Date().toISOString(), newId: () => string = uuidv7): Program {
  return { ...p, id: newId(), name, status: 'draft', version: 1, source: 'coach', updatedAt: now, weeks: p.weeks.map((w) => cloneWeek(w, newId)) };
}

/** Swap item `index` with its neighbour; returns the same list when the move isn't possible. */
export function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (index < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[index], out[j]] = [out[j]!, out[index]!];
  return out;
}

export function findDay(p: Program, dayId: string): { week: ProgramWeek; weekIndex: number; day: ProgramDay } | null {
  for (let i = 0; i < p.weeks.length; i++) {
    const day = p.weeks[i]!.days.find((d) => d.id === dayId);
    if (day) return { week: p.weeks[i]!, weekIndex: i, day };
  }
  return null;
}

export const updateDay = (p: Program, dayId: string, fn: (d: ProgramDay) => ProgramDay): Program => ({
  ...p,
  weeks: p.weeks.map((w) => ({ ...w, days: w.days.map((d) => (d.id === dayId ? fn(d) : d)) })),
});

export function findExercise(p: Program, peId: string): { day: ProgramDay; weekIndex: number; exercise: ProgramExerciseDef; index: number } | null {
  for (let wi = 0; wi < p.weeks.length; wi++)
    for (const d of p.weeks[wi]!.days) {
      const index = d.exercises.findIndex((e) => e.id === peId);
      if (index >= 0) return { day: d, weekIndex: wi, exercise: d.exercises[index]!, index };
    }
  return null;
}

export const updateExercise = (p: Program, peId: string, fn: (e: ProgramExerciseDef) => ProgramExerciseDef): Program => ({
  ...p,
  weeks: p.weeks.map((w) => ({
    ...w,
    days: w.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => (e.id === peId ? fn(e) : e)) })),
  })),
});

/** Copy a week to the end of the program, or over week `toIndex`. */
export function copyWeek(p: Program, weekId: string, toIndex?: number, newId: () => string = uuidv7): Program {
  const src = p.weeks.find((w) => w.id === weekId);
  if (!src) return p;
  const copy = cloneWeek(src, newId);
  if (toIndex == null || toIndex >= p.weeks.length) return { ...p, weeks: [...p.weeks, copy] };
  return { ...p, weeks: p.weeks.map((w, i) => (i === toIndex ? copy : w)) };
}

/** Copy a day into a week (on the same weekday unless one is given), replacing what's there. */
export function copyDay(p: Program, dayId: string, toWeekIndex: number, weekday?: number, newId: () => string = uuidv7): Program {
  const found = findDay(p, dayId);
  const target = p.weeks[toWeekIndex];
  if (!found || !target) return p;
  const copy = { ...cloneDay(found.day, newId), weekday: weekday ?? found.day.weekday };
  const days = [...target.days.filter((d) => d.weekday !== copy.weekday), copy].sort((a, b) => a.weekday - b.weekday);
  return { ...p, weeks: p.weeks.map((w, i) => (i === toWeekIndex ? { ...w, days } : w)) };
}

/** Re-letters superset groups A, B, C… in order and drops groups of one. */
export function relabelSupersets(exercises: ProgramExerciseDef[]): ProgramExerciseDef[] {
  const counts = new Map<string, number>();
  for (const e of exercises) if (e.supersetGroup) counts.set(e.supersetGroup, (counts.get(e.supersetGroup) ?? 0) + 1);
  const map = new Map<string, string>();
  let next = 0;
  return exercises.map((e) => {
    if (!e.supersetGroup || (counts.get(e.supersetGroup) ?? 0) < 2) return { ...e, supersetGroup: null };
    if (!map.has(e.supersetGroup)) map.set(e.supersetGroup, String.fromCharCode(65 + next++));
    return { ...e, supersetGroup: map.get(e.supersetGroup)! };
  });
}

/** Joins exercise `index` and the next one into a superset, or splits them if they're already joined. */
export function toggleSupersetWithNext(day: ProgramDay, index: number): ProgramDay {
  const a = day.exercises[index];
  const b = day.exercises[index + 1];
  if (!a || !b) return day;
  const exercises = [...day.exercises];
  if (a.supersetGroup && a.supersetGroup === b.supersetGroup) {
    // Split after `a`: the rest of the run gets a new group of its own.
    const tail = `split-${index}`;
    for (let i = index + 1; i < exercises.length && exercises[i]!.supersetGroup === a.supersetGroup; i++) {
      exercises[i] = { ...exercises[i]!, supersetGroup: tail };
    }
  } else {
    const group = a.supersetGroup ?? b.supersetGroup ?? `join-${index}`;
    // Inside a superset only the last exercise rests; the first goes straight into the next.
    exercises[index] = { ...a, supersetGroup: group, restS: 0 };
    exercises[index + 1] = { ...b, supersetGroup: group };
  }
  return { ...day, exercises: relabelSupersets(exercises) };
}

/** Apply set `index`'s prescription to every set of the exercise. */
export function applySetToAll(e: ProgramExerciseDef, index: number): ProgramExerciseDef {
  const src = e.sets[index];
  return src ? { ...e, sets: e.sets.map(() => ({ ...src })) } : e;
}

/**
 * Bulk progression across weeks (web table editor): each later week's loads for `exerciseId` are set
 * from week `fromIndex` plus the step per week (absolute loads by `stepKg`, % 1RM by `stepPct`).
 * Sets are matched by position against the first session in the base week that has the exercise;
 * a week's set is left alone when its load type differs from the base set's.
 */
export function progressAcrossWeeks(p: Program, exerciseId: string, fromIndex: number, stepKg: number, stepPct: number): Program {
  const baseSets = p.weeks[fromIndex]?.days.flatMap((d) => d.exercises).find((e) => e.exerciseId === exerciseId)?.sets;
  if (!baseSets || baseSets.length === 0) return p;
  return {
    ...p,
    weeks: p.weeks.map((w, wi) => {
      if (wi <= fromIndex) return w;
      const n = wi - fromIndex;
      return {
        ...w,
        days: w.days.map((d) => ({
          ...d,
          exercises: d.exercises.map((e) =>
            e.exerciseId !== exerciseId
              ? e
              : {
                  ...e,
                  sets: e.sets.map((s, si) => {
                    const base = baseSets[Math.min(si, baseSets.length - 1)]!;
                    if (base.loadType !== s.loadType || base.loadValue == null) return s;
                    if (s.loadType === 'absolute') return { ...s, loadValue: Math.round((base.loadValue + n * stepKg) * 100) / 100 };
                    if (s.loadType === 'pct_1rm') return { ...s, loadValue: Math.round((base.loadValue + n * stepPct) * 1000) / 1000 };
                    return s;
                  }),
                },
          ),
        })),
      };
    }),
  };
}

/* ---------- describing ---------- */

export function describeSet(s: ProgramSet, metric: ExerciseMetric, unit: 'kg' | 'lb' = 'kg'): string {
  if (metric === 'time') return `${s.durationS ?? 0} s`;
  if (metric === 'distance') return `${s.distanceM ?? 0} m`;
  const reps = s.amrap
    ? 'AMRAP'
    : s.repsMin != null && s.repsMax != null && s.repsMin !== s.repsMax
      ? `${s.repsMin}–${s.repsMax}`
      : `${s.repsMax ?? s.repsMin ?? '?'}`;
  let load = '';
  if (metric === 'weight_reps') {
    if (s.loadType === 'absolute' && s.loadValue != null) load = ` · ${s.loadValue} ${unit}`;
    if (s.loadType === 'pct_1rm' && s.loadValue != null) load = ` · ${Math.round(s.loadValue * 1000) / 10}% 1RM`;
  }
  const rpe = s.rpe != null ? ` @ RPE ${s.rpe}` : '';
  return `${reps}${load}${rpe}`;
}

/** "3 × 8–10 · 80 kg @ RPE 8", collapsing identical sets. */
export function describeExercise(e: ProgramExerciseDef, unit: 'kg' | 'lb' = 'kg'): string {
  if (e.sets.length === 0) return 'No sets yet';
  const texts = e.sets.map((s) => describeSet(s, e.metric, unit));
  return texts.every((t) => t === texts[0]) ? `${e.sets.length} × ${texts[0]}` : texts.join(', ');
}

export function programSummary(p: Program): string {
  const weeks = p.weeks.length;
  const perWeek = Math.max(0, ...p.weeks.map((w) => w.days.length));
  return `${weeks} week${weeks === 1 ? '' : 's'} · ${perWeek} day${perWeek === 1 ? '' : 's'} a week`;
}

/* ---------- validation ---------- */

export interface ProgramProblem {
  where: { weekIndex?: number; dayId?: string; exerciseId?: string };
  message: string;
}

export function programProblems(p: Program): ProgramProblem[] {
  const out: ProgramProblem[] = [];
  if (!p.name.trim()) out.push({ where: {}, message: 'Give the program a name.' });
  if (p.weeks.length === 0) out.push({ where: {}, message: 'Add at least one week.' });
  else if (!p.weeks.some((w) => w.days.length > 0)) out.push({ where: {}, message: 'Add at least one training day.' });
  p.weeks.forEach((w, wi) => {
    const weekdays = new Set<number>();
    for (const d of w.days) {
      const at = `Week ${wi + 1}, ${WEEKDAY_LONG[d.weekday - 1]}`;
      const where = { weekIndex: wi, dayId: d.id };
      if (weekdays.has(d.weekday)) out.push({ where, message: `${at} has two sessions.` });
      weekdays.add(d.weekday);
      if (!d.title.trim()) out.push({ where, message: `${at} needs a name.` });
      if (d.exercises.length === 0) out.push({ where, message: `${at} has no exercises.` });
      for (const e of d.exercises) {
        const ex = `${at}, ${e.name}`;
        const at3 = { ...where, exerciseId: e.id };
        if (e.sets.length === 0) out.push({ where: at3, message: `${ex} has no sets.` });
        e.sets.forEach((s, si) => {
          if (s.repsMin != null && s.repsMax != null && s.repsMin > s.repsMax)
            out.push({ where: at3, message: `${ex}, set ${si + 1}: the rep range is backwards.` });
          if (s.loadType === 'pct_1rm' && (s.loadValue == null || s.loadValue <= 0 || s.loadValue > 1.2))
            out.push({ where: at3, message: `${ex}, set ${si + 1}: % of 1RM should be between 1 and 120.` });
          if (s.loadType === 'rpe' && s.rpe == null) out.push({ where: at3, message: `${ex}, set ${si + 1}: set a target RPE.` });
        });
        if (e.progressionRule && !e.sets.some((s) => s.repsMax != null))
          out.push({ where: at3, message: `${ex}: the progression rule needs a rep target.` });
      }
    }
  });
  return out;
}

/** Publishing a draft keeps version 1; saving a live program bumps the version. */
export function publish(p: Program, now = new Date().toISOString()): Program {
  return { ...p, status: 'published', version: p.status === 'draft' ? p.version : p.version + 1, updatedAt: now };
}

/* ---------- assignment helpers ---------- */

export function assign(program: Program, clientId: string, startDate: string, newId: () => string = uuidv7): Assignment {
  return {
    id: newId(),
    clientId,
    programId: program.id,
    startDate,
    status: 'active',
    versions: [{ effectiveFrom: startDate, version: program.version, program }],
    overrides: {},
  };
}

/**
 * Saving a live program: an assignment gets the new version from the next session that hasn't
 * started. If today's session is already under way (or done), the change starts tomorrow.
 */
export function applyProgramEdit(a: Assignment, program: Program, today: string, todayStarted: boolean): Assignment {
  if (a.programId !== program.id || a.status === 'ended') return a;
  const from = todayStarted ? addDays(today, 1) : today;
  const effectiveFrom = from < a.startDate ? a.startDate : from;
  return {
    ...a,
    versions: [...a.versions.filter((v) => v.effectiveFrom < effectiveFrom), { effectiveFrom, version: program.version, program }],
  };
}

export function setOverride(a: Assignment, date: string, day: ProgramDay | null): Assignment {
  const overrides = { ...a.overrides };
  if (day) overrides[date] = day;
  else delete overrides[date];
  return { ...a, overrides };
}

/* ---------- AI drafts (K-2) ---------- */

/** Training days spread across the week so rest days fall between sessions. */
export const SPREAD_WEEKDAYS: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

interface AiDraftShape {
  name: string;
  weeks: { days: { title: string; coachNote: string | null; exercises: SessionPlan['exercises'] }[] }[];
}

/**
 * Turns an AI program draft (weeks → days → session-plan exercises) into an unpublished program the
 * coach edits in the builder. Loads the model left empty stay empty for the coach to set.
 */
export function programFromAiDraft(draft: AiDraftShape, now = new Date().toISOString(), newId: () => string = uuidv7): Program {
  return {
    id: newId(),
    name: draft.name,
    status: 'draft',
    isTemplate: false,
    version: 1,
    source: 'ai_draft',
    updatedAt: now,
    weeks: draft.weeks.map((w) => {
      const weekdays = SPREAD_WEEKDAYS[Math.min(7, Math.max(1, w.days.length))] ?? [1];
      return {
        id: newId(),
        days: w.days.slice(0, 7).map((d, i) => ({
          id: newId(),
          title: d.title,
          weekday: weekdays[i] ?? i + 1,
          coachNote: d.coachNote,
          exercises: d.exercises.map((e) => ({
            id: newId(),
            exerciseId: e.exerciseId,
            name: e.name,
            metric: e.metric,
            supersetGroup: e.supersetGroup,
            restS: Math.min(900, e.restS),
            tempo: e.tempo,
            note: e.note,
            trackRpe: e.trackRpe,
            alternatives: e.alternatives,
            progressionRule: e.progressionRule,
            sets: e.sets.map((s) => ({
              repsMin: s.repsMin,
              repsMax: s.repsMax,
              loadType: e.metric === 'weight_reps' ? (s.loadKg == null && s.rpe != null ? 'rpe' : 'absolute') : 'bodyweight',
              loadValue: e.metric === 'weight_reps' ? s.loadKg : null,
              rpe: s.rpe,
              durationS: s.durationS,
              distanceM: s.distanceM,
              amrap: s.amrap,
            })),
          })),
        })),
      };
    }),
  };
}
