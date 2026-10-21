import { create } from 'zustand';
import { Assignment, Program, dayFor, e1rmByExercise, fromDisplay, resolveDay, type DayLookup, type LoggedSet, type SessionPlan } from '@spotter/core';
import { DEMO_PROGRAM_CLIENT_ID, demoPrograms, isoDay } from '@spotter/core/demo';
import { z } from 'zod';
import { kv } from './storage';
import { tenant } from './env';

/**
 * The client's assigned program. Real builds read `assignments` (with their version snapshots and
 * overrides) from the local cache filled by GET /sync/pull.
 * MOCK: the demo reads what the coach app saved on this device under `spotter.programs.<tenant>`
 * (on the web preview both apps share an origin), else the seeded "Strength Base" assignment.
 */
export const PROGRAMS_KEY = `spotter.programs.${tenant.slug}`;

const Bundle = z.object({ programs: z.array(Program), assignments: z.array(Assignment) });
type Bundle = z.infer<typeof Bundle>;

interface AssignedState {
  loaded: boolean;
  assignment: Assignment | null;
  load(): Promise<void>;
}

export const useAssigned = create<AssignedState>((set) => ({
  loaded: false,
  assignment: null,
  async load() {
    let bundle: Bundle = demoPrograms();
    try {
      const raw = await kv.getItem(PROGRAMS_KEY);
      const parsed = raw ? Bundle.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success) bundle = parsed.data;
    } catch {
      // Unreadable cache: keep the seeded program rather than show nothing.
    }
    const mine = bundle.assignments.find((a) => a.clientId === DEMO_PROGRAM_CLIENT_ID && a.status !== 'ended') ?? null;
    set({ loaded: true, assignment: mine });
  },
}));

void useAssigned.getState().load();

export type TodayLookup = DayLookup | { kind: 'no_program' };

/** What the assigned program says about a date. */
export function lookupDay(date: string = isoDay(0)): TodayLookup {
  const a = useAssigned.getState().assignment;
  return a ? dayFor(a, date) : { kind: 'no_program' };
}

/** The resolved session for a date, with % of 1RM loads worked out from the client's own logged sets. */
export function planFor(date: string, history: Pick<LoggedSet, 'exerciseId' | 'weightKg' | 'reps'>[]): SessionPlan | null {
  const d = lookupDay(date);
  if (d.kind !== 'session') return null;
  return resolveDay(d.day, date, e1rmByExercise(history), fromDisplay(tenant.weightIncrement, tenant.units));
}
