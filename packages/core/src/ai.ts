import { z } from 'zod';
import { evaluateProgression, type ExerciseSessionResult, type ProgressionSuggestion } from './progression';
import type { ExerciseMetric, LoggedSet, ProgramExercise, ProgressionRule } from './schemas';

/**
 * AI assistant (K-2). Everything here is pure and shared by the coach app (demo mode) and the
 * Edge Functions (copied by packages/db/scripts/sync-schemas.mjs).
 *
 * Rules:
 *  - Input builders pick the minimum fields each prompt needs. No names, emails, photo URLs or
 *    photo ids ever reach a prompt; free text is passed through `redact` first.
 *  - Every output is a draft. Nothing reaches a client without a coach tap (enforced in SQL).
 */

/* ---------- redaction ---------- */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const PHONE = /(?:\+?\d[\s().-]?){7,}\d/g;

/** Strips emails, links and phone numbers from free text and caps its length. */
export function redact(text: string | null | undefined, max = 600): string | null {
  if (!text) return null;
  const clean = text.replace(EMAIL, '[email]').replace(URL_RE, '[link]').replace(PHONE, '[phone]').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/* ---------- check-in summary ---------- */

/** What the app or function has on hand. Deliberately wider than what the prompt receives. */
export interface CheckInSummarySource {
  client: { id: string; fullName: string; email?: string | null };
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;
  sessionsPlanned: number;
  sessions: { title: string; date: string; feel: number | null; note: string | null; sets: LoggedSet[] }[];
  exerciseNames: Record<string, string>;
  exerciseMetrics?: Record<string, ExerciseMetric>;
  records: { exerciseId: string; type: 'heaviest' | 'e1rm' | 'most_reps'; value: number; previous: number }[];
  checkIn: {
    submittedAt: string | null;
    bodyweightKg: number | null;
    previousBodyweightKg: number | null;
    sleepHours: number | null;
    stress: number | null; // 1–5
    adherence: number | null; // 1–5, self-reported
    freeText: string | null;
    photoIds: string[];
    photoUrls?: string[];
  } | null;
}

export const CheckInSummaryInput = z.object({
  week: z.object({ start: z.string(), end: z.string() }),
  adherence: z.object({ planned: z.number().int().min(0), done: z.number().int().min(0) }),
  exercises: z.array(
    z.object({
      name: z.string(),
      sessions: z.number().int(),
      sets: z.number().int(),
      bestSet: z.string().nullable(),
    }),
  ),
  records: z.array(z.object({ exercise: z.string(), kind: z.string(), value: z.string(), previous: z.string() })),
  sessionFeel: z.array(z.number().int().min(1).max(5)),
  sessionNotes: z.array(z.string()),
  checkIn: z
    .object({
      submitted: z.boolean(),
      bodyweightKg: z.number().nullable(),
      bodyweightChangeKg: z.number().nullable(),
      sleepHours: z.number().nullable(),
      stress: z.number().nullable(),
      adherenceSelfRated: z.number().nullable(),
      note: z.string().nullable(),
      photosSubmitted: z.boolean(),
    })
    .nullable(),
});
export type CheckInSummaryInput = z.infer<typeof CheckInSummaryInput>;

const fmt = (n: number) => String(Math.round(n * 10) / 10);

function bestSetText(sets: LoggedSet[], metric: ExerciseMetric | undefined): string | null {
  if (sets.length === 0) return null;
  if (metric === 'distance') return `${fmt(Math.max(...sets.map((s) => s.distanceM ?? 0)))} m`;
  if (metric === 'time') return `${fmt(Math.max(...sets.map((s) => s.durationS ?? 0)))} s`;
  if (metric === 'bodyweight_reps' || sets.every((s) => s.weightKg == null)) {
    return `${Math.max(...sets.map((s) => s.reps ?? 0))} reps`;
  }
  const best = [...sets].sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0]!;
  return `${fmt(best.weightKg ?? 0)} kg × ${best.reps ?? 0}`;
}

/** Minimum fields for the weekly summary: aggregates only, no identity, no photos. */
export function buildCheckInSummaryInput(src: CheckInSummarySource): CheckInSummaryInput {
  const done = src.sessions.length;
  const byExercise = new Map<string, { sessions: Set<number>; sets: LoggedSet[] }>();
  src.sessions.forEach((s, i) => {
    for (const set of s.sets) {
      const e = byExercise.get(set.exerciseId) ?? { sessions: new Set<number>(), sets: [] };
      e.sessions.add(i);
      e.sets.push(set);
      byExercise.set(set.exerciseId, e);
    }
  });
  const name = (id: string) => src.exerciseNames[id] ?? id;
  const ci = src.checkIn;
  return CheckInSummaryInput.parse({
    week: { start: src.weekStart, end: src.weekEnd },
    adherence: { planned: src.sessionsPlanned, done },
    exercises: [...byExercise.entries()].map(([id, e]) => ({
      name: name(id),
      sessions: e.sessions.size,
      sets: e.sets.length,
      bestSet: bestSetText(e.sets, src.exerciseMetrics?.[id]),
    })),
    records: src.records.map((r) => ({
      exercise: name(r.exerciseId),
      kind: r.type === 'most_reps' ? 'most reps' : r.type === 'e1rm' ? 'estimated 1RM' : 'heaviest set',
      value: r.type === 'most_reps' ? `${r.value} reps` : `${fmt(r.value)} kg`,
      previous: r.type === 'most_reps' ? `${r.previous} reps` : `${fmt(r.previous)} kg`,
    })),
    sessionFeel: src.sessions.map((s) => s.feel).filter((f): f is number => f != null && f >= 1 && f <= 5),
    sessionNotes: src.sessions.map((s) => redact(s.note, 280)).filter((n): n is string => !!n),
    checkIn: ci
      ? {
          submitted: !!ci.submittedAt,
          bodyweightKg: ci.bodyweightKg,
          bodyweightChangeKg:
            ci.bodyweightKg != null && ci.previousBodyweightKg != null
              ? Math.round((ci.bodyweightKg - ci.previousBodyweightKg) * 10) / 10
              : null,
          sleepHours: ci.sleepHours,
          stress: ci.stress,
          adherenceSelfRated: ci.adherence,
          note: redact(ci.freeText),
          photosSubmitted: ci.photoIds.length > 0 || (ci.photoUrls?.length ?? 0) > 0,
        }
      : null,
  });
}

export const CheckInSummaryOutput = z.object({
  lines: z.array(z.string().trim().min(1).max(220)).min(3).max(5),
});
export type CheckInSummaryOutput = z.infer<typeof CheckInSummaryOutput>;

/** JSON schema for structured outputs (plain subset: types, required, no numeric limits). */
export const CHECK_IN_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  properties: { lines: { type: 'array', items: { type: 'string' } } },
  required: ['lines'],
  additionalProperties: false,
} as const;

export const CHECK_IN_SUMMARY_SYSTEM = `You help a personal trainer review a client's training week.
Write a draft of 3 to 5 short lines the trainer may edit and send to the client.
Use only the numbers and facts in the data. If something is missing (no check-in, no notes), say so plainly or leave it out; never estimate or invent.
Write in the second person to the client, in plain, warm, direct language. No emoji, no hype, no medical advice.
Mention adherence, any personal records, and anything in the check-in that the trainer should follow up on.
The client did or did not submit progress photos; you never see the photos themselves.`;

export function checkInSummaryPrompt(input: CheckInSummaryInput): { system: string; user: string } {
  return {
    system: CHECK_IN_SUMMARY_SYSTEM,
    user: `Here is the week's data as JSON. Return {"lines": [...]} with 3 to 5 lines.\n\n${JSON.stringify(input)}`,
  };
}

/**
 * MOCK: deterministic stand-in for the model, used when no API key is configured (demo builds).
 * Built only from the input's own numbers, so it never states anything the data doesn't show.
 */
export function mockCheckInSummary(input: CheckInSummaryInput): CheckInSummaryOutput {
  const lines: string[] = [];
  const { planned, done } = input.adherence;
  lines.push(
    planned > 0
      ? `You trained ${done} of ${planned} planned session${planned === 1 ? '' : 's'} this week.`
      : `You logged ${done} session${done === 1 ? '' : 's'} this week.`,
  );
  if (input.records.length) {
    const r = input.records[0]!;
    lines.push(`New ${r.kind} on ${r.exercise}: ${r.value} (previous best ${r.previous}).`);
  } else if (input.exercises.length) {
    const top = [...input.exercises].sort((a, b) => b.sets - a.sets)[0]!;
    lines.push(`Most of your work was on ${top.name}: ${top.sets} sets${top.bestSet ? `, best ${top.bestSet}` : ''}.`);
  } else {
    lines.push('No sets were logged this week.');
  }
  const ci = input.checkIn;
  if (ci?.submitted) {
    const bits: string[] = [];
    if (ci.bodyweightChangeKg != null) bits.push(`bodyweight ${ci.bodyweightChangeKg >= 0 ? '+' : ''}${ci.bodyweightChangeKg} kg`);
    if (ci.sleepHours != null) bits.push(`about ${ci.sleepHours} h sleep`);
    if (ci.stress != null) bits.push(`stress ${ci.stress}/5`);
    lines.push(bits.length ? `From your check-in: ${bits.join(', ')}.` : 'Thanks for sending your check-in.');
    if (ci.note) lines.push(`You mentioned: “${ci.note.length > 120 ? `${ci.note.slice(0, 119)}…` : ci.note}”`);
  } else {
    lines.push('Your weekly check-in hasn’t come in yet.');
  }
  if (input.sessionFeel.length && lines.length < 5) {
    const avg = input.sessionFeel.reduce((a, b) => a + b, 0) / input.sessionFeel.length;
    lines.push(`Sessions felt ${fmt(avg)}/5 on average.`);
  }
  return CheckInSummaryOutput.parse({ lines: lines.slice(0, 5) });
}

/* ---------- program draft ---------- */

export interface LibraryExercise {
  exerciseId: string;
  name: string;
  metric: ExerciseMetric;
  equipment: string[];
}

export interface ProgramDraftSource {
  client: { id: string; fullName: string; email?: string | null };
  intake: {
    goal: string | null;
    daysPerWeek: number | null;
    equipment: string | null;
    injuries: string | null;
    parq: Record<string, unknown>;
    [key: string]: unknown;
  };
  weeks: number;
  library: LibraryExercise[];
  templates: { name: string; dayTitles: string[] }[];
}

export const ProgramDraftInput = z.object({
  goal: z.string().nullable(),
  daysPerWeek: z.number().int().min(1).max(7),
  equipment: z.string().nullable(),
  injuries: z.string().nullable(),
  weeks: z.number().int().min(4).max(8),
  library: z.array(z.object({ exerciseId: z.string(), name: z.string(), metric: z.string(), equipment: z.array(z.string()) })),
  templates: z.array(z.object({ name: z.string(), dayTitles: z.array(z.string()) })),
});
export type ProgramDraftInput = z.infer<typeof ProgramDraftInput>;

/** Minimum intake fields only: no name, contact details or PAR-Q answers. */
export function buildProgramDraftInput(src: ProgramDraftSource): ProgramDraftInput {
  return ProgramDraftInput.parse({
    goal: src.intake.goal ? String(src.intake.goal) : null,
    daysPerWeek: Math.min(7, Math.max(1, Number(src.intake.daysPerWeek ?? 3) || 3)),
    equipment: src.intake.equipment ? String(src.intake.equipment) : null,
    injuries: redact(src.intake.injuries, 300),
    weeks: Math.min(8, Math.max(4, Math.round(src.weeks))),
    library: src.library.map(({ exerciseId, name, metric, equipment }) => ({ exerciseId, name, metric, equipment })),
    templates: src.templates.slice(0, 10),
  });
}

/** What the model returns. Exercises must come from the coach's library (checked after parsing). */
export const ProgramDraftOutput = z.object({
  name: z.string().trim().min(1).max(80),
  weeks: z
    .array(
      z.object({
        days: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(40),
              coachNote: z.string().max(280).nullable(),
              exercises: z
                .array(
                  z.object({
                    exerciseId: z.string(),
                    sets: z.number().int().min(1).max(10),
                    repsMin: z.number().int().min(1).max(50).nullable(),
                    repsMax: z.number().int().min(1).max(50).nullable(),
                    rpe: z.number().min(5).max(10).nullable(),
                    restS: z.number().int().min(0).max(600),
                    note: z.string().max(200).nullable(),
                  }),
                )
                .min(1)
                .max(10),
            }),
          )
          .min(1)
          .max(7),
      }),
    )
    .min(4)
    .max(8),
});
export type ProgramDraftOutput = z.infer<typeof ProgramDraftOutput>;

export const PROGRAM_DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'weeks'],
  properties: {
    name: { type: 'string' },
    weeks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['days'],
        properties: {
          days: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'coachNote', 'exercises'],
              properties: {
                title: { type: 'string' },
                coachNote: { type: ['string', 'null'] },
                exercises: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['exerciseId', 'sets', 'repsMin', 'repsMax', 'rpe', 'restS', 'note'],
                    properties: {
                      exerciseId: { type: 'string' },
                      sets: { type: 'integer' },
                      repsMin: { type: ['integer', 'null'] },
                      repsMax: { type: ['integer', 'null'] },
                      rpe: { type: ['number', 'null'] },
                      restS: { type: 'integer' },
                      note: { type: ['string', 'null'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const PROGRAM_DRAFT_SYSTEM = `You draft training blocks for a personal trainer, who reviews and edits every draft before a client sees it.
Use only exercises from the provided library, referenced by exerciseId. Respect the client's equipment and avoid loading anything the injuries note says hurts.
Match the number of training days per week and the number of weeks requested. Progress sensibly week to week (reps, sets or RPE), with a lighter final week when the block is 6 weeks or longer.
Do not set absolute loads: the trainer sets loads. Keep coach notes short and practical. Follow the trainer's templates' day names where they fit.`;

export function programDraftPrompt(input: ProgramDraftInput): { system: string; user: string } {
  return {
    system: PROGRAM_DRAFT_SYSTEM,
    user: `Draft a ${input.weeks}-week block with ${input.daysPerWeek} training days per week. Data:\n\n${JSON.stringify(input)}`,
  };
}

/** Week → days, each day in the same shape the client app logs against (SessionPlan without a date). */
export interface DraftProgram {
  id: string;
  name: string;
  status: 'draft';
  source: 'ai';
  weeks: { weekIndex: number; days: { title: string; coachNote: string | null; exercises: ProgramExercise[] }[] }[];
}

export class DraftValidationError extends Error {}

/**
 * Turns validated model output into the program shape. Throws DraftValidationError when the model
 * used an exercise outside the library or a reps range that makes no sense, so the caller can retry once.
 */
export function toDraftProgram(out: ProgramDraftOutput, library: LibraryExercise[], newId: () => string): DraftProgram {
  const lib = new Map(library.map((e) => [e.exerciseId, e]));
  return {
    id: newId(),
    name: out.name,
    status: 'draft',
    source: 'ai',
    weeks: out.weeks.map((w, wi) => ({
      weekIndex: wi,
      days: w.days.map((d) => ({
        title: d.title,
        coachNote: d.coachNote,
        exercises: d.exercises.map((x) => {
          const e = lib.get(x.exerciseId);
          if (!e) throw new DraftValidationError(`Unknown exercise ${x.exerciseId}`);
          if (x.repsMin != null && x.repsMax != null && x.repsMin > x.repsMax) {
            throw new DraftValidationError(`Reps range ${x.repsMin}–${x.repsMax} on ${e.name}`);
          }
          const reps = e.metric === 'weight_reps' || e.metric === 'bodyweight_reps';
          return {
            id: newId(),
            exerciseId: e.exerciseId,
            name: e.name,
            metric: e.metric,
            supersetGroup: null,
            restS: x.restS,
            tempo: null,
            note: x.note,
            trackRpe: x.rpe != null,
            demoVideoId: null,
            alternatives: [],
            progressionRule: null,
            sets: Array.from({ length: x.sets }, (_, index) => ({
              index,
              repsMin: reps ? x.repsMin : null,
              repsMax: reps ? (x.repsMax ?? x.repsMin) : null,
              loadKg: null,
              rpe: x.rpe,
              durationS: e.metric === 'time' ? 30 : null,
              distanceM: e.metric === 'distance' ? 40 : null,
              amrap: false,
            })),
          } satisfies ProgramExercise;
        }),
      })),
    })),
  };
}

/**
 * MOCK: rule-based stand-in for the model in demo builds. Picks from the library by day type and
 * equipment, progresses reps then RPE, deloads the last week of 6+ week blocks. No loads are set.
 */
export function mockProgramDraft(input: ProgramDraftInput): ProgramDraftOutput {
  const injuries = (input.injuries ?? '').toLowerCase();
  const avoid = (e: { exerciseId: string }) =>
    (injuries.includes('knee') && /squat|lunge|split/.test(e.exerciseId)) ||
    (injuries.includes('shoulder') && /press|overhead/.test(e.exerciseId)) ||
    (injuries.includes('back') && /deadlift|rdl/.test(e.exerciseId));
  const usable = input.library.filter((e) => !avoid(e));
  const pool = usable.length >= 3 ? usable : input.library;
  const titles =
    input.templates[0]?.dayTitles.length
      ? input.templates[0].dayTitles
      : input.daysPerWeek <= 3
        ? ['Full Body A', 'Full Body B', 'Full Body C']
        : ['Lower A', 'Upper A', 'Lower B', 'Upper B', 'Full Body'];
  const weeks = Array.from({ length: input.weeks }, (_, w) => {
    const deload = input.weeks >= 6 && w === input.weeks - 1;
    return {
      days: Array.from({ length: input.daysPerWeek }, (_, d) => {
        const picks = [0, 1, 2, 3].map((k) => pool[(d * 2 + k) % pool.length]!).filter((e, i, a) => a.findIndex((x) => x.exerciseId === e.exerciseId) === i);
        return {
          title: titles[d % titles.length]!,
          coachNote: deload ? 'Lighter week: same movements, stop two reps short.' : w === 0 ? 'First week: learn the movements, leave reps in the tank.' : null,
          exercises: picks.map((e, i) => {
            const reps = e.metric === 'weight_reps' || e.metric === 'bodyweight_reps';
            const base = i === 0 ? 5 : 8;
            return {
              exerciseId: e.exerciseId,
              sets: deload ? 2 : 3,
              repsMin: reps ? base : null,
              repsMax: reps ? base + Math.min(3, w) : null,
              rpe: reps ? (deload ? 6 : Math.min(9, 7 + Math.floor(w / 2) * 0.5)) : null,
              restS: i === 0 ? 150 : 90,
              note: null,
            };
          }),
        };
      }),
    };
  });
  const goal = input.goal ? `${input.goal[0]!.toUpperCase()}${input.goal.slice(1)}` : 'Training';
  return ProgramDraftOutput.parse({ name: `${goal} block · ${input.weeks} weeks`, weeks });
}

/* ---------- usage cap ---------- */

export interface UsageState {
  used: number;
  cap: number;
  remaining: number;
  allowed: boolean;
  resetsOn: string; // YYYY-MM-DD, first day of next month (UTC)
}

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function usageState(used: number, cap: number, now: Date = new Date()): UsageState {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const remaining = Math.max(0, cap - used);
  return { used, cap, remaining, allowed: cap > 0 && used < cap, resetsOn: next.toISOString().slice(0, 10) };
}

export function capMessage(s: UsageState): string {
  const d = new Date(`${s.resetsOn}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `You’ve used all ${s.cap} AI drafts for this month. They reset on ${d}. You can still write summaries yourself.`;
}

/* ---------- churn risk (nightly triage) ---------- */

export interface ChurnSignals {
  /** Sessions done ÷ planned per week, oldest first, most recent last. */
  weeklyAdherence: number[];
  lastOpenAt: string | null;
  now: string;
}

export interface ChurnResult {
  flag: boolean;
  reasons: ('no_opens_7d' | 'falling_adherence')[];
}

/** Rule-based (no model): no app opens for 7 days, or adherence fell by half over the last three weeks. */
export function churnRisk(s: ChurnSignals): ChurnResult {
  const reasons: ChurnResult['reasons'] = [];
  const days = s.lastOpenAt ? (Date.parse(s.now) - Date.parse(s.lastOpenAt)) / 86_400_000 : Infinity;
  if (days >= 7) reasons.push('no_opens_7d');
  const a = s.weeklyAdherence.slice(-3);
  if (a.length === 3 && a[0]! >= 0.5 && a[2]! <= a[0]! / 2 && a[1]! <= a[0]!) reasons.push('falling_adherence');
  return { flag: reasons.length > 0, reasons };
}

/* ---------- progression job (POST /progression/evaluate) ---------- */

export interface ProgressionJobExercise {
  programExerciseId: string;
  rule: ProgressionRule;
  prescribed: ProgramExercise['sets'];
  currentLoadKg: number;
}

export interface ProgressionJobResult extends ProgressionSuggestion {
  programExerciseId: string;
  ruleId: string;
}

/**
 * Evaluates every ruled exercise on a finished session's program day against the client's logged
 * history (oldest first). Same function the logger uses on device, so server and app always agree.
 */
export function evaluateSessionProgressions(
  exercises: ProgressionJobExercise[],
  history: Pick<LoggedSet, 'sessionId' | 'programExerciseId' | 'setIndex' | 'weightKg' | 'reps' | 'rpe' | 'loggedAt'>[],
): ProgressionJobResult[] {
  const out: ProgressionJobResult[] = [];
  for (const e of exercises) {
    const sets = history.filter((h) => h.programExerciseId === e.programExerciseId);
    const bySession = new Map<string, typeof sets>();
    for (const s of sets) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
    const results: ExerciseSessionResult[] = [...bySession.values()]
      .sort((a, b) => Math.min(...a.map((x) => Date.parse(x.loggedAt))) - Math.min(...b.map((x) => Date.parse(x.loggedAt))))
      .map((ss) => ({
        sets: [...ss].sort((a, b) => a.setIndex - b.setIndex).map((x) => ({ weightKg: x.weightKg, reps: x.reps, rpe: x.rpe })),
      }));
    const s = evaluateProgression(e.rule, e.prescribed, results, e.currentLoadKg);
    if (s) out.push({ ...s, programExerciseId: e.programExerciseId, ruleId: e.rule.id });
  }
  return out;
}
