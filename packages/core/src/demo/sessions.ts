/*
 * MOCK DATA: sessions the client app's demo can swap in for today (Me → Demo → Today's session), so every block kind
 * can be run in the logger without a coach building it first. Coach-style sample sessions, not anyone's real plan.
 */
import { blocksFromTemplate, newMovement, newWorkoutBlock } from '../blocks';
import { templateById } from '../templates';
import type { Block, BlockMovement, SessionPlan } from '../schemas';
import { LOWER_A } from './client';

export const DEMO_SESSION_KINDS = ['metcon', 'amrap', 'wod', 'tabata', 'intervals', 'race'] as const;
export type DemoSessionKind = (typeof DEMO_SESSION_KINDS)[number];

export const DEMO_SESSION_LABEL: Record<DemoSessionKind, string> = {
  metcon: 'Strength + finisher',
  amrap: 'AMRAP',
  wod: 'Benchmark + EMOM',
  tabata: 'Tabata + interval AMRAP',
  intervals: 'Intervals',
  race: 'Race simulation',
};

/** Deterministic ids per kind, so a resumed session finds the same blocks. */
function ids(kind: DemoSessionKind) {
  const base = 300 + DEMO_SESSION_KINDS.indexOf(kind) * 40;
  let n = 0;
  return () => `0192f0a6-0000-7000-8000-${String(base + ++n).padStart(12, '0')}`;
}

const mv = (newId: () => string, movementId: string, name: string, f: Partial<BlockMovement> = {}) => newMovement({ name, movementId, ...f }, newId);

export function demoSessionPlan(kind: DemoSessionKind, date: string): SessionPlan {
  const newId = ids(kind);
  const programDayId = newId();
  const plan = (title: string, blocks: Block[], coachNote: string | null, exercises: SessionPlan['exercises'] = [], brief?: SessionPlan['brief']): SessionPlan => ({
    programDayId,
    title,
    scheduledDate: date,
    coachNote,
    exercises,
    blocks,
    ...(brief ? { brief } : {}),
  });
  switch (kind) {
    case 'metcon': {
      const exercises = LOWER_A.exercises.slice(0, 2);
      return plan(
        'Lower A + finisher',
        [
          { id: newId(), kind: 'strength', title: null, note: null, scoring: 'load', timeCapSec: null, templateId: null, exerciseIds: exercises.map((e) => e.id) },
          { ...newWorkoutBlock('amrap', newId), title: 'Finisher', durationSec: 8 * 60, movements: [mv(newId, 'burpee', 'Burpee', { reps: 8 }), mv(newId, 'wall-ball', 'Wall Ball', { reps: 12, loadKg: 6, loadKgAlt: 4 })] } as Block,
        ],
        'Squats first, then empty the tank on the finisher.',
        exercises,
      );
    }
    case 'amrap':
      return plan(
        'Engine AMRAP',
        [{ ...newWorkoutBlock('amrap', newId), durationSec: 12 * 60, movements: [mv(newId, 'burpee', 'Burpee', { reps: 10 }), mv(newId, 'wall-ball', 'Wall Ball', { reps: 15, loadKg: 6, loadKgAlt: 4 }), mv(newId, 'rower', 'Row Erg', { calories: 12, caloriesAlt: 10 })] } as Block],
        'Steady from the first round. Count rounds with the big button.',
      );
    case 'wod':
      return plan(
        'Fran day',
        [
          { ...blocksFromTemplate(templateById('benchmark.fran')!, newId).blocks[0]!, timeCapSec: 10 * 60 } as Block,
          { ...newWorkoutBlock('emom', newId), title: null, rounds: 8, movements: [mv(newId, 'power-clean', 'Power Clean', { reps: 3, loadKg: 50 })] } as Block,
        ],
        null,
        [],
        // MOCK: a Strategy & Stimulus the coach approved (an AI draft they edited), as the client sees it.
        {
          stimulus: 'Fran should feel fast and short: hard breathing, burning legs, over in a few minutes. The EMOM after is technique, not fitness.',
          strategy: 'Break the 21s early, before you have to (for example 11 and 10), then go unbroken if you can on the 9s. Power cleans: same speed on the last minute as the first.',
        },
      );
    case 'tabata':
      return plan(
        'Tabata + interval AMRAP',
        [
          { ...newWorkoutBlock('tabata', newId), movements: [mv(newId, 'air-squat', 'Air Squat')] } as Block,
          { ...newWorkoutBlock('rest', newId), durationSec: 120 } as Block,
          { ...newWorkoutBlock('interval_amrap', newId), rounds: 3, workSec: 180, restSec: 60 } as Block,
        ],
        null,
      );
    case 'intervals':
      return plan(
        'Threshold kilometres',
        [{ ...newWorkoutBlock('intervals', newId), title: null, reps: 5, distanceM: 1000, restSec: 120, target: { kind: 'pace', secPerKm: 270 } } as Block],
        'Even pace: the last rep as good as the first.',
      );
    case 'race': {
      const sim = blocksFromTemplate(templateById('race.half.singles.open_women')!, newId).blocks[0]!;
      return plan('Half race simulation', [{ ...sim, title: 'Half race sim' } as Block], 'Race rehearsal: calm first 200 m off every station.');
    }
  }
}
