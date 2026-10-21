/*
 * MOCK DATA — inputs for the AI assistant in demo builds (no server, no model).
 * Only Jordan Ellis has logged sets in the sample data, so only Jordan has a week to summarise.
 * Intake answers are invented sample answers in the default intake form's shape.
 */
import { detectRecords, type CheckInSummarySource, type LibraryExercise, type ProgramDraftSource } from '@spotter/core';
import { DEMO_CLIENTS, DEMO_HISTORY, LOWER_A, isoDay } from '@spotter/core/demo';

const DAY = 86_400_000;

/** The summary window: the past week, from the same weekday last week through today. */
export function demoWeek(now = new Date()): { start: string; end: string } {
  return { start: isoDay(-7, now), end: isoDay(0, now) };
}

export function demoSummarySource(clientId: string, now = new Date()): CheckInSummarySource | null {
  const client = DEMO_CLIENTS.find((c) => c.id === clientId);
  if (!client) return null;
  const { start, end } = demoWeek(now);
  const from = Date.parse(`${start}T00:00:00Z`);
  const isJordan = client.id === DEMO_CLIENTS[0]!.id;
  const inWeek = isJordan ? DEMO_HISTORY.filter((s) => Date.parse(s.startedAt) >= from && Date.parse(s.startedAt) <= now.getTime() + DAY) : [];
  const before = isJordan ? DEMO_HISTORY.filter((s) => Date.parse(s.startedAt) < from) : [];
  const exerciseNames = Object.fromEntries(LOWER_A.exercises.map((e) => [e.exerciseId, e.name]));
  const exerciseMetrics = Object.fromEntries(LOWER_A.exercises.map((e) => [e.exerciseId, e.metric]));
  const records = LOWER_A.exercises.flatMap((e) =>
    detectRecords(
      e.exerciseId,
      e.metric,
      before.flatMap((s) => s.sets),
      inWeek.flatMap((s) => s.sets),
    ),
  );
  return {
    client: { id: client.id, fullName: client.name },
    weekStart: start,
    weekEnd: end,
    sessionsPlanned: client.thisWeek.planned,
    sessions: inWeek.map((s) => ({ title: s.title, date: s.date, feel: s.feel, note: null, sets: s.sets })),
    exerciseNames,
    exerciseMetrics,
    records,
    checkIn: null, // the check-ins feature supplies these once it is wired in
  };
}

/** MOCK: sample intake answers per demo client, in the default intake form's keys. */
const INTAKE: Record<string, { goal: string; days: string; equipment: string; injuries: string | null }> = {
  [DEMO_CLIENTS[0]!.id]: { goal: 'Strength', days: '3', equipment: 'Full gym', injuries: null },
  [DEMO_CLIENTS[1]!.id]: { goal: 'Muscle', days: '4', equipment: 'Full gym', injuries: null },
  [DEMO_CLIENTS[2]!.id]: { goal: 'General', days: '2', equipment: 'Home gym', injuries: 'Lower back gets tight after long drives' },
  [DEMO_CLIENTS[3]!.id]: { goal: 'Strength', days: '3', equipment: 'Full gym', injuries: 'Left shoulder: no overhead pressing until cleared' },
  [DEMO_CLIENTS[4]!.id]: { goal: 'Fat loss', days: '3', equipment: 'Dumbbells', injuries: null },
  [DEMO_CLIENTS[5]!.id]: { goal: 'Muscle', days: '4', equipment: 'Full gym', injuries: null },
  [DEMO_CLIENTS[7]!.id]: { goal: 'General', days: '3', equipment: 'Full gym', injuries: 'Right knee aches on deep squats' },
};

export function demoIntake(clientId: string) {
  return INTAKE[clientId] ?? null;
}

/** MOCK: a starter exercise library standing in for the coach's own library. */
export const DEMO_LIBRARY: LibraryExercise[] = [
  ...LOWER_A.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, metric: e.metric, equipment: ['barbell'] })),
  { exerciseId: 'bench-press', name: 'Bench Press', metric: 'weight_reps', equipment: ['barbell', 'bench'] },
  { exerciseId: 'barbell-row', name: 'Barbell Row', metric: 'weight_reps', equipment: ['barbell'] },
  { exerciseId: 'overhead-press', name: 'Overhead Press', metric: 'weight_reps', equipment: ['barbell'] },
  { exerciseId: 'pull-up', name: 'Pull-up', metric: 'bodyweight_reps', equipment: ['bar'] },
  { exerciseId: 'hip-thrust', name: 'Hip Thrust', metric: 'weight_reps', equipment: ['barbell', 'bench'] },
  { exerciseId: 'db-row', name: 'Dumbbell Row', metric: 'weight_reps', equipment: ['dumbbells'] },
  { exerciseId: 'plank', name: 'Plank', metric: 'time', equipment: [] },
];

export function demoProgramSource(clientId: string, weeks: number): ProgramDraftSource | null {
  const client = DEMO_CLIENTS.find((c) => c.id === clientId);
  const intake = demoIntake(clientId);
  if (!client || !intake) return null;
  return {
    client: { id: client.id, fullName: client.name },
    intake: { goal: intake.goal, daysPerWeek: Number(intake.days), equipment: intake.equipment, injuries: intake.injuries, parq: {} },
    weeks,
    library: DEMO_LIBRARY,
    templates: [],
  };
}
