import { describe, expect, it } from 'vitest';
import {
  PREP_MAX_LINES,
  buildMemory,
  buildPrep,
  groupByWeek,
  type MemoryInput,
} from '../src/memory';
import { dailyRead, type DailyCheck, type DailyRead } from '../src/signals';

const day = (offset: number) =>
  new Date(Date.UTC(2026, 9, 22) + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = day(0); // Thursday 22 Oct 2026
const steady = { status: 'steady' as const, acute: 1, chronicWeekly: 1, ratio: 1 };
const check = (date: string, p: Partial<DailyCheck> = {}): DailyCheck => ({
  id: date,
  date,
  sleepHours: 7.5,
  sleepSource: 'manual',
  energy: 3,
  soreness: 2,
  stress: 2,
  cyclePhase: null,
  shareCycle: false,
  note: null,
  shareWithCoach: true,
  submittedAt: `${date}T07:00:00Z`,
  ...p,
});
const readOn = (date: string, sleep: number, energy = 3): DailyRead =>
  dailyRead({
    today: date,
    check: check(date, { sleepHours: sleep, energy }),
    history: [check(date, { sleepHours: sleep })],
    load: steady,
    fuel: 'ok',
  });

const empty: MemoryInput = {
  today: TODAY,
  reads: [],
  sessions: [],
  prs: [],
  missed: [],
  checkIns: [],
  messages: [],
  injuries: [],
  formChecksWaiting: [],
  notes: [],
  followUps: [],
};

describe('buildMemory', () => {
  it('collapses a run of short-sleep days into one line', () => {
    const reads = [day(-3), day(-2), day(-1)].map((d) => ({ date: d, read: readOn(d, 5.2) }));
    const m = buildMemory({
      ...empty,
      reads: [...reads, { date: day(-6), read: readOn(day(-6), 5.0) }],
    });
    const sleep = m.filter((i) => i.kind === 'sleep_short');
    expect(sleep).toHaveLength(2);
    expect(sleep[0]).toMatchObject({
      date: day(-1),
      important: true,
      text: 'Short sleep reported 3 days running (19 Oct–21 Oct)',
    });
    expect(sleep[1]!.important).toBe(false);
  });

  it('ignores days the athlete didn’t share', () => {
    expect(buildMemory({ ...empty, reads: [{ date: day(-1), read: null }] })).toEqual([]);
  });

  it('marks an unanswered question and keeps only the last thing they said', () => {
    const m = buildMemory({
      ...empty,
      messages: [
        { at: `${day(-3)}T10:00:00Z`, fromClient: true, body: 'Gym was packed' },
        { at: `${day(-3)}T12:00:00Z`, fromClient: false, body: 'No problem' },
        {
          at: `${day(-1)}T09:00:00Z`,
          fromClient: true,
          body: 'Squats felt heavy on the last set. Is that normal?',
        },
      ],
    });
    expect(m).toEqual([
      {
        id: `msg:${day(-1)}T09:00:00Z`,
        kind: 'unanswered',
        date: day(-1),
        important: true,
        text: 'Asked “Squats felt heavy on the last set. Is that normal?”, not answered yet',
      },
    ]);
  });

  it('a coach reply after the question clears it', () => {
    const m = buildMemory({
      ...empty,
      messages: [
        { at: `${day(-2)}T09:00:00Z`, fromClient: true, body: 'Is that normal?' },
        { at: `${day(-1)}T09:00:00Z`, fromClient: false, body: 'Yes' },
      ],
    });
    expect(m[0]!.kind).toBe('said');
  });

  it('summarises missed sessions per week, bodyweight over three weeks and low adherence', () => {
    const m = buildMemory({
      ...empty,
      missed: [
        { date: day(-2), title: 'Lower B' },
        { date: day(-1), title: 'Upper A' },
      ],
      checkIns: [
        { date: day(-28), bodyweightKg: 82.6, adherence: 'all' },
        { date: day(-4), bodyweightKg: 81.2, adherence: 'some' },
      ],
    });
    expect(m.find((i) => i.kind === 'missed_sessions')!.text).toBe(
      'Missed 2 sessions (Lower B, Upper A)',
    );
    expect(m.find((i) => i.kind === 'weight_trend')!.text).toBe(
      'Bodyweight down 1.4 kg over 3 weeks (now 81.2 kg)',
    );
    expect(m.find((i) => i.kind === 'low_adherence')!.important).toBe(true);
  });

  it('dedupes the same fact, drops done follow-ups and sorts newest first', () => {
    const fc = { date: day(-2), exerciseName: 'Back Squat' };
    const m = buildMemory({
      ...empty,
      formChecksWaiting: [fc, fc],
      notes: [{ at: `${day(-5)}T08:00:00Z`, text: 'Travelling next week' }],
      followUps: [
        { id: 'f1', text: 'Ask about knee', dueOn: day(1), doneAt: null },
        { id: 'f2', text: 'Done one', dueOn: day(-1), doneAt: day(-1) },
      ],
    });
    expect(m.map((i) => i.kind)).toEqual(['follow_up', 'form_check_waiting', 'note']);
  });
});

describe('groupByWeek', () => {
  it('labels this week, last week and older weeks', () => {
    const m = buildMemory({
      ...empty,
      notes: [
        { at: `${day(-1)}T08:00:00Z`, text: 'a' },
        { at: `${day(-7)}T08:00:00Z`, text: 'b' },
        { at: `${day(-20)}T08:00:00Z`, text: 'c' },
      ],
    });
    expect(groupByWeek(m, TODAY).map((g) => g.label)).toEqual([
      'This week',
      'Last week',
      'Week of 28 Sept',
    ]);
  });
});

describe('buildPrep', () => {
  const full = (): MemoryInput => ({
    ...empty,
    reads: [day(-2), day(-1), day(0)].map((d) => ({ date: d, read: readOn(d, 5.2, 2) })),
    sessions: [{ date: day(-1), title: 'Lower A', variant: 'lighter' }],
    prs: [{ date: day(-1), text: 'Back Squat 82.5 kg × 5' }],
    messages: [
      { at: `${day(-1)}T09:00:00Z`, fromClient: true, body: 'Squats felt heavy. Is that normal?' },
    ],
    injuries: [{ date: day(-30), text: 'Left shoulder: no overhead pressing' }],
    formChecksWaiting: [{ date: day(-1), exerciseName: 'Back Squat' }],
    followUps: [{ id: 'f1', text: 'How the knee feels on stairs', dueOn: day(0), doneAt: null }],
  });

  it('reads in plain sentences, follow-up first', () => {
    const input = full();
    const lines = buildPrep({
      today: TODAY,
      week: { done: 2, planned: 3 },
      memory: buildMemory(input),
      reads: input.reads,
    });
    expect(lines).toEqual([
      '2 of 3 sessions done this week, 1 of them lighter.',
      'Body: 3 easy-day reads in 3 shared reads, mostly short sleep.',
      'Ask about: How the knee feels on stairs',
      'Last said (yesterday): “Squats felt heavy. Is that normal?”',
      'Worth a mention: new best: Back Squat 82.5 kg × 5.',
    ]);
  });

  it('falls back to the unanswered question, then the injury', () => {
    const input = { ...full(), followUps: [] };
    expect(
      buildPrep({
        today: TODAY,
        week: { done: 1, planned: 3 },
        memory: buildMemory(input),
        reads: [],
      })[2],
    ).toBe('Answer their question: “Squats felt heavy. Is that normal?”');
    const noQ = { ...input, messages: [] };
    expect(
      buildPrep({
        today: TODAY,
        week: { done: 1, planned: 3 },
        memory: buildMemory(noQ),
        reads: [],
      })[2],
    ).toBe('Check on: Left shoulder: no overhead pressing');
  });

  it('otherwise asks about missed sessions this week', () => {
    const memory = buildMemory({
      ...empty,
      missed: [
        { date: day(-2), title: '' },
        { date: day(-1), title: '' },
      ],
    });
    expect(buildPrep({ today: TODAY, week: { done: 0, planned: 3 }, memory, reads: [] })[2]).toBe(
      'Check in on: missed 2 sessions.',
    );
  });

  it('never runs past five lines, even with everything going on', () => {
    for (let n = 0; n < 20; n++) {
      const input = full();
      input.notes = Array.from({ length: n }, (_, i) => ({
        at: `${day(-i)}T08:00:00Z`,
        text: `note ${i}`,
      }));
      input.prs = Array.from({ length: n }, (_, i) => ({ date: day(-(i % 6)), text: `PR ${i}` }));
      input.missed = Array.from({ length: n }, (_, i) => ({ date: day(-i), title: `S${i}` }));
      const lines = buildPrep({
        today: TODAY,
        week: { done: n, planned: 20 },
        memory: buildMemory(input),
        reads: input.reads,
      });
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(PREP_MAX_LINES);
    }
  });

  it('falls back gracefully with no data', () => {
    expect(
      buildPrep({ today: TODAY, week: { done: 0, planned: 0 }, memory: [], reads: [] }),
    ).toEqual(['No sessions planned this week.', 'No daily reads shared this week.']);
  });
});
