/*
 * MOCK DATA — the demo client's program and logged history for the Maya Reyes Strength demo tenant.
 * Every number here is invented sample data for the preview build; nothing is a real person's result.
 * Replaced by GET /sync/pull once Supabase is wired in.
 */
import type { LoggedSet, ProgramExercise, SessionPlan } from '../schemas';

const id = (n: number) => `0192f0a1-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const DEMO_CLIENT = { id: id(1), name: 'Jordan Ellis', email: 'jordan.ellis@example.com', threadId: id(2) };

const squat: ProgramExercise = {
  id: id(101),
  exerciseId: 'back-squat',
  name: 'Back Squat',
  metric: 'weight_reps',
  supersetGroup: null,
  restS: 150,
  tempo: '3-1-1',
  note: 'Brace before you unrack. Depth over load.',
  trackRpe: true,
  demoVideoId: 'demo-back-squat',
  alternatives: [{ exerciseId: 'safety-bar-squat', name: 'Safety Bar Squat' }],
  progressionRule: { id: id(901), maxRpe: 8, sessionsRequired: 2, incrementKg: 2.5 },
  sets: [0, 1, 2].map((index) => ({
    index, repsMin: 5, repsMax: 8, loadKg: 80, rpe: 8, durationS: null, distanceM: null, amrap: false,
  })),
};

const rdl: ProgramExercise = {
  id: id(102),
  exerciseId: 'romanian-deadlift',
  name: 'Romanian Deadlift',
  metric: 'weight_reps',
  supersetGroup: null,
  restS: 120,
  tempo: null,
  note: null,
  trackRpe: false,
  demoVideoId: 'demo-rdl',
  alternatives: [{ exerciseId: 'db-rdl', name: 'Dumbbell RDL' }],
  progressionRule: null,
  sets: [0, 1, 2].map((index) => ({
    index, repsMin: 8, repsMax: 10, loadKg: 70, rpe: null, durationS: null, distanceM: null, amrap: false,
  })),
};

const splitSquat: ProgramExercise = {
  id: id(103),
  exerciseId: 'bulgarian-split-squat',
  name: 'Bulgarian Split Squat',
  metric: 'weight_reps',
  supersetGroup: 'A',
  restS: 0,
  tempo: null,
  note: 'Per leg. Dumbbell weight is per hand.',
  trackRpe: false,
  demoVideoId: null,
  alternatives: [],
  progressionRule: null,
  sets: [0, 1, 2].map((index) => ({
    index, repsMin: 10, repsMax: 10, loadKg: 16, rpe: null, durationS: null, distanceM: null, amrap: false,
  })),
};

const kneeRaise: ProgramExercise = {
  id: id(104),
  exerciseId: 'hanging-knee-raise',
  name: 'Hanging Knee Raise',
  metric: 'bodyweight_reps',
  supersetGroup: 'A',
  restS: 90,
  tempo: null,
  note: null,
  trackRpe: false,
  demoVideoId: null,
  alternatives: [{ exerciseId: 'dead-bug', name: 'Dead Bug' }],
  progressionRule: null,
  sets: [0, 1, 2].map((index) => ({
    index, repsMin: 12, repsMax: 12, loadKg: null, rpe: null, durationS: null, distanceM: null, amrap: false,
  })),
};

const carry: ProgramExercise = {
  id: id(105),
  exerciseId: 'farmer-carry',
  name: 'Farmer Carry',
  metric: 'distance',
  supersetGroup: null,
  restS: 60,
  tempo: null,
  note: null,
  trackRpe: false,
  demoVideoId: null,
  alternatives: [],
  progressionRule: null,
  sets: [0, 1].map((index) => ({
    index, repsMin: null, repsMax: null, loadKg: null, rpe: null, durationS: null, distanceM: 40, amrap: false,
  })),
};

export function isoDay(offsetDays = 0, base = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const LOWER_A: SessionPlan = {
  programDayId: id(201),
  title: 'Lower A',
  scheduledDate: isoDay(0),
  coachNote: 'Squats felt fast last week. If the bar moves well on set one, take the suggested jump.',
  exercises: [squat, rdl, splitSquat, kneeRaise, carry],
};

/** Week view for Today and History. `null` = rest day. */
export function demoWeek(): { date: string; plan: SessionPlan | null }[] {
  return [
    { date: isoDay(0), plan: { ...LOWER_A, scheduledDate: isoDay(0) } },
    { date: isoDay(1), plan: null },
  ];
}

/** Two earlier Lower A sessions where every squat set hit 8 reps at ≤ RPE 8, so the rule fires today. */
function past(daysAgo: number, sessionNo: number, squatRpe: [number, number, number]): {
  sessionId: string;
  title: string;
  date: string;
  startedAt: string;
  finishedAt: string;
  feel: number;
  sets: LoggedSet[];
} {
  const date = isoDay(-daysAgo);
  const startedAt = `${date}T17:32:00.000Z`;
  const finishedAt = `${date}T18:31:00.000Z`;
  const sessionId = id(300 + sessionNo);
  let n = 0;
  const mk = (e: ProgramExercise, setIndex: number, weightKg: number | null, reps: number | null, rpe: number | null, distanceM: number | null = null): LoggedSet => ({
    id: id(1000 + sessionNo * 100 + n++),
    sessionId,
    programExerciseId: e.id,
    exerciseId: e.exerciseId,
    setIndex,
    weightKg,
    reps,
    rpe,
    durationS: null,
    distanceM,
    loggedAt: startedAt,
  });
  return {
    sessionId,
    title: 'Lower A',
    date,
    startedAt,
    finishedAt,
    feel: 4,
    sets: [
      mk(squat, 0, 80, 8, squatRpe[0]),
      mk(squat, 1, 80, 8, squatRpe[1]),
      mk(squat, 2, 80, 8, squatRpe[2]),
      mk(rdl, 0, 70, 10, null),
      mk(rdl, 1, 70, 10, null),
      mk(rdl, 2, 70, 9, null),
      mk(splitSquat, 0, 14, 10, null),
      mk(kneeRaise, 0, null, 12, null),
      mk(splitSquat, 1, 14, 10, null),
      mk(kneeRaise, 1, null, 11, null),
      mk(splitSquat, 2, 14, 10, null),
      mk(kneeRaise, 2, null, 10, null),
      mk(carry, 0, null, null, null, 40),
      mk(carry, 1, null, null, null, 40),
    ],
  };
}

export type PastSession = ReturnType<typeof past>;

export const DEMO_HISTORY: PastSession[] = [past(14, 1, [7, 7.5, 8]), past(7, 2, [7, 7.5, 8])];

export const DEMO_UPPER_HISTORY: PastSession[] = [];
