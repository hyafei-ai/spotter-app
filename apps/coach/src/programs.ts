import { useMemo } from 'react';
import { create } from 'zustand';
import { z } from 'zod';
import {
  Assignment,
  LibraryExercise,
  Program,
  STARTER_LIBRARY,
  applyProgramEdit,
  assign,
  cloneProgram,
  customExerciseId,
  dayFor,
  newProgram,
  programProblems,
  publish,
  setOverride,
  uuidv7,
  type ProgramDay,
} from '@spotter/core';
import { demoPrograms, isoDay } from '@spotter/core/demo';
import { tenant } from './env';

/*
 * Programs, the exercise library and assignments for the coach (K-4, K-3).
 * Real builds read and write programs/program_* tables, exercises (tenant rows), assignments,
 * assignment_versions and session_overrides under RLS, and call publish_program() on save.
 * MOCK: the demo keeps everything in localStorage on the web preview (shared with the client app on
 * the same origin, which reads assignments from PROGRAMS_KEY), and in memory on native.
 */
export const PROGRAMS_KEY = `spotter.programs.${tenant.slug}`;
const LIBRARY_KEY = `spotter.programs.${tenant.slug}.library`;
const ls = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

const Bundle = z.object({ programs: z.array(Program), assignments: z.array(Assignment) });

function readBundle(): z.infer<typeof Bundle> {
  try {
    const raw = ls()?.getItem(PROGRAMS_KEY);
    const parsed = raw ? Bundle.safeParse(JSON.parse(raw)) : null;
    if (parsed?.success) return parsed.data;
  } catch {
    // fall through to the seed
  }
  return demoPrograms();
}

function readLibrary(): LibraryExercise[] {
  try {
    const raw = ls()?.getItem(LIBRARY_KEY);
    const parsed = raw ? z.array(LibraryExercise).safeParse(JSON.parse(raw)) : null;
    if (parsed?.success) return parsed.data;
  } catch {
    // fall through
  }
  return [];
}

/**
 * MOCK: whether the demo client has already started today's session, read from the client app's
 * saved state on the same origin. Real builds ask the server (sessions.started_at for today).
 */
function clientStartedToday(): boolean {
  try {
    const raw = ls()?.getItem('spotter.app');
    const state = raw ? (JSON.parse(raw) as { state?: { active?: { plan?: { scheduledDate?: string } } | null; completed?: { date: string }[] } }).state : null;
    const today = isoDay(0);
    return state?.active?.plan?.scheduledDate === today || !!state?.completed?.some((c) => c.date === today);
  } catch {
    return false;
  }
}

/** What a draft edits: a program, or one client's session on one date ("Edit today's session"). */
export type DraftTarget = { type: 'program' } | { type: 'override'; assignmentId: string; date: string };

export interface Draft {
  program: Program;
  target: DraftTarget;
  dirty: boolean;
}

interface ProgramsState {
  programs: Program[];
  assignments: Assignment[];
  custom: LibraryExercise[];
  drafts: Record<string, Draft>;

  library(): LibraryExercise[];
  /** Opens an editing copy of one client's session on a date; returns the draft key. */
  editSession(assignmentId: string, date: string): string | null;
  change(key: string, program: Program): void;
  discard(key: string): void;
  /** Saves a draft: publishes programs (edits reach assignments from the next unstarted session) or stores the override. */
  save(key: string, opts?: { publish?: boolean }): { ok: true } | { ok: false; problems: string[] };
  createProgram(name?: string): string;
  /** Adds a ready-made program (e.g. an AI draft) as an unpublished draft. */
  importProgram(p: Program): string;
  duplicate(programId: string): string;
  remove(programId: string): boolean;
  assignTo(programId: string, clientIds: string[], startDate: string): void;
  endAssignment(assignmentId: string): void;
  clearOverride(assignmentId: string, date: string): void;
  addCustomExercise(input: Omit<LibraryExercise, 'id' | 'isCustom'>): LibraryExercise;
  updateCustomExercise(ex: LibraryExercise): void;
  setDemoVideos(matches: { exerciseId: string; fileName: string }[]): void;
}

function persist(s: Pick<ProgramsState, 'programs' | 'assignments' | 'custom'>) {
  ls()?.setItem(PROGRAMS_KEY, JSON.stringify({ programs: s.programs, assignments: s.assignments }));
  ls()?.setItem(LIBRARY_KEY, JSON.stringify(s.custom));
}

export const usePrograms = create<ProgramsState>((set, get) => {
  const seed = readBundle();
  return {
    programs: seed.programs,
    assignments: seed.assignments,
    custom: readLibrary(),
    drafts: {},

    library() {
      return mergeLibrary(get().custom);
    },

    editSession(assignmentId, date) {
      const a = get().assignments.find((x) => x.id === assignmentId);
      if (!a) return null;
      const key = `override:${assignmentId}:${date}`;
      if (get().drafts[key]) return key;
      const d = dayFor(a, date);
      const base: ProgramDay =
        d.kind === 'session' ? d.day : { id: uuidv7(), title: 'Extra session', weekday: 1, coachNote: null, exercises: [] };
      // Fresh ids: an override is its own day, so it never collides with the program's rows.
      const day: ProgramDay = {
        ...base,
        id: uuidv7(),
        exercises: base.exercises.map((e) => ({ ...e, id: uuidv7(), sets: e.sets.map((s) => ({ ...s })) })),
      };
      const program: Program = {
        id: key,
        name: base.title,
        status: 'draft',
        isTemplate: false,
        version: 1,
        source: 'coach',
        weeks: [{ id: `${key}:week`, days: [day] }],
        updatedAt: new Date().toISOString(),
      };
      set({ drafts: { ...get().drafts, [key]: { program, target: { type: 'override', assignmentId, date }, dirty: false } } });
      return key;
    },

    change(key, program) {
      // The first change to a saved program opens its draft; overrides always have one already.
      const d = get().drafts[key] ?? (get().programs.some((p) => p.id === key) ? { program, target: { type: 'program' as const }, dirty: true } : null);
      if (!d) return;
      set({ drafts: { ...get().drafts, [key]: { ...d, program: { ...program, updatedAt: new Date().toISOString() }, dirty: true } } });
    },

    discard(key) {
      const drafts = { ...get().drafts };
      delete drafts[key];
      set({ drafts });
    },

    save(key, opts = {}) {
      const d = get().drafts[key];
      if (!d) return { ok: false, problems: ['Nothing to save.'] };
      if (d.target.type === 'override') {
        const day = d.program.weeks[0]!.days[0]!;
        if (day.exercises.length === 0) return { ok: false, problems: ['Add at least one exercise, or remove the edit instead.'] };
        const { assignmentId, date } = d.target;
        const assignments = get().assignments.map((a) => (a.id === assignmentId ? setOverride(a, date, day) : a));
        set({ assignments });
        persist(get());
        get().discard(key);
        return { ok: true };
      }
      const wantsLive = opts.publish || d.program.status === 'published';
      if (wantsLive) {
        const problems = programProblems(d.program).map((p) => p.message);
        if (problems.length) return { ok: false, problems };
      }
      const saved = wantsLive ? publish(d.program) : d.program;
      const today = isoDay(0);
      const started = clientStartedToday();
      const assignments =
        saved.status === 'published' ? get().assignments.map((a) => applyProgramEdit(a, saved, today, started)) : get().assignments;
      set({ programs: get().programs.map((p) => (p.id === saved.id ? saved : p)), assignments });
      persist(get());
      get().discard(key);
      return { ok: true };
    },

    createProgram(name = 'New program') {
      const p = newProgram(name);
      set({ programs: [p, ...get().programs] });
      persist(get());
      return p.id;
    },

    importProgram(p) {
      set({ programs: [p, ...get().programs.filter((x) => x.id !== p.id)] });
      persist(get());
      return p.id;
    },

    duplicate(programId) {
      const src = get().programs.find((p) => p.id === programId);
      if (!src) return programId;
      const copy = cloneProgram(src, `${src.name} (copy)`);
      set({ programs: [copy, ...get().programs] });
      persist(get());
      return copy.id;
    },

    remove(programId) {
      if (get().assignments.some((a) => a.programId === programId && a.status !== 'ended')) return false;
      set({ programs: get().programs.filter((p) => p.id !== programId) });
      persist(get());
      get().discard(programId);
      return true;
    },

    assignTo(programId, clientIds, startDate) {
      const program = get().programs.find((p) => p.id === programId);
      if (!program || program.status !== 'published') return;
      // A client follows one program at a time: the old assignment ends when the new one is made.
      const ended = get().assignments.map((a) => (clientIds.includes(a.clientId) && a.status !== 'ended' ? { ...a, status: 'ended' as const } : a));
      const added = clientIds.map((c) => assign(program, c, startDate));
      set({ assignments: [...ended, ...added] });
      persist(get());
    },

    endAssignment(assignmentId) {
      set({ assignments: get().assignments.map((a) => (a.id === assignmentId ? { ...a, status: 'ended' as const } : a)) });
      persist(get());
    },

    clearOverride(assignmentId, date) {
      set({ assignments: get().assignments.map((a) => (a.id === assignmentId ? setOverride(a, date, null) : a)) });
      persist(get());
    },

    addCustomExercise(input) {
      const taken = new Set(get().library().map((e) => e.id));
      const ex: LibraryExercise = { ...input, id: customExerciseId(input.name, tenant.slug, taken), isCustom: true };
      set({ custom: [...get().custom, ex] });
      persist(get());
      return ex;
    },

    updateCustomExercise(ex) {
      const exists = get().custom.some((c) => c.id === ex.id);
      set({ custom: exists ? get().custom.map((c) => (c.id === ex.id ? ex : c)) : [...get().custom, ex] });
      persist(get());
    },

    setDemoVideos(matches) {
      const lib = new Map(get().library().map((e) => [e.id, e]));
      let custom = [...get().custom];
      for (const m of matches) {
        const ex = lib.get(m.exerciseId);
        if (!ex) continue;
        const next = { ...ex, demoVideo: m.fileName };
        custom = custom.some((c) => c.id === ex.id) ? custom.map((c) => (c.id === ex.id ? next : c)) : [...custom, next];
      }
      set({ custom });
      persist(get());
    },
  };
});

export const activeAssignmentFor = (assignments: Assignment[], clientId: string) =>
  assignments.find((a) => a.clientId === clientId && a.status !== 'ended') ?? null;

export const assignedCount = (assignments: Assignment[], programId: string) =>
  assignments.filter((a) => a.programId === programId && a.status !== 'ended').length;


/** Starter library plus the coach's own rows; a coach's row (or their demo video on a built-in) wins. */
export function mergeLibrary(custom: LibraryExercise[]): LibraryExercise[] {
  const byId = new Map(STARTER_LIBRARY.map((e) => [e.id, e]));
  for (const c of custom) byId.set(c.id, c);
  return [...byId.values()];
}

export function useLibrary(): LibraryExercise[] {
  const custom = usePrograms((s) => s.custom);
  return useMemo(() => mergeLibrary(custom), [custom]);
}

/** The program as being edited (draft if there is one, else as saved). */
export function useEditing(key: string): { program: Program | null; draft: Draft | null } {
  const draft = usePrograms((s) => s.drafts[key] ?? null);
  const saved = usePrograms((s) => s.programs.find((p) => p.id === key) ?? null);
  return { program: draft?.program ?? saved, draft };
}
