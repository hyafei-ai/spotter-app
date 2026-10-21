/*
 * MOCK DATA — the demo coach's programs and Jordan's assignment, for the preview build.
 * Exercises, loads and schedules are invented sample data, not anyone's real program.
 * Replaced by the programs/assignments tables once Supabase is wired in.
 */
import { DEMO_CLIENTS } from './coach';
import { LOWER_A, isoDay } from './client';
import { STARTER_LIBRARY } from '../library';
import {
  addDays,
  assign,
  cloneDay,
  mondayOf,
  newExercise,
  weekdayOf,
  type Assignment,
  type Program,
  type ProgramDay,
  type ProgramExerciseDef,
  type ProgramSet,
} from '../programs';

/** Deterministic UUID-shaped ids so the seed is identical on every device and in tests. */
function seededIds(prefix: string) {
  let n = 0;
  return () => `${prefix}-0000-7000-8000-${String(++n).padStart(12, '0')}`;
}

/** The demo client in the coach app (Jordan Ellis). The client app runs as this person. */
export const DEMO_PROGRAM_CLIENT_ID = DEMO_CLIENTS[0]!.id;

const lib = (id: string) => STARTER_LIBRARY.find((e) => e.id === id)!;

function sets(n: number, s: Partial<ProgramSet>): ProgramSet[] {
  return Array.from({ length: n }, () => ({
    repsMin: null,
    repsMax: null,
    loadType: 'absolute' as const,
    loadValue: null,
    rpe: null,
    durationS: null,
    distanceM: null,
    amrap: false,
    ...s,
  }));
}

function ex(id: string, newId: () => string, patch: Partial<ProgramExerciseDef>): ProgramExerciseDef {
  return { ...newExercise(lib(id), newId), ...patch };
}

/** Lower A as a program day, keeping the ids the demo history was logged against. */
function lowerA(weekday: number): ProgramDay {
  return {
    id: LOWER_A.programDayId,
    title: LOWER_A.title,
    weekday,
    coachNote: LOWER_A.coachNote,
    exercises: LOWER_A.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      name: e.name,
      metric: e.metric,
      supersetGroup: e.supersetGroup,
      restS: e.restS,
      tempo: e.tempo,
      note: e.note,
      trackRpe: e.trackRpe,
      alternatives: e.alternatives,
      progressionRule: e.progressionRule,
      sets: e.sets.map((s) => ({
        repsMin: s.repsMin,
        repsMax: s.repsMax,
        loadType: e.metric === 'weight_reps' ? ('absolute' as const) : ('bodyweight' as const),
        loadValue: s.loadKg,
        rpe: s.rpe,
        durationS: s.durationS,
        distanceM: s.distanceM,
        amrap: s.amrap,
      })),
    })),
  };
}

function upperA(weekday: number, newId: () => string): ProgramDay {
  return {
    id: newId(),
    title: 'Upper A',
    weekday,
    coachNote: 'Press first while you’re fresh. Rows: pause at the chest.',
    exercises: [
      ex('bench-press', newId, { restS: 150, trackRpe: true, sets: sets(3, { repsMin: 5, repsMax: 8, loadType: 'pct_1rm', loadValue: 0.75, rpe: 8 }) }),
      ex('barbell-row', newId, { restS: 120, sets: sets(3, { repsMin: 8, repsMax: 10, loadValue: 60 }) }),
      ex('overhead-press', newId, { restS: 120, sets: sets(3, { repsMin: 6, repsMax: 8, loadValue: 40 }) }),
      ex('lat-pulldown', newId, { restS: 90, sets: sets(3, { repsMin: 10, repsMax: 12, loadValue: 55 }) }),
      ex('plank', newId, { restS: 60, sets: sets(2, { loadType: 'bodyweight', durationS: 45 }) }),
    ],
  };
}

function fullBody(weekday: number, newId: () => string): ProgramDay {
  return {
    id: newId(),
    title: 'Full Body',
    weekday,
    coachNote: null,
    exercises: [
      ex('deadlift', newId, { restS: 180, trackRpe: true, sets: sets(3, { repsMin: 3, repsMax: 5, loadType: 'rpe', rpe: 8 }) }),
      ex('incline-db-press', newId, { restS: 0, supersetGroup: 'A', sets: sets(3, { repsMin: 10, repsMax: 12, loadValue: 20 }) }),
      ex('chin-up', newId, { restS: 90, supersetGroup: 'A', sets: sets(3, { repsMin: 6, repsMax: 10, loadType: 'bodyweight' }) }),
      ex('farmer-carry', newId, { restS: 60, sets: sets(2, { loadType: 'bodyweight', distanceM: 40 }) }),
    ],
  };
}

export interface DemoPrograms {
  programs: Program[];
  assignments: Assignment[];
}

/**
 * "Strength Base": 4 weeks, 3 days a week, assigned to Jordan so that today is week 3's Lower A.
 * The schedule is laid out around today's weekday so the demo always has a session today.
 */
export function demoPrograms(today = isoDay(0)): DemoPrograms {
  const newId = seededIds('0192f0a3');
  const wd = weekdayOf(today);
  const plus = (n: number) => ((wd - 1 + n) % 7) + 1;
  const week = (current: boolean) => {
    const days = [current ? lowerA(wd) : cloneDay(lowerA(wd), newId), upperA(plus(2), newId), fullBody(plus(4), newId)];
    return { id: newId(), days: days.sort((a, b) => a.weekday - b.weekday) };
  };
  const now = `${today}T08:00:00.000Z`;
  const strength: Program = {
    id: '0192f0a3-0000-7000-8000-a00000000001',
    name: 'Strength Base',
    status: 'published',
    isTemplate: false,
    version: 1,
    source: 'coach',
    weeks: [week(false), week(false), week(true), week(false)],
    updatedAt: now,
  };
  const fullBodyTemplate: Program = {
    id: '0192f0a3-0000-7000-8000-a00000000002',
    name: 'Beginner Full Body',
    status: 'published',
    isTemplate: true,
    version: 1,
    source: 'coach',
    weeks: [{ id: newId(), days: [fullBody(1, newId), { ...fullBody(3, newId), title: 'Full Body B' }, { ...fullBody(5, newId), title: 'Full Body C' }] }],
    updatedAt: now,
  };
  const start = addDays(mondayOf(today), -14);
  const jordan = assign(strength, DEMO_PROGRAM_CLIENT_ID, start, () => '0192f0a3-0000-7000-8000-b00000000001');
  return { programs: [strength, fullBodyTemplate], assignments: [jordan] };
}
