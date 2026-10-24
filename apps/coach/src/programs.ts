import { useMemo } from 'react';
import { create } from 'zustand';
import { z } from 'zod';
import {
  Assignment,
  LibraryExercise,
  Program,
  STARTER_LIBRARY,
  addBlocksToDay,
  applyProgramEdit,
  assign,
  buildDayBriefInput,
  cloneDay,
  cloneProgram,
  customExerciseId,
  dayBlocks,
  dayFor,
  dayHasContent,
  dayWantsBrief,
  describeExercise,
  findLibraryExercise,
  isSingleSessions,
  migrateDay,
  migrateProgram,
  mockDayBrief,
  newDay,
  newProgram,
  programProblems,
  publish,
  setOverride,
  singleSessionsProgram,
  updateDay,
  weekdayOf,
  type Block,
  type DayBriefState,
  type ExerciseMetric,
  type ProgramDay,
  type StrengthLine,
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

/** Programs saved before blocks are read as v2 days (lossless: exercises are kept exactly; core migrateDay). */
function migrateBundle(b: z.infer<typeof Bundle>): z.infer<typeof Bundle> {
  return {
    programs: b.programs.map(migrateProgram),
    assignments: b.assignments.map((a) => ({
      ...a,
      versions: a.versions.map((v) => ({ ...v, program: migrateProgram(v.program) })),
      overrides: Object.fromEntries(Object.entries(a.overrides).map(([d, day]) => [d, migrateDay(day)])),
    })),
  };
}

function readBundle(): z.infer<typeof Bundle> {
  try {
    const raw = ls()?.getItem(PROGRAMS_KEY);
    const parsed = raw ? Bundle.safeParse(JSON.parse(raw)) : null;
    if (parsed?.success) return migrateBundle(parsed.data);
  } catch {
    // fall through to the seed
  }
  return migrateBundle(demoPrograms());
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
  save(key: string, opts?: { publish?: boolean }): { ok: true; briefDrafts?: number } | { ok: false; problems: string[] };
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
  /** A pasted strength line → a library exercise (adds the coach's own exercise when the name isn't in the library). */
  exerciseFor(line: StrengthLine): { id: string; name: string; metric: ExerciseMetric };
  /** Send one session to clients on a date (each client's "Edit today's session" for that date). */
  sendSession(clientIds: string[], date: string, input: { title: string; blocks: Block[]; strength: StrengthLine[] }): { sent: string[]; skipped: string[] };
  /** Save pasted or template blocks as a new draft program, one day this week. */
  programFromBlocks(name: string, input: { blocks: Block[]; strength: StrengthLine[] }): string;
  /** Strategy & Stimulus: set, approve or clear a day's brief. Approved text reaches clients from the next session. */
  setDayBrief(programId: string, dayId: string, brief: DayBriefState | null): void;
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
        d.kind === 'session' ? d.day : newDay(1, 'Extra session');
      // Fresh ids: an override is its own day, so it never collides with the program's rows (blocks follow).
      const day: ProgramDay = cloneDay(base);
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
        if (!dayHasContent(day)) return { ok: false, problems: ['Add something to the session, or remove the edit instead.'] };
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
      const saved = wantsLive ? withBriefDrafts(publish(d.program)) : d.program;
      const briefCount = (p: Program) => p.weeks.reduce((n, w) => n + w.days.filter((x) => x.brief?.status === 'draft').length, 0);
      const briefDrafts = Math.max(0, briefCount(saved) - briefCount(d.program));
      const today = isoDay(0);
      const started = clientStartedToday();
      const assignments =
        saved.status === 'published' ? get().assignments.map((a) => applyProgramEdit(a, saved, today, started)) : get().assignments;
      set({ programs: get().programs.map((p) => (p.id === saved.id ? saved : p)), assignments });
      persist(get());
      get().discard(key);
      return { ok: true, briefDrafts };
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

    exerciseFor(line) {
      const lib = get().library();
      const hit = (line.movementId ? lib.find((e) => e.id === line.movementId) : null) ?? findLibraryExercise(lib, line.name);
      if (hit) return { id: hit.id, name: hit.name, metric: hit.metric };
      const made = get().addCustomExercise({ name: line.name.slice(0, 80), metric: 'weight_reps', tags: [], equipment: [], demoVideo: null });
      return { id: made.id, name: made.name, metric: made.metric };
    },

    sendSession(clientIds, date, input) {
      const sent: string[] = [];
      const skipped: string[] = [];
      let assignments = get().assignments;
      let programs = get().programs;
      for (const clientId of clientIds) {
        let a = assignments.find((x) => x.clientId === clientId && x.status === 'active');
        if (!a && assignments.some((x) => x.clientId === clientId && x.status === 'paused')) {
          skipped.push(clientId);
          continue;
        }
        if (!a) {
          // No program: a "single sessions" program (no weeks) carries sessions sent one date at a time.
          let holder = programs.find(isSingleSessions);
          if (!holder) {
            holder = singleSessionsProgram(tenant.coach.name.split(' ')[0] ?? 'your coach');
            programs = [...programs, holder];
          }
          a = assign(holder, clientId, date);
          assignments = [...assignments, a];
        }
        // Fresh ids per client: each override is its own day.
        const base = newDay(weekdayOf(date), input.title.trim() || 'Session');
        const day = addBlocksToDay(base, { blocks: input.blocks.map((b) => ({ ...b })), strength: input.strength }, (l) => get().exerciseFor(l));
        assignments = assignments.map((x) => (x.id === a.id ? setOverride(x, date, cloneDay(day)) : x));
        sent.push(clientId);
      }
      set({ assignments, programs });
      persist(get());
      return { sent, skipped };
    },

    programFromBlocks(name, input) {
      const p = newProgram(name || 'New program');
      const day = addBlocksToDay(newDay(1, name || 'Session'), input, (l) => get().exerciseFor(l));
      const program: Program = { ...p, weeks: [{ ...p.weeks[0]!, days: [day] }] };
      set({ programs: [program, ...get().programs] });
      persist(get());
      return program.id;
    },

    setDayBrief(programId, dayId, brief) {
      const apply = (p: Program): Program => updateDay(p, dayId, (d) => ({ ...d, brief }));
      const draft = get().drafts[programId];
      const saved = get().programs.find((p) => p.id === programId);
      if (draft) set({ drafts: { ...get().drafts, [programId]: { ...draft, program: apply(draft.program) } } });
      if (saved) {
        const next = apply(saved);
        // A brief is words for the client, not a program change: live programs pass it on without a new version.
        const assignments = next.status === 'published' ? get().assignments.map((a) => applyProgramEdit(a, next, isoDay(0), clientStartedToday())) : get().assignments;
        set({ programs: get().programs.map((p) => (p.id === programId ? next : p)), assignments });
        persist(get());
      }
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

/**
 * On publish, each day with conditioning, intervals or race work and no Strategy & Stimulus yet gets a draft.
 * MOCK (demo): mockDayBrief from the day's blocks. Real builds call the ai-day-brief Edge Function per day
 * (TODO-INTEGRATE); either way it's a draft until the coach approves it in the day editor.
 */
function withBriefDrafts(p: Program): Program {
  return {
    ...p,
    weeks: p.weeks.map((w) => ({
      ...w,
      days: w.days.map((d) => {
        if (d.brief || !dayWantsBrief(d)) return d;
        const exercises = Object.fromEntries(d.exercises.map((e) => [e.id, { name: e.name, prescription: describeExercise(e) }]));
        const out = mockDayBrief(buildDayBriefInput({ title: d.title, coachNote: d.coachNote, blocks: dayBlocks(d), exercises, units: tenant.units }));
        return { ...d, brief: { ...out, status: 'draft' as const, source: 'ai' as const, updatedAt: new Date().toISOString() } };
      }),
    })),
  };
}

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
