import { describe, expect, it } from 'vitest';
import {
  RaceGoal,
  daysToRace,
  predictRaceFinish,
  raceReadiness,
  readinessPhase,
  type ReadinessSession,
} from '../src/race';

/* MOCK results written for these tests. */

const TODAY = '2026-10-23';
const iso = (offset: number) =>
  new Date(Date.UTC(2026, 9, 23) + offset * 86_400_000).toISOString().slice(0, 10);
const full = (offset: number, sec: number) => ({ date: iso(offset), sec, format: 'full' as const });
const half = (offset: number, sec: number) => ({ date: iso(offset), sec, format: 'half' as const });

describe('race goal', () => {
  it('validates', () => {
    expect(
      RaceGoal.safeParse({
        event: 'Spring race',
        kind: 'race_sim',
        date: '2027-03-14',
        targetSec: 5400,
        division: 'open_women',
        format: 'full',
      }).success,
    ).toBe(true);
    expect(
      RaceGoal.safeParse({
        event: 'City 10k',
        kind: 'run',
        date: '2027-03-14',
        targetSec: null,
        division: null,
        format: null,
      }).success,
    ).toBe(true);
    expect(
      RaceGoal.safeParse({
        event: '',
        kind: 'run',
        date: '2027-03-14',
        targetSec: null,
        division: null,
        format: null,
      }).success,
    ).toBe(false);
    expect(
      RaceGoal.safeParse({
        event: 'X',
        kind: 'run',
        date: '14/03/2027',
        targetSec: null,
        division: null,
        format: null,
      }).success,
    ).toBe(false);
  });
  it('counts days to the race', () => {
    expect(daysToRace(iso(14), TODAY)).toBe(14);
    expect(daysToRace(iso(-2), TODAY)).toBe(-2);
  });
});

describe('predictRaceFinish', () => {
  // Three full simulations improving by exactly 1 s a day.
  const SIMS = [full(-28, 5100), full(-14, 5086), full(0, 5072)];

  it('regression: the trend is seconds per day × days to race (the source multiplied by weeks, ~7× too small)', () => {
    const e = predictRaceFinish({
      race: { date: iso(14), format: 'full' },
      today: TODAY,
      officialRaces: [],
      sims: SIMS,
    });
    expect(e.trend).toEqual({ secPerWeek: -7, projectedSec: -14, capped: false });
    expect(e.estimateSec).toBe(5072 - 14);
    // The source would have applied -1 s/day × 2 weeks = -2 s.
    expect(e.estimateSec).not.toBe(5072 - 2);
  });

  it('regression: a full race uses full simulations, a half race half ones (the source had the filter inverted)', () => {
    const sims = [...SIMS, half(-10, 2700), half(-3, 2650)];
    const f = predictRaceFinish({
      race: { date: iso(14), format: 'full' },
      today: TODAY,
      officialRaces: [],
      sims,
    });
    expect(f.anchor).toEqual({ source: 'sim', sec: 5072, date: TODAY });
    expect(f.evidence).toBe('Based on 3 full simulations, most recent today');
    const h = predictRaceFinish({
      race: { date: iso(14), format: 'half' },
      today: TODAY,
      officialRaces: [],
      sims,
    });
    expect(h.anchor?.sec).toBe(2650);
    expect(h.evidence).toBe('Based on 2 half simulations, most recent 3 days ago');
    expect(h.trend).toBeNull();
  });

  it('anchors on the best official race when there is one, with evidence', () => {
    const e = predictRaceFinish({
      race: { date: iso(30), format: 'full' },
      today: TODAY,
      officialRaces: [full(-200, 5300), full(-90, 5150)],
      sims: [full(-12, 5200)],
    });
    expect(e.anchor).toEqual({ source: 'race', sec: 5150, date: iso(-90) });
    expect(e.evidence).toBe(
      'Based on 2 official full races and 1 full simulation, most recent 12 days ago',
    );
    expect(e.trend).toBeNull();
    expect(e.lines).toContain('No trend yet: that needs 3 full simulations');
    expect(e.lowSec).not.toBeNull();
  });

  it('the range comes from the athlete’s own spread; one result has no range', () => {
    const one = predictRaceFinish({
      race: { date: iso(30), format: 'full' },
      today: TODAY,
      officialRaces: [],
      sims: [full(-12, 5200)],
    });
    expect([one.estimateSec, one.lowSec, one.highSec]).toEqual([5200, null, null]);
    expect(one.lines).toContain('One result so far, so no range yet');
    const noisy = predictRaceFinish({
      race: { date: iso(14), format: 'full' },
      today: TODAY,
      officialRaces: [],
      sims: [full(-28, 5100), full(-21, 5160), full(-14, 5040), full(-7, 5110), full(0, 5000)],
    });
    expect(noisy.highSec! - noisy.lowSec!).toBeGreaterThan(0);
    expect(noisy.lowSec!).toBeLessThan(noisy.estimateSec!);
  });

  it('caps the trend at 8% of the best time', () => {
    const steep = [full(-20, 6000), full(-10, 5500), full(0, 5000)];
    const e = predictRaceFinish({
      race: { date: iso(60), format: 'full' },
      today: TODAY,
      officialRaces: [],
      sims: steep,
    });
    expect(e.trend?.capped).toBe(true);
    expect(e.trend?.projectedSec).toBe(-400);
    expect(e.lines.some((l) => l.includes('limited to 8% of the best time'))).toBe(true);
  });

  it('no trend when results are too inconsistent', () => {
    const wild = [full(-20, 2000), full(-10, 9000), full(0, 4000)];
    expect(
      predictRaceFinish({
        race: { date: iso(30), format: 'full' },
        today: TODAY,
        officialRaces: [],
        sims: wild,
      }).trend,
    ).toBeNull();
  });

  it('ignores future-dated and implausible results', () => {
    const e = predictRaceFinish({
      race: { date: iso(30), format: 'full' },
      today: TODAY,
      officialRaces: [],
      sims: [full(5, 4000), full(-3, 30), full(-5, 5000)],
    });
    expect(e.anchor?.sec).toBe(5000);
    expect(e.evidence).toBe('Based on 1 full simulation, most recent 5 days ago');
  });

  it('nothing to anchor on: no number, and says what to do', () => {
    const e = predictRaceFinish({
      race: { date: iso(30), format: 'full' },
      today: TODAY,
      officialRaces: [],
      sims: [half(-3, 2650)],
    });
    expect([e.estimateSec, e.lowSec, e.highSec, e.anchor]).toEqual([null, null, null, null]);
    expect(e.evidence).toBe('No full race or simulation logged yet');
    expect(e.lines).toEqual(['Log one full simulation to see an estimate']);
  });

  it('notes missing race-format work as evidence, without changing the number', () => {
    const base = {
      race: { date: iso(30), format: 'full' as const },
      today: TODAY,
      officialRaces: [],
      sims: [full(-30, 5200)],
    };
    const a = predictRaceFinish({ ...base, lastRaceFormatSession: iso(-30) });
    const b = predictRaceFinish({ ...base, lastRaceFormatSession: iso(-3) });
    expect(a.estimateSec).toBe(b.estimateSec);
    expect(a.lines).toContain('No race-format session in the last 14 days');
    expect(b.lines).not.toContain('No race-format session in the last 14 days');
  });
});

describe('raceReadiness', () => {
  const s = (offset: number, extra: Partial<ReadinessSession> = {}): ReadinessSession => ({
    date: iso(offset),
    raceFormat: false,
    ...extra,
  });
  const steady = (from: number, to: number, every = 2) => {
    const out: ReadinessSession[] = [];
    for (let d = from; d <= to; d += every) out.push(s(-d));
    return out;
  };

  it('phases', () => {
    expect([
      readinessPhase(40),
      readinessPhase(14),
      readinessPhase(7),
      readinessPhase(0),
      readinessPhase(-1),
    ]).toEqual(['build', 'taper', 'race_week', 'race_week', 'past']);
    expect(readinessPhase(20, 21)).toBe('taper');
  });

  it('five dimensions, each a reading and an action, no score', () => {
    const r = raceReadiness({
      race: { date: iso(45), format: 'full' },
      today: TODAY,
      sessions: steady(1, 55),
    });
    expect(r.dimensions.map((d) => d.kind)).toEqual([
      'volume',
      'engine',
      'recovery',
      'specificity',
      'taper',
    ]);
    for (const d of r.dimensions) {
      expect(d.reading.length).toBeGreaterThan(0);
      expect(d.action.length).toBeGreaterThan(0);
    }
    expect(r).not.toHaveProperty('overall');
    expect(r).not.toHaveProperty('verdict');
  });

  it('volume against the athlete’s own previous month', () => {
    const sessions = [...steady(29, 55, 2), ...steady(1, 27, 4)];
    const v = raceReadiness({ race: { date: iso(45), format: 'full' }, today: TODAY, sessions })
      .dimensions[0]!;
    expect(v.reading).toBe('7 sessions in the last 4 weeks, down from 14 the 4 weeks before');
    expect(v.action).toBe('Get back toward 14 sessions a month before adding anything new');
    expect(v.needsAttention).toBe(true);
    const none = raceReadiness({
      race: { date: iso(45), format: 'full' },
      today: TODAY,
      sessions: [],
    }).dimensions[0]!;
    expect([none.reading, none.needsAttention]).toEqual([
      'No training logged in the last 8 weeks',
      null,
    ]);
  });

  it('engine from simulation times, else heart rate, else says it can’t tell', () => {
    const sims = [
      s(-50, { raceFormat: true, finishSec: 5400, format: 'full' }),
      s(-20, { raceFormat: true, finishSec: 5300, format: 'full' }),
      s(-5, { raceFormat: true, finishSec: 5270, format: 'full' }),
    ];
    const e = raceReadiness({
      race: { date: iso(45), format: 'full' },
      today: TODAY,
      sessions: sims,
    }).dimensions[1]!;
    expect(e.reading).toBe(
      'Latest simulation 1:27:50, 2:10 faster than the first in the last 8 weeks (3 simulations)',
    );
    expect(e.needsAttention).toBe(false);
    const hr = [
      s(-40, { raceFormat: true, avgHr: 160 }),
      s(-35, { raceFormat: true, avgHr: 158 }),
      s(-10, { raceFormat: true, avgHr: 152 }),
      s(-3, { raceFormat: true, avgHr: 150 }),
    ];
    const h = raceReadiness({ race: { date: iso(45), format: 'full' }, today: TODAY, sessions: hr })
      .dimensions[1]!;
    expect(h.reading).toBe(
      'Average heart rate in race-format sessions: 151 bpm in the last 4 weeks, 159 bpm the 4 weeks before',
    );
    expect(h.needsAttention).toBeNull();
    const none = raceReadiness({
      race: { date: iso(45), format: 'full' },
      today: TODAY,
      sessions: [],
    }).dimensions[1]!;
    expect(none.reading).toBe('Not enough timed simulations to compare yet');
  });

  it('recovery from the daily read over the last week', () => {
    const reads = [
      { date: iso(0), tone: 'ease' as const },
      { date: iso(-1), tone: 'steady' as const },
      { date: iso(-2), tone: 'ease' as const },
      { date: iso(-3), tone: 'watch' as const },
      { date: iso(-9), tone: 'ease' as const },
    ];
    const r = raceReadiness({
      race: { date: iso(45), format: 'full' },
      today: TODAY,
      sessions: [],
      reads,
    }).dimensions[2]!;
    expect(r).toMatchObject({
      reading: 'Running tired on 2 of the last 4 days read',
      action: 'Ease the next hard session and protect sleep',
      needsAttention: true,
    });
    const none = raceReadiness({
      race: { date: iso(45), format: 'full' },
      today: TODAY,
      sessions: [],
    }).dimensions[2]!;
    expect([none.reading, none.needsAttention]).toEqual(['No daily read this week', null]);
  });

  it('race-specific work depends on the phase', () => {
    const build = raceReadiness({
      race: { date: iso(45), format: 'full' },
      today: TODAY,
      sessions: steady(1, 20),
    }).dimensions[3]!;
    expect(build).toMatchObject({
      reading: 'No race-format session in the last 4 weeks',
      action: 'Plan a half simulation in the next two weeks',
      needsAttention: true,
    });
    const taper = raceReadiness({
      race: { date: iso(10), format: 'full' },
      today: TODAY,
      sessions: steady(1, 20),
    }).dimensions[3]!;
    expect(taper.action).toBe(
      'Too close for a full simulation; do a short race-pace opener instead',
    );
    const done = raceReadiness({
      race: { date: iso(45), format: 'full' },
      today: TODAY,
      sessions: [s(-9, { raceFormat: true })],
    }).dimensions[3]!;
    expect(done).toMatchObject({
      reading: '1 race-format session in the last 4 weeks, the latest 9 days ago',
      needsAttention: false,
    });
  });

  it('taper compares this week with the usual week', () => {
    const sessions = [...steady(1, 55, 2), s(0), s(-2)];
    const t = raceReadiness({ race: { date: iso(10), format: 'full' }, today: TODAY, sessions });
    expect(t.phase).toBe('taper');
    const d = t.dimensions[4]!;
    expect(d.reading).toBe('Race in 10 days: 5 sessions this week, usually 3.8');
    expect(d).toMatchObject({
      action: 'Cut the number or length of sessions; keep some intensity',
      needsAttention: true,
    });
    const past = raceReadiness({ race: { date: iso(-3), format: 'full' }, today: TODAY, sessions })
      .dimensions[4]!;
    expect(past.reading).toBe('The race was 3 days ago');
    const build = raceReadiness({ race: { date: iso(45), format: 'full' }, today: TODAY, sessions })
      .dimensions[4]!;
    expect(build.reading).toBe(
      'Race in 45 days: not tapering yet (5 sessions this week, usually 3.8)',
    );
  });
});
