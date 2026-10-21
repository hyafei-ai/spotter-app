import { describe, expect, it } from 'vitest';
import {
  CheckInSummaryOutput,
  DraftValidationError,
  ProgramDraftOutput,
  buildCheckInSummaryInput,
  buildProgramDraftInput,
  capMessage,
  checkInSummaryPrompt,
  churnRisk,
  evaluateSessionProgressions,
  mockCheckInSummary,
  mockProgramDraft,
  programDraftPrompt,
  redact,
  toDraftProgram,
  usageState,
  type CheckInSummarySource,
  type LibraryExercise,
} from '../src/ai';
import { DEMO_HISTORY, LOWER_A } from '../src/demo/client';
import { uuidv7 } from '../src/ids';

const names = Object.fromEntries(LOWER_A.exercises.map((e) => [e.exerciseId, e.name]));
const metrics = Object.fromEntries(LOWER_A.exercises.map((e) => [e.exerciseId, e.metric]));

const source = (over: Partial<CheckInSummarySource> = {}): CheckInSummarySource => ({
  client: { id: 'c1', fullName: 'Jordan Ellis', email: 'jordan.ellis@example.com' },
  weekStart: '2026-10-12',
  weekEnd: '2026-10-18',
  sessionsPlanned: 3,
  sessions: [
    {
      title: 'Lower A',
      date: '2026-10-14',
      feel: 4,
      note: 'Knee felt fine. Text me on +1 415 555 0134 or jordan.ellis@example.com',
      sets: DEMO_HISTORY[1]!.sets,
    },
  ],
  exerciseNames: names,
  exerciseMetrics: metrics,
  records: [{ exerciseId: 'back-squat', type: 'heaviest', value: 82.5, previous: 80 }],
  checkIn: {
    submittedAt: '2026-10-18T08:00:00Z',
    bodyweightKg: 81.4,
    previousBodyweightKg: 81.9,
    sleepHours: 7,
    stress: 2,
    adherence: 4,
    freeText: 'Busy week. Photos at https://photos.example.com/jordan/front.jpg',
    photoIds: ['0192f0a1-0000-7000-8000-00000000aaaa'],
    photoUrls: ['https://storage.example.com/progress/front.jpg?token=abc'],
  },
  ...over,
});

describe('check-in summary input', () => {
  it('sends aggregates only: no name, email, phone, photo ids or photo URLs', () => {
    const input = buildCheckInSummaryInput(source());
    const json = JSON.stringify(checkInSummaryPrompt(input));
    for (const forbidden of ['Jordan', 'Ellis', 'example.com', '555', '00000000aaaa', 'front.jpg', 'token=abc', 'https://']) {
      expect(json).not.toContain(forbidden);
    }
    expect(input.checkIn?.photosSubmitted).toBe(true);
    expect(input.sessionNotes[0]).toBe('Knee felt fine. Text me on [phone] or [email]');
    expect(input.checkIn?.note).toBe('Busy week. Photos at [link]');
  });

  it('summarises the week from logged sets', () => {
    const input = buildCheckInSummaryInput(source());
    expect(input.adherence).toEqual({ planned: 3, done: 1 });
    expect(input.exercises.find((e) => e.name === 'Back Squat')).toEqual({ name: 'Back Squat', sessions: 1, sets: 3, bestSet: '80 kg × 8' });
    expect(input.exercises.find((e) => e.name === 'Hanging Knee Raise')?.bestSet).toBe('12 reps');
    expect(input.exercises.find((e) => e.name === 'Farmer Carry')?.bestSet).toBe('40 m');
    expect(input.checkIn?.bodyweightChangeKg).toBe(-0.5);
    expect(input.records[0]).toEqual({ exercise: 'Back Squat', kind: 'heaviest set', value: '82.5 kg', previous: '80 kg' });
  });

  it('handles a week with no check-in and no sessions', () => {
    const input = buildCheckInSummaryInput(source({ sessions: [], records: [], checkIn: null }));
    expect(mockCheckInSummary(input).lines).toEqual([
      'You trained 0 of 3 planned sessions this week.',
      'No sets were logged this week.',
      'Your weekly check-in hasn’t come in yet.',
    ]);
  });

  it('mock summary only states numbers from the data', () => {
    const out = mockCheckInSummary(buildCheckInSummaryInput(source()));
    expect(out.lines[0]).toBe('You trained 1 of 3 planned sessions this week.');
    expect(out.lines[1]).toBe('New heaviest set on Back Squat: 82.5 kg (previous best 80 kg).');
    expect(out.lines[2]).toBe('From your check-in: bodyweight -0.5 kg, about 7 h sleep, stress 2/5.');
    expect(out.lines.length).toBeLessThanOrEqual(5);
  });

  it('rejects outputs outside 3–5 lines', () => {
    expect(CheckInSummaryOutput.safeParse({ lines: ['a', 'b'] }).success).toBe(false);
    expect(CheckInSummaryOutput.safeParse({ lines: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false);
  });
});

const library: LibraryExercise[] = LOWER_A.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, metric: e.metric, equipment: [] }));

describe('program draft', () => {
  const src = {
    client: { id: 'c1', fullName: 'Jordan Ellis', email: 'jordan.ellis@example.com' },
    intake: {
      goal: 'strength',
      daysPerWeek: 3,
      equipment: 'Full gym',
      injuries: 'Left knee aches on deep squats, call 07700 900123',
      parq: { parq_1: 'yes' },
      history: 'secret',
    },
    weeks: 6,
    library,
    templates: [],
  };

  it('uses only goal, days, equipment, redacted injuries and the library', () => {
    const input = buildProgramDraftInput(src);
    const json = JSON.stringify(programDraftPrompt(input));
    for (const forbidden of ['Jordan', 'example.com', 'parq', '07700', 'secret']) expect(json).not.toContain(forbidden);
    expect(input.injuries).toBe('Left knee aches on deep squats, call [phone]');
    expect(input.weeks).toBe(6);
  });

  it('clamps weeks to 4–8 and days to 1–7', () => {
    expect(buildProgramDraftInput({ ...src, weeks: 12 }).weeks).toBe(8);
    expect(buildProgramDraftInput({ ...src, weeks: 2, intake: { ...src.intake, daysPerWeek: 9 } })).toMatchObject({ weeks: 4, daysPerWeek: 7 });
    // Missing or zero days falls back to three rather than an empty week.
    expect(buildProgramDraftInput({ ...src, intake: { ...src.intake, daysPerWeek: null } }).daysPerWeek).toBe(3);
  });

  it('mock draft respects the request and avoids knee-loading lifts for a knee note', () => {
    const out = mockProgramDraft(buildProgramDraftInput(src));
    expect(out.weeks).toHaveLength(6);
    expect(out.weeks.every((w) => w.days.length === 3)).toBe(true);
    const ids = out.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    expect(ids.some((id) => /squat/.test(id))).toBe(false);
    expect(out.weeks[5]!.days[0]!.coachNote).toMatch(/Lighter week/);
  });

  it('converts to the program shape with no loads and fresh ids', () => {
    const draft = toDraftProgram(mockProgramDraft(buildProgramDraftInput(src)), library, () => uuidv7());
    expect(draft.status).toBe('draft');
    const ex = draft.weeks[0]!.days[0]!.exercises[0]!;
    expect(ex.sets).toHaveLength(3);
    expect(ex.sets.every((s) => s.loadKg === null)).toBe(true);
    expect(ex.progressionRule).toBeNull();
  });

  it('rejects exercises outside the library so the caller can retry', () => {
    const bad = ProgramDraftOutput.parse({
      name: 'X',
      weeks: Array.from({ length: 4 }, () => ({
        days: [
          {
            title: 'A',
            coachNote: null,
            exercises: [{ exerciseId: 'made-up-lift', sets: 3, repsMin: 5, repsMax: 8, rpe: 8, restS: 90, note: null }],
          },
        ],
      })),
    });
    expect(() => toDraftProgram(bad, library, () => uuidv7())).toThrow(DraftValidationError);
  });
});

describe('usage cap', () => {
  it('allows until the cap and says when it resets', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    expect(usageState(49, 50, now)).toMatchObject({ allowed: true, remaining: 1, resetsOn: '2026-11-01' });
    const full = usageState(50, 50, now);
    expect(full.allowed).toBe(false);
    expect(capMessage(full)).toContain('all 50 AI drafts');
    expect(usageState(0, 0, now).allowed).toBe(false);
  });
});

describe('churn risk', () => {
  const now = '2026-10-21T03:00:00Z';
  it('flags no opens for 7 days', () => {
    expect(churnRisk({ weeklyAdherence: [1, 1, 1], lastOpenAt: '2026-10-13T20:00:00Z', now })).toEqual({ flag: true, reasons: ['no_opens_7d'] });
    expect(churnRisk({ weeklyAdherence: [1, 1, 1], lastOpenAt: '2026-10-20T20:00:00Z', now }).flag).toBe(false);
  });
  it('flags adherence that fell by half over three weeks', () => {
    expect(churnRisk({ weeklyAdherence: [1, 0.67, 0.33], lastOpenAt: '2026-10-20T20:00:00Z', now }).reasons).toEqual(['falling_adherence']);
    expect(churnRisk({ weeklyAdherence: [0.33, 0.67, 0.33], lastOpenAt: '2026-10-20T20:00:00Z', now }).flag).toBe(false);
  });
});

describe('progression job', () => {
  const squat = LOWER_A.exercises[0]!;
  it('matches the on-device rule: +2.5 kg after two qualifying sessions', () => {
    const history = DEMO_HISTORY.flatMap((s) => s.sets);
    const res = evaluateSessionProgressions(
      [{ programExerciseId: squat.id, rule: squat.progressionRule!, prescribed: squat.sets, currentLoadKg: 80 }],
      history,
    );
    expect(res).toEqual([
      expect.objectContaining({ programExerciseId: squat.id, suggestedLoadKg: 82.5, previousLoadKg: 80, ruleId: squat.progressionRule!.id }),
    ]);
  });

  it('suggests nothing when the latest session missed the range', () => {
    const history = DEMO_HISTORY.flatMap((s) => s.sets).map((s) =>
      s.sessionId === DEMO_HISTORY[1]!.sessionId && s.programExerciseId === squat.id && s.setIndex === 2 ? { ...s, reps: 6 } : s,
    );
    expect(
      evaluateSessionProgressions([{ programExerciseId: squat.id, rule: squat.progressionRule!, prescribed: squat.sets, currentLoadKg: 80 }], history),
    ).toEqual([]);
  });
});

describe('redact', () => {
  it('handles empty and long text', () => {
    expect(redact('   ')).toBeNull();
    expect(redact(null)).toBeNull();
    expect(redact('a'.repeat(700))!.length).toBe(600);
  });
});
