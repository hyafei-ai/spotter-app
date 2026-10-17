import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTAKE_FORM,
  IntakeForm,
  PARQ_QUESTIONS,
  clientQuestions,
  finalizeForm,
  formProblems,
  missingAnswers,
  moveQuestion,
  newQuestion,
  parqFlag,
  pruneAnswers,
  removeQuestion,
  slugId,
  upsertQuestion,
} from '../src/intake';

const allNo = Object.fromEntries(PARQ_QUESTIONS.map((q) => [q.id, 'no']));

describe('intake form model', () => {
  it('always appends the PAR-Q block after the trainer’s questions', () => {
    const custom = removeQuestion(DEFAULT_INTAKE_FORM, 'goal');
    const qs = clientQuestions({ ...custom, questions: [] });
    expect(qs.map((q) => q.id)).toEqual(PARQ_QUESTIONS.map((q) => q.id));
    expect(clientQuestions(DEFAULT_INTAKE_FORM).slice(-7).every((q) => q.id.startsWith('parq_'))).toBe(true);
  });

  it('lists required questions still unanswered, including PAR-Q', () => {
    const missing = missingAnswers(DEFAULT_INTAKE_FORM, { goal: 'Strength', days: '3' });
    expect(missing.map((q) => q.id)).toEqual(['equipment', ...PARQ_QUESTIONS.map((q) => q.id)]);
    expect(missingAnswers(DEFAULT_INTAKE_FORM, { goal: 'Strength', days: '3', equipment: 'Full gym', ...allNo })).toEqual([]);
  });

  it('treats blank text, empty selections and NaN as unanswered', () => {
    const form: IntakeForm = {
      id: 'f',
      version: 1,
      questions: [
        { id: 'a', type: 'short_text', label: 'A', required: true },
        { id: 'b', type: 'multi_choice', label: 'B', required: true, options: ['x', 'y'] },
        { id: 'c', type: 'number', label: 'C', required: true },
      ],
    };
    expect(missingAnswers(form, { a: '  ', b: [], c: Number.NaN, ...allNo }).map((q) => q.id)).toEqual(['a', 'b', 'c']);
    expect(missingAnswers(form, { a: 'ok', b: ['x'], c: 0, ...allNo })).toEqual([]);
  });

  it('flags any PAR-Q yes', () => {
    expect(parqFlag(allNo)).toBe(false);
    expect(parqFlag({ ...allNo, parq_6: 'yes' })).toBe(true);
  });

  it('drops answers to removed questions but keeps PAR-Q', () => {
    const form = removeQuestion(DEFAULT_INTAKE_FORM, 'history');
    expect(pruneAnswers(form, { history: 'x', goal: 'Strength', parq_1: 'no' })).toEqual({ goal: 'Strength', parq_1: 'no' });
  });
});

describe('editing', () => {
  it('makes unique ids that never collide with PAR-Q', () => {
    expect(slugId('Do you sleep 7+ hours?', new Set())).toBe('do_you_sleep_7_hours');
    expect(slugId('Goal', new Set(['goal']))).toBe('goal_2');
    expect(slugId('parq 1', new Set())).toBe('q_parq_1');
    expect(slugId('!!!', new Set())).toBe('question');
  });

  it('adds, moves and removes questions', () => {
    let f = upsertQuestion(DEFAULT_INTAKE_FORM, { ...newQuestion('yes_no', DEFAULT_INTAKE_FORM), label: 'Do you smoke?' });
    expect(f.questions).toHaveLength(6);
    const id = f.questions[5]!.id;
    f = moveQuestion(f, id, -1);
    expect(f.questions[4]!.id).toBe(id);
    expect(moveQuestion(f, f.questions[0]!.id, -1)).toBe(f);
    f = removeQuestion(f, id);
    expect(f.questions.map((q) => q.id)).toEqual(DEFAULT_INTAKE_FORM.questions.map((q) => q.id));
  });

  it('reports blocking problems in plain words', () => {
    const q = newQuestion('single_choice', DEFAULT_INTAKE_FORM);
    const f = upsertQuestion(DEFAULT_INTAKE_FORM, { ...q, options: ['Yes', ' yes ', ''] });
    expect(formProblems(f).map((p) => p.message)).toEqual(['Question 6 needs a question.', 'Question 6 has the same choice twice.']);
    expect(formProblems(DEFAULT_INTAKE_FORM)).toEqual([]);
  });

  it('cleans up and bumps the version on save', () => {
    const q = { ...newQuestion('multi_choice', DEFAULT_INTAKE_FORM), label: '  Sports you play  ', options: [' Tennis', '', 'Golf '], help: ' ' };
    const saved = finalizeForm(upsertQuestion(DEFAULT_INTAKE_FORM, q), 3);
    expect(saved.version).toBe(4);
    expect(saved.questions[5]).toEqual({ id: q.id, type: 'multi_choice', label: 'Sports you play', required: false, options: ['Tennis', 'Golf'] });
  });
});
