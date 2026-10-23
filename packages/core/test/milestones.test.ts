import { describe, expect, it } from 'vitest';
import {
  checkInMessage,
  clientMilestones,
  milestoneMessage,
  returningAfterBreak,
} from '../src/coachToday';

/* MOCK dates written for these tests. */

const TODAY = '2026-10-23';
const iso = (offset: number) =>
  new Date(Date.UTC(2026, 9, 23) + offset * 86_400_000).toISOString().slice(0, 10);
/** n sessions, the last one `lastOffset` days from today, one every `every` days. */
const sessions = (n: number, lastOffset: number, every = 3) =>
  Array.from({ length: n }, (_, i) => iso(lastOffset - (n - 1 - i) * every));

describe('clientMilestones', () => {
  it('a session count reached in the last week', () => {
    const m = clientMilestones({
      today: TODAY,
      sessionDates: sessions(100, -2),
      coachStart: null,
      coach: 'Maya',
    });
    expect(m).toEqual([
      {
        kind: 'sessions',
        date: iso(-2),
        text: 'Your 100th session with Maya',
        coachText: '100th session',
        weight: 50,
      },
    ]);
  });

  it('not when the count was reached more than a week ago, or not reached', () => {
    expect(
      clientMilestones({
        today: TODAY,
        sessionDates: sessions(100, -9),
        coachStart: null,
        coach: 'Maya',
      }),
    ).toEqual([]);
    expect(
      clientMilestones({
        today: TODAY,
        sessionDates: sessions(99, 0),
        coachStart: null,
        coach: 'Maya',
      }),
    ).toEqual([]);
  });

  it('ordinals', () => {
    const texts = [10, 25, 50].map(
      (n) =>
        clientMilestones({
          today: TODAY,
          sessionDates: sessions(n, 0),
          coachStart: null,
          coach: 'Sam',
        })[0]!.coachText,
    );
    expect(texts).toEqual(['10th session', '25th session', '50th session']);
  });

  it('weeks with the coach', () => {
    const m = clientMilestones({
      today: TODAY,
      sessionDates: [],
      coachStart: iso(-12 * 7 - 1),
      coach: 'Maya',
    });
    expect(m).toEqual([
      {
        kind: 'weeks_with_coach',
        date: iso(-1),
        text: '12 weeks training with Maya',
        coachText: '12 weeks with you',
        weight: 36,
      },
    ]);
  });

  it('regression: the first anniversary shows on the day with the right year count (the source used days ÷ 365)', () => {
    const m = clientMilestones({
      today: TODAY,
      sessionDates: [],
      coachStart: '2025-10-23',
      coach: 'Maya',
    });
    expect(m[0]).toMatchObject({
      kind: 'years_with_coach',
      date: TODAY,
      text: '1 year training with Maya',
      coachText: '1 year with you',
    });
    const second = clientMilestones({
      today: '2027-10-25',
      sessionDates: [],
      coachStart: '2025-10-23',
      coach: 'Maya',
    });
    expect(second[0]).toMatchObject({ coachText: '2 years with you', date: '2027-10-23' });
  });

  it('regression: a 29 February start has an anniversary in other years', () => {
    const m = clientMilestones({
      today: '2027-03-01',
      sessionDates: [],
      coachStart: '2024-02-29',
      coach: 'Maya',
    });
    expect(m[0]).toMatchObject({
      kind: 'years_with_coach',
      date: '2027-02-28',
      coachText: '3 years with you',
    });
  });

  it('a training anniversary when they started training before this coach', () => {
    const m = clientMilestones({
      today: TODAY,
      sessionDates: [],
      coachStart: '2026-01-10',
      trainingStart: '2021-10-20',
      coach: 'Maya',
    });
    expect(m).toEqual([
      {
        kind: 'training_anniversary',
        date: '2026-10-20',
        text: '5 years since you started training',
        coachText: '5 years since starting training',
        weight: 55,
      },
    ]);
    expect(
      clientMilestones({
        today: TODAY,
        sessionDates: [],
        coachStart: '2019-01-10',
        trainingStart: '2021-10-20',
        coach: 'Maya',
      }),
    ).toEqual([]);
  });

  it('first race, only the first', () => {
    expect(
      clientMilestones({
        today: TODAY,
        sessionDates: [],
        coachStart: null,
        raceDates: [iso(-1)],
        coach: 'Maya',
      })[0],
    ).toMatchObject({ kind: 'first_race', coachText: 'First race done' });
    expect(
      clientMilestones({
        today: TODAY,
        sessionDates: [],
        coachStart: null,
        raceDates: [iso(-90), iso(-1)],
        coach: 'Maya',
      }),
    ).toEqual([]);
    expect(
      clientMilestones({
        today: TODAY,
        sessionDates: [],
        coachStart: null,
        raceDates: [iso(3)],
        coach: 'Maya',
      }),
    ).toEqual([]);
  });

  it('most meaningful first when several land together', () => {
    const m = clientMilestones({
      today: TODAY,
      sessionDates: sessions(50, -1),
      coachStart: '2025-10-20',
      raceDates: [iso(-3)],
      coach: 'Maya',
    });
    expect(m.map((x) => x.kind)).toEqual(['first_race', 'years_with_coach', 'sessions']);
  });

  it('prefilled messages', () => {
    expect(
      milestoneMessage('Jordan', { kind: 'sessions', text: 'Your 100th session with Maya' }),
    ).toBe("Jordan, worth marking: your 100th session with Maya. That's the work adding up.");
    expect(milestoneMessage('Jordan', { kind: 'first_race', text: 'Your first race, done' })).toBe(
      'Jordan, your first race is done. Proud of you. How are the legs?',
    );
  });
});

describe('returningAfterBreak', () => {
  it('a session in the last week after 60+ days away', () => {
    const r = returningAfterBreak([iso(-120), iso(-70), iso(-2)], TODAY)!;
    expect(r).toEqual({
      daysAway: 68,
      lastBefore: iso(-70),
      returnedOn: iso(-2),
      line: 'Back after 9 weeks away',
      question:
        'Welcome back! How are you feeling, and what would you like from the next few weeks?',
    });
    expect(checkInMessage('Jordan', r.question)).toBe(
      'Hi Jordan, welcome back! How are you feeling, and what would you like from the next few weeks?',
    );
  });

  it('finds the return even with a few sessions since', () => {
    expect(returningAfterBreak([iso(-80), iso(-5), iso(-3), iso(-1)], TODAY)?.returnedOn).toBe(
      iso(-5),
    );
  });

  it('nothing for a short gap, an old return, no return yet, or a first session', () => {
    expect(returningAfterBreak([iso(-50), iso(-1)], TODAY)).toBeNull();
    expect(returningAfterBreak([iso(-100), iso(-30), iso(-25)], TODAY)).toBeNull();
    expect(returningAfterBreak([iso(-90)], TODAY)).toBeNull();
    expect(returningAfterBreak([iso(-1)], TODAY)).toBeNull();
    expect(returningAfterBreak([], TODAY)).toBeNull();
  });
});
