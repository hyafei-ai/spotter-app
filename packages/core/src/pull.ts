import type { ExerciseMetric, ProgramExercise, SessionPlan } from './schemas';

/**
 * Turns rows from GET /sync/pull (snake_case, straight from Postgres) into the client's next
 * session plan: the first day of the active assignment, in week/day order, without a finished session.
 */

export interface PulledRows {
  assignments: { program_id: string; start_date: string; status: string }[];
  program_weeks: { id: string; program_id: string; week_index: number }[];
  program_days: { id: string; program_id: string; week_id: string; day_index: number; title: string; coach_note: string | null }[];
  program_exercises: {
    id: string;
    program_day_id: string;
    exercise_id: string;
    position: number;
    superset_group: string | null;
    metric: ExerciseMetric;
    rest_s: number;
    tempo: string | null;
    note: string | null;
    track_rpe: boolean;
    alternatives: string[];
  }[];
  prescribed_sets: {
    program_exercise_id: string;
    set_index: number;
    reps_min: number | null;
    reps_max: number | null;
    load_type: 'absolute' | 'pct_1rm' | 'rpe' | 'bodyweight';
    load_value: number | null;
    rpe: number | null;
    duration_s: number | null;
    distance_m: number | null;
    amrap: boolean;
  }[];
  progression_rules: { id: string; program_exercise_id: string; condition: { maxRpe?: number | null }; increment: number; unit: 'kg' | 'lb'; sessions_required: number }[];
  exercises: { id: string; name: string }[];
  sessions: { program_day_id: string | null; finished_at: string | null }[];
}

const LB = 0.45359237;

export function nextPlanFromPull(rows: PulledRows, today: string): SessionPlan | null {
  const active = rows.assignments.filter((a) => a.status === 'active' && a.start_date <= today).sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
  if (!active) return null;
  const weekIndex = new Map(rows.program_weeks.map((w) => [w.id, w.week_index]));
  const done = new Set(rows.sessions.filter((s) => s.finished_at && s.program_day_id).map((s) => s.program_day_id));
  const day = rows.program_days
    .filter((d) => d.program_id === active.program_id)
    .sort((a, b) => (weekIndex.get(a.week_id) ?? 0) - (weekIndex.get(b.week_id) ?? 0) || a.day_index - b.day_index)
    .find((d) => !done.has(d.id));
  if (!day) return null;

  const names = new Map(rows.exercises.map((e) => [e.id, e.name]));
  const exercises: ProgramExercise[] = rows.program_exercises
    .filter((pe) => pe.program_day_id === day.id)
    .sort((a, b) => a.position - b.position)
    .map((pe) => {
      const rule = rows.progression_rules.find((r) => r.program_exercise_id === pe.id);
      const sets = rows.prescribed_sets
        .filter((s) => s.program_exercise_id === pe.id)
        .sort((a, b) => a.set_index - b.set_index)
        .map((s) => ({
          index: s.set_index,
          repsMin: s.reps_min,
          repsMax: s.reps_max,
          // %1RM and RPE-based loads need the client's maxes; the logger starts from last time instead.
          loadKg: s.load_type === 'absolute' ? s.load_value : null,
          rpe: s.rpe ?? (s.load_type === 'rpe' ? s.load_value : null),
          durationS: s.duration_s,
          distanceM: s.distance_m,
          amrap: s.amrap,
        }));
      return {
        id: pe.id,
        exerciseId: pe.exercise_id,
        name: names.get(pe.exercise_id) ?? pe.exercise_id,
        metric: pe.metric,
        supersetGroup: pe.superset_group,
        restS: pe.rest_s,
        tempo: pe.tempo,
        note: pe.note,
        trackRpe: pe.track_rpe,
        demoVideoId: null,
        alternatives: pe.alternatives.map((id) => ({ exerciseId: id, name: names.get(id) ?? id })),
        progressionRule: rule
          ? {
              id: rule.id,
              maxRpe: rule.condition.maxRpe ?? null,
              sessionsRequired: rule.sessions_required,
              incrementKg: rule.unit === 'lb' ? rule.increment * LB : rule.increment,
            }
          : null,
        sets,
      };
    })
    .filter((e) => e.sets.length > 0);

  return { programDayId: day.id, title: day.title, scheduledDate: today, coachNote: day.coach_note, exercises };
}
