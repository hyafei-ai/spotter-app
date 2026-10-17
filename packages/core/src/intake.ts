import { z } from 'zod';

/**
 * Configurable intake forms (C-2). A trainer edits their own questions; the PAR-Q health
 * questions are fixed, always appended by the app and never part of the stored form, so a
 * trainer can add questions around them but can't remove the safety check.
 */

export const QUESTION_TYPES = ['short_text', 'long_text', 'single_choice', 'multi_choice', 'yes_no', 'number'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  short_text: 'Short answer',
  long_text: 'Paragraph',
  single_choice: 'Pick one',
  multi_choice: 'Pick any',
  yes_no: 'Yes or no',
  number: 'Number',
};

export const MAX_QUESTIONS = 30;
export const MAX_OPTIONS = 12;

export const IntakeQuestion = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().min(1).max(200),
  help: z.string().max(300).optional(),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(60)).max(MAX_OPTIONS).optional(),
  unit: z.string().max(12).optional(),
});
export type IntakeQuestion = z.infer<typeof IntakeQuestion>;

export const IntakeForm = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  questions: z.array(IntakeQuestion).max(MAX_QUESTIONS),
});
export type IntakeForm = z.infer<typeof IntakeForm>;

/** Paraphrased PAR-Q. CLIENT INPUT REQUIRED: confirm wording per launch market. */
export const PARQ_QUESTIONS: readonly IntakeQuestion[] = [
  'Has a doctor ever said you have a heart condition or high blood pressure?',
  'Do you get chest pain at rest, in daily life, or when you exercise?',
  'Have you lost your balance from dizziness, or passed out, in the last 12 months?',
  'Have you been diagnosed with another long-term medical condition?',
  'Are you taking prescribed medication for a long-term condition?',
  'Do you have a bone, joint or muscle problem that more activity could make worse?',
  'Has a doctor said you should only exercise under medical supervision?',
].map((label, i) => ({ id: `parq_${i + 1}`, type: 'yes_no' as const, label, required: true }));

/** The starter form every tenant gets until they edit it. */
export const DEFAULT_INTAKE_FORM: IntakeForm = {
  id: 'default',
  version: 1,
  questions: [
    { id: 'goal', type: 'single_choice', label: 'Main goal', required: true, options: ['Strength', 'Muscle', 'Fat loss', 'General'] },
    { id: 'days', type: 'single_choice', label: 'Days per week you can train', required: true, options: ['2', '3', '4', '5'] },
    { id: 'equipment', type: 'single_choice', label: 'Where you train', required: true, options: ['Full gym', 'Home gym', 'Dumbbells'] },
    { id: 'history', type: 'long_text', label: 'Training so far', help: 'e.g. 2 years of lifting, mostly machines', required: false },
    { id: 'injuries', type: 'long_text', label: 'Injuries or pain', help: 'e.g. left knee aches on deep squats', required: false },
  ],
};

export type AnswerValue = string | string[] | number | null;
export type Answers = Record<string, AnswerValue>;

/** The full list a client sees: the trainer's questions, then the fixed PAR-Q block. */
export function clientQuestions(form: IntakeForm): IntakeQuestion[] {
  return [...form.questions, ...PARQ_QUESTIONS];
}

export function isAnswered(q: IntakeQuestion, v: AnswerValue | undefined): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return v.trim().length > 0;
}

/** Labels of required questions still unanswered, in form order. */
export function missingAnswers(form: IntakeForm, answers: Answers): IntakeQuestion[] {
  return clientQuestions(form).filter((q) => q.required && !isAnswered(q, answers[q.id]));
}

export function parqFlag(answers: Answers): boolean {
  return PARQ_QUESTIONS.some((q) => answers[q.id] === 'yes');
}

/** Drops answers to questions that no longer exist (the coach edited the form mid-draft). */
export function pruneAnswers(form: IntakeForm, answers: Answers): Answers {
  const ids = new Set(clientQuestions(form).map((q) => q.id));
  return Object.fromEntries(Object.entries(answers).filter(([k]) => ids.has(k)));
}

/* ---------- editing (coach side) ---------- */

export function slugId(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'question';
  // PAR-Q ids are reserved for the fixed health questions.
  const safe = base.startsWith('parq') ? `q_${base}`.slice(0, 32) : base;
  let id = safe;
  for (let n = 2; taken.has(id); n++) id = `${safe}_${n}`;
  return id;
}

export function newQuestion(type: QuestionType, form: IntakeForm): IntakeQuestion {
  const taken = new Set(form.questions.map((q) => q.id));
  const q: IntakeQuestion = { id: slugId(`question ${form.questions.length + 1}`, taken), type, label: '', required: false };
  if (type === 'single_choice' || type === 'multi_choice') q.options = ['', ''];
  return q;
}

export function moveQuestion(form: IntakeForm, id: string, delta: -1 | 1): IntakeForm {
  const i = form.questions.findIndex((q) => q.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= form.questions.length) return form;
  const questions = [...form.questions];
  [questions[i], questions[j]] = [questions[j]!, questions[i]!];
  return { ...form, questions };
}

export function upsertQuestion(form: IntakeForm, q: IntakeQuestion): IntakeForm {
  const i = form.questions.findIndex((x) => x.id === q.id);
  const questions = i < 0 ? [...form.questions, q] : form.questions.map((x) => (x.id === q.id ? q : x));
  return { ...form, questions };
}

export function removeQuestion(form: IntakeForm, id: string): IntakeForm {
  return { ...form, questions: form.questions.filter((q) => q.id !== id) };
}

/** Problems that block saving, in plain words for the coach. Empty when the form is valid. */
export interface FormProblem {
  questionId: string | null;
  /** Form-level wording, e.g. "Question 3 needs a question." */
  message: string;
  /** Wording for under the question itself, e.g. "Needs a question." */
  detail: string;
}

export function formProblems(form: IntakeForm): FormProblem[] {
  const out: FormProblem[] = [];
  const add = (questionId: string | null, n: string, detail: string) =>
    out.push({ questionId, message: n ? `${n} ${detail.charAt(0).toLowerCase()}${detail.slice(1)}` : detail, detail });
  if (form.questions.length > MAX_QUESTIONS) add(null, '', `Keep it to ${MAX_QUESTIONS} questions or fewer.`);
  const seen = new Set<string>();
  form.questions.forEach((q, i) => {
    const n = `Question ${i + 1}`;
    if (seen.has(q.id) || q.id.startsWith('parq_')) add(q.id, n, 'Has a duplicate id.');
    seen.add(q.id);
    if (!q.label.trim()) add(q.id, n, 'Needs a question.');
    if (q.type === 'single_choice' || q.type === 'multi_choice') {
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) add(q.id, n, 'Needs at least two choices.');
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) add(q.id, n, 'Has the same choice twice.');
    }
  });
  return out;
}

/** Normalises a form for saving: trims text, drops blank choices, bumps the version. */
export function finalizeForm(form: IntakeForm, previousVersion: number): IntakeForm {
  return IntakeForm.parse({
    ...form,
    version: previousVersion + 1,
    questions: form.questions.map((q) => {
      const clean: IntakeQuestion = { id: q.id, type: q.type, label: q.label.trim(), required: q.required };
      if (q.help?.trim()) clean.help = q.help.trim();
      if (q.type === 'single_choice' || q.type === 'multi_choice') clean.options = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (q.type === 'number' && q.unit?.trim()) clean.unit = q.unit.trim();
      return clean;
    }),
  });
}
