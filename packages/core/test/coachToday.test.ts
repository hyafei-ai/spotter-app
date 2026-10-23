import { describe, expect, it } from 'vitest';
import {
  actToday,
  checkInMessage,
  connectedSummary,
  dayDetail,
  historyWeeks,
  joinWords,
  laneSummaries,
  rosterRowText,
  sessionDemand,
  strainSignals,
  usualSleep,
  winMessage,
  type PlannedDay,
} from '../src/coachToday';
import type { ClientDay } from '../src/timeline';
import { DEMO_CLIENTS } from '../src/demo/coach';
import { DEMO_JORDAN_ID, DEMO_MEI_ID } from '../src/demo/patterns';
import {
  SAMPLE_CLIENT,
  demoPlannedToday,
  demoRosterDays,
  demoRosterPatterns,
  demoRosterWins,
} from '../src/demo/coachToday';

const sets = (n: number) => Array.from({ length: n }, () => ({}));
const LOWER: PlannedDay = {
  title: 'Lower A',
  exercises: [
    { exerciseId: 'back-squat', sets: sets(4) },
    { exerciseId: 'romanian-deadlift', sets: sets(4) },
    { exerciseId: 'bulgarian-split-squat', sets: sets(4) },
  ],
};
const EASY: PlannedDay = {
  title: 'Easy Upper',
  exercises: [
    { exerciseId: 'db-row', sets: sets(3) },
    { exerciseId: 'incline-db-press', sets: sets(3) },
  ],
};

function day(over: Partial<ClientDay['recovery']> = {}, extra: Partial<ClientDay> = {}): ClientDay {
  return {
    date: '2026-10-23',
    training: { sessions: [], load: 0 },
    recovery: {
      sleepHours: 7.5,
      hrvMs: 48,
      restingHr: 58,
      hrvVsBaseline: 1,
      rhrVsBaseline: 0,
      hrvLow: false,
      ...over,
    },
    mobility: { minutes: 0, sessions: 0 },
    nutrition: { kcal: null, proteinG: null, carbsG: null, vsTarget: null, source: null },
    cycle: null,
    pain: [],
    check: null,
    ...extra,
  };
}

describe('joinWords', () => {
  it('joins with commas and "and"', () => {
    expect(joinWords([])).toBe('');
    expect(joinWords(['a'])).toBe('a');
    expect(joinWords(['a', 'b'])).toBe('a and b');
    expect(joinWords(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('sessionDemand', () => {
  it('counts sets, marks heavy at 12+ and maps groups to regions', () => {
    const d = sessionDemand(LOWER);
    expect(d.sets).toBe(12);
    expect(d.heavy).toBe(true);
    expect(d.groups).toEqual(['legs', 'posterior chain']);
    expect(d.regions).toContain('knee');
    expect(d.regions).not.toContain('shoulder');
    expect(sessionDemand(EASY).heavy).toBe(false);
    expect(sessionDemand(EASY).regions).toContain('shoulder');
  });
});

describe('strainSignals', () => {
  it('names short sleep, low HRV and high resting HR against their own baseline', () => {
    const s = strainSignals(
      day({ sleepHours: 5.9, hrvVsBaseline: 0.85, hrvLow: true, rhrVsBaseline: 6 }),
    );
    expect(s.map((x) => x.text)).toEqual([
      '5.9 h sleep',
      'HRV 15% under usual',
      'resting HR 6 bpm over usual',
    ]);
    expect(s[1]!.clientText).toBe('HRV 15% under your usual');
  });
  it('is empty on a normal day or with no day', () => {
    expect(strainSignals(day())).toEqual([]);
    expect(strainSignals(null)).toEqual([]);
  });
  it('needs hrvLow (the 1-SD rule), not just a lower number', () => {
    expect(strainSignals(day({ hrvVsBaseline: 0.9, hrvLow: false }))).toEqual([]);
  });
});

describe('actToday', () => {
  const strained = day({ sleepHours: 5.9, hrvVsBaseline: 0.85, hrvLow: true });
  it('offers the easier version on a heavy day with 2+ strain signals', () => {
    const a = actToday({
      firstName: 'Jordan',
      day: strained,
      planned: LOWER,
      lighterWords: '10% lighter loads, 1 fewer set per exercise',
    })!;
    expect(a.kind).toBe('ease');
    expect(a.action).toBe('offer_easier');
    expect(a.line).toBe('5.9 h sleep and HRV 15% under usual · Lower A today (12 sets)');
    expect(a.draft).toContain('easier version of Lower A: 10% lighter loads');
    expect(a.draft).toContain('HRV 15% under your usual');
  });
  it('says nothing with one signal, on a light day, or with no session planned', () => {
    expect(actToday({ firstName: 'J', day: day({ sleepHours: 5.9 }), planned: LOWER })).toBeNull();
    expect(actToday({ firstName: 'J', day: strained, planned: EASY })).toBeNull();
    expect(actToday({ firstName: 'J', day: strained, planned: null })).toBeNull();
  });
  it('flags ongoing pain on a day that loads that area', () => {
    const a = actToday({
      firstName: 'Aisha',
      day: null,
      planned: EASY,
      pain: { region: 'shoulder', side: 'left', days: 5 },
    })!;
    expect(a.kind).toBe('pain');
    expect(a.line).toBe(
      'Left shoulder pain on 5 of the last 14 days · Easy Upper today loads the shoulder',
    );
    expect(a.action).toBe('message');
    expect(
      actToday({
        firstName: 'A',
        day: null,
        planned: LOWER,
        pain: { region: 'shoulder', side: 'left', days: 5 },
      }),
    ).toBeNull();
    expect(
      actToday({
        firstName: 'A',
        day: null,
        planned: EASY,
        pain: { region: 'shoulder', side: null, days: 2 },
      }),
    ).toBeNull();
  });
  it('flags fuel: talk-to-someone on any training day, watch only on a heavy one', () => {
    expect(
      actToday({ firstName: 'M', day: null, planned: EASY, fuelLevel: 'talk_to_someone' })!.kind,
    ).toBe('fuel');
    expect(actToday({ firstName: 'M', day: null, planned: EASY, fuelLevel: 'watch' })).toBeNull();
    expect(actToday({ firstName: 'M', day: null, planned: LOWER, fuelLevel: 'watch' })!.line).toBe(
      'Fuel check: one to watch · Lower A today',
    );
  });
  it('puts strain first when several apply', () => {
    const a = actToday({
      firstName: 'J',
      day: strained,
      planned: LOWER,
      pain: { region: 'knee', side: 'left', days: 4 },
      fuelLevel: 'talk_to_someone',
    })!;
    expect(a.kind).toBe('ease');
  });
});

describe('messages', () => {
  it('writes the win message from the client-facing text', () => {
    expect(winMessage('Mei', { text: 'Held your Back Squat strength for 22 weeks' })).toBe(
      "Mei, worth knowing: Held your Back Squat strength for 22 weeks. That's the work adding up.",
    );
  });
  it('writes the check-in message with the question', () => {
    expect(checkInMessage('Chris', 'What’s got in the way?')).toBe(
      'Hi Chris, what’s got in the way?',
    );
    expect(checkInMessage('Chris', null)).toBe("Hi Chris, how's this week going?");
  });
});

describe('timeline in words', () => {
  const now = new Date('2026-10-23T09:00:00');
  const jordan = demoRosterDays(DEMO_JORDAN_ID, now);
  it('gives 8 weeks by default, ending today', () => {
    expect(jordan).toHaveLength(56);
    expect(jordan[55]!.date).toBe('2026-10-23');
  });
  it('summarises each lane from the data only', () => {
    const s = laneSummaries(jordan);
    expect(s.training).toMatch(/^\d+ sessions, \d+ from other apps$/);
    expect(s.sleep).toMatch(/^usual \d(\.\d)? h · \d+ short nights?$/);
    expect(s.hrv).toMatch(/days? well under usual$/);
    expect(s.cycle).toBeNull(); // Jordan keeps the cycle private by default
    expect(laneSummaries(demoRosterDays(SAMPLE_CLIENT.id, now)).cycle).toBe('shared by the client');
  });
  it('usual sleep is their own median, and needs a week of nights', () => {
    expect(usualSleep(jordan)).toBeGreaterThan(6.5);
    expect(usualSleep(jordan.slice(0, 3))).toBeNull();
  });
  it('describes one day line by line', () => {
    const today = dayDetail(jordan[55]!);
    expect(today).toContain('Sleep 5.9 h (short)');
    expect(today.some((l) => l.startsWith('HRV ') && l.includes('under usual'))).toBe(true);
    expect(dayDetail(day())).toEqual([
      'No training logged',
      'Sleep 7.5 h',
      'HRV 48 ms',
      'Resting HR 58 bpm',
    ]);
  });
  it('counts history weeks from the first day with data', () => {
    expect(historyWeeks(jordan)).toBe(8);
    expect(historyWeeks(demoRosterDays(DEMO_CLIENTS[2]!.id, now))).toBe(0); // Tomás: no health app, no sessions yet
    expect(historyWeeks([])).toBe(0);
  });
  it('summarises a newly connected history without promising more', () => {
    const c = connectedSummary(demoRosterDays(SAMPLE_CLIENT.id, now, { days: 112 }));
    expect(c.weeks).toBe(16);
    expect(c.text).toMatch(
      /^16 weeks: \d+ workouts, 112 nights of sleep, HRV on 112 days and food on \d+ days$/,
    );
    expect(connectedSummary([]).text).toBe('0 weeks: nothing shared yet');
  });
});

describe('roster row text', () => {
  const now = new Date('2026-10-23T09:00:00');
  it('says what the 14 cells show, in words', () => {
    const t = rosterRowText(
      'Jordan',
      demoRosterDays(DEMO_JORDAN_ID, now, { days: 14 }),
      '2026-10-23',
    );
    expect(t).toMatch(
      /^Jordan: trained \d+ of 14 days\. .*latest today: short sleep and HRV well under usual\.$/,
    );
  });
  it('handles a client with nothing shared', () => {
    const tomas = demoRosterDays(DEMO_CLIENTS[2]!.id, now, { days: 14 });
    expect(rosterRowText('Tomás', tomas, '2026-10-23')).toBe(
      'Tomás: nothing shared in the last 14 days.',
    );
  });
});

describe('demo: sample client and Today', () => {
  const now = new Date('2026-10-23T09:00:00');
  it('the sample client has the full picture, patterns and a win', () => {
    expect(SAMPLE_CLIENT.plan).toContain('MOCK');
    expect(demoRosterPatterns(SAMPLE_CLIENT.id, now).length).toBeGreaterThanOrEqual(3);
    expect(demoRosterWins(SAMPLE_CLIENT.id, now).length).toBeGreaterThan(0);
  });
  it('the sample client needs the easier version today', () => {
    const days = demoRosterDays(SAMPLE_CLIENT.id, now);
    const a = actToday({
      firstName: 'Sam',
      day: days[days.length - 1]!,
      planned: demoPlannedToday(SAMPLE_CLIENT.id),
    });
    expect(a?.kind).toBe('ease');
  });
  it('Aisha gets a pain item, Mei a fuel item (for her own coach)', () => {
    const aisha = DEMO_CLIENTS[3]!.id;
    expect(
      actToday({
        firstName: 'Aisha',
        day: null,
        planned: demoPlannedToday(aisha),
        pain: { region: 'shoulder', side: 'left', days: 5 },
      })?.kind,
    ).toBe('pain');
    expect(
      actToday({
        firstName: 'Mei',
        day: null,
        planned: demoPlannedToday(DEMO_MEI_ID),
        fuelLevel: 'talk_to_someone',
      })?.kind,
    ).toBe('fuel');
  });
  it('Chris has not trained in the last 9 days', () => {
    const chris = demoRosterDays(DEMO_CLIENTS[4]!.id, now, { days: 14 });
    expect(chris.slice(-9).every((d) => d.training.sessions.length === 0)).toBe(true);
    expect(chris.slice(0, 5).some((d) => d.training.sessions.length > 0)).toBe(true);
  });
});
