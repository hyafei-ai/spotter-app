import { describe, expect, it } from 'vitest';
import {
  compromisedRunning,
  compromisedRunningAcross,
  fadeIndex,
  formatRaceTime,
  formatTimeDelta,
  isHyroxSimulation,
  isPlausibleSimDuration,
  pacingAnalysis,
  pacingLine,
  parseTimeInput,
  roxzone,
  stationVsBestLine,
  stationsVsBest,
} from '../src/hyrox';

/* MOCK splits written for these tests. */

describe('parseTimeInput', () => {
  it.each([
    ['4:05', 245],
    ['04:05', 245],
    ['4.05', 245],
    ['405', 245],
    ['1234', 754],
    ['45', 45],
    ['45s', 45],
    ['90 sec', 90],
    ['5m', 300],
    ['2 min', 120],
    ['1h 5m 3s', 3903],
    ['1:02:03', 3723],
    ['10203', 3723],
    [' 4:05 ', 245],
  ])('%s → %i', (input, sec) => {
    expect(parseTimeInput(input)).toBe(sec);
  });

  it.each([
    '',
    '   ',
    'abc',
    '4:75',
    '1:60:00',
    '475',
    '1:2:3:4',
    '-4:05',
    '1234567',
    null,
    undefined,
  ])('rejects %s', (input) => {
    expect(parseTimeInput(input as string)).toBeNull();
  });

  it('regression: reads back what formatRaceTime writes (the source rejected h:mm:ss)', () => {
    for (const sec of [59, 245, 3599, 3600, 3723, 5400])
      expect(parseTimeInput(formatRaceTime(sec))).toBe(sec);
  });

  it('regression: "5m" is five minutes, not five seconds', () => {
    expect(parseTimeInput('5m')).toBe(300);
  });
});

describe('formatRaceTime', () => {
  it('formats with and without hours', () => {
    expect(formatRaceTime(245)).toBe('4:05');
    expect(formatRaceTime(3723)).toBe('1:02:03');
    expect(formatRaceTime(0)).toBe('—');
    expect(formatRaceTime(null)).toBe('—');
  });

  it('regression: carries rounded seconds instead of printing :60', () => {
    expect(formatRaceTime(119.6)).toBe('2:00');
    expect(formatRaceTime(3599.7)).toBe('1:00:00');
  });

  it('formats deltas', () => {
    expect(formatTimeDelta(12)).toBe('+0:12');
    expect(formatTimeDelta(-75)).toBe('−1:15');
    expect(formatTimeDelta(0.2)).toBe('0:00');
  });
});

describe('pacing', () => {
  it('even, positive and negative splits', () => {
    expect(pacingAnalysis([300, 302, 298, 305, 301, 303, 299, 304])!.pattern).toBe('even');
    const pos = pacingAnalysis([280, 285, 290, 295, 320, 330, 340, 350])!;
    expect(pos.pattern).toBe('positive');
    expect(pos.fadePct).toBe(16.5);
    expect(pacingLine(pos)).toBe('Slowed 17% in the second half');
    const neg = pacingAnalysis([340, 330, 320, 310, 290, 285, 280, 270])!;
    expect(neg.pattern).toBe('negative');
    expect(pacingLine(neg)).toBe('13% faster in the second half');
    expect(pacingLine(pacingAnalysis([300, 300, 300, 300])!)).toBe(
      'Even pace: the second half was within 5% of the first',
    );
  });

  it('quarters', () => {
    const a = pacingAnalysis([280, 285, 290, 295, 320, 330, 340, 350])!;
    expect(a.quarterAvgSec).toEqual([282.5, 292.5, 325, 345]);
    expect([a.fastestQuarter, a.slowestQuarter]).toEqual([1, 4]);
  });

  it('regression: six splits make near-equal quarters (the source made 1, 1, 1, 3)', () => {
    const a = pacingAnalysis([100, 200, 300, 400, 500, 600])!;
    expect(a.quarterAvgSec).toEqual([150, 300, 450, 600]);
  });

  it('needs four timed splits and ignores empty ones', () => {
    expect(pacingAnalysis([300, 0, 310, 320])).toBeNull();
    expect(pacingAnalysis([300, 310, 320, 330, 0])).not.toBeNull();
  });

  it('fade index compares the last half of the runs with the first', () => {
    expect(fadeIndex([300, 300, 300, 300, 330, 330, 330, 330])).toBe(10);
    expect(fadeIndex([300, 300, 300, 999, 270, 270, 270])).toBe(-10);
    expect(fadeIndex([300, 310, 320, 330, 340])).toBeNull();
  });
});

describe('roxzone', () => {
  const runs = [300, 310, 320, 330, 300, 310, 320, 330];
  const stations = [240, 180, 200, 300, 250, 120, 240, 270];
  it('uses logged transitions when there are some', () => {
    expect(roxzone({ runSec: runs, stationSec: stations, transitionSec: [30, 40, 0, 50] })).toEqual(
      { sec: 120, source: 'recorded' },
    );
  });
  it('derives it from the total when every split is there', () => {
    const total = runs.reduce((a, b) => a + b) + stations.reduce((a, b) => a + b) + 400;
    expect(roxzone({ totalSec: total, runSec: runs, stationSec: stations })).toEqual({
      sec: 400,
      source: 'derived',
    });
  });
  it('says nothing when a split is missing or the sum is off', () => {
    expect(roxzone({ totalSec: 5000, runSec: runs.slice(0, 7), stationSec: stations })).toBeNull();
    expect(roxzone({ totalSec: 1000, runSec: runs, stationSec: stations })).toBeNull();
    expect(roxzone({ totalSec: null, runSec: runs, stationSec: stations })).toBeNull();
  });
  it('works for a half with four of each', () => {
    expect(
      roxzone({
        totalSec: 2000,
        runSec: [300, 300, 300, 300],
        stationSec: [100, 100, 100, 100],
        expectedSplits: 4,
      }),
    ).toEqual({ sec: 400, source: 'derived' });
  });
});

describe('stations vs own best', () => {
  const history = [
    {
      date: '2026-08-01',
      stations: [
        { station: 'Sled Push', sec: 190 },
        { station: 'SkiErg', sec: 250 },
      ],
    },
    {
      date: '2026-09-14',
      stations: [
        { station: 'Sled Push', sec: 173 },
        { station: 'SkiErg', sec: 255 },
      ],
    },
  ];
  it('compares each station with the best earlier time', () => {
    const r = stationsVsBest(
      [
        { station: 'Sled Push', sec: 185 },
        { station: 'skierg', sec: 240 },
        { station: 'Wall Balls', sec: 300 },
      ],
      history,
    );
    expect(r).toEqual([
      {
        station: 'Sled Push',
        sec: 185,
        bestSec: 173,
        bestDate: '2026-09-14',
        deltaSec: 12,
        isBest: false,
      },
      {
        station: 'skierg',
        sec: 240,
        bestSec: 250,
        bestDate: '2026-08-01',
        deltaSec: -10,
        isBest: true,
      },
      {
        station: 'Wall Balls',
        sec: 300,
        bestSec: null,
        bestDate: null,
        deltaSec: null,
        isBest: true,
      },
    ]);
    expect(r.map(stationVsBestLine)).toEqual([
      'Sled Push 3:05, 12 s off your best (2:53)',
      'skierg 4:00, a new best by 10 s',
      'Wall Balls 5:00, your first time logged',
    ]);
  });
});

describe('isHyroxSimulation', () => {
  it.each([
    [{ name: 'HYROX Sim', durationSec: 5400 }, true],
    [{ name: 'Hyrox simulation', durationSec: 4200 }, true],
    [{ name: 'Half HYROX', durationSec: 2400 }, true],
    [{ name: 'Hyrox full', durationSec: 4800 }, true],
    [{ name: 'HYROX skills', durationSec: 3600 }, false],
    [{ name: 'Hyrox strength', durationSec: 3600 }, false],
    [{ name: 'HYROX Sim', durationSec: 30 }, false],
    [{ name: 'HYROX Sim', durationSec: 4 * 3600 }, false],
    [{ name: 'Half HYROX', durationSec: 2 * 3600 }, false],
    [{ name: 'Saturday session', kind: 'race_sim', durationSec: 4500 }, true],
    [{ name: 'Saturday session', format: 'hyrox', durationSec: 600 }, false],
    [{ name: 'Simple run', durationSec: 3600 }, false],
  ])('%o → %s', (w, want) => {
    expect(isHyroxSimulation(w)).toBe(want);
  });
  it('plausibility bounds', () => {
    expect(isPlausibleSimDuration(30 * 60)).toBe(true);
    expect(isPlausibleSimDuration(29 * 60)).toBe(false);
    expect(isPlausibleSimDuration(15 * 60, true)).toBe(true);
    expect(isPlausibleSimDuration(null)).toBe(false);
  });
});

describe('compromised running', () => {
  // Run 1 fresh-ish, the run after sled push 15% slower.
  const SIM = [300, 310, 345, 330, 335, 320, 325, 340];

  it('attributes each run to the station before it and finds the worst', () => {
    const c = compromisedRunning({ runSec: SIM })!;
    expect(c.runs[0]).toMatchObject({ run: 1, after: null, vsFirstPct: null });
    expect(c.runs[1]).toMatchObject({ run: 2, after: 'SkiErg', vsFirstPct: 3.3 });
    expect(c.runs[2]).toMatchObject({ run: 3, after: 'Sled Push', vsFirstPct: 15 });
    expect(c.worst?.after).toBe('Sled Push');
    expect(c.lines).toEqual([
      'Running pace drops most after sled push: 15% slower than your first run',
    ]);
    expect(c.coachLines).toEqual([
      'Running pace drops most after sled push: 15% slower than their first run',
    ]);
  });

  it('compares with the fresh 1 km benchmark when there is one', () => {
    const c = compromisedRunning({ runSec: SIM }, 280)!;
    expect(c.runs[0]!.vsFreshPct).toBe(7.1);
    expect(c.lines[1]).toBe(
      'Across the race, runs averaged 16% slower than your fresh 1 km (4:40)',
    );
    expect(c.coachLines[1]).toBe('Runs averaged 16% slower than their fresh 1 km (4:40)');
  });

  it('uses pace per km, so different run distances compare fairly', () => {
    const c = compromisedRunning(
      { runSec: [150, 165, 150, 150], runDistanceM: [500, 500, 500, 500] },
      280,
    )!;
    expect(c.runs[1]!.paceSecPerKm).toBe(330);
    expect(c.worst?.after).toBe('SkiErg');
    expect(c.lines[0]).toBe(
      'Running pace drops most after the SkiErg: 10% slower than your first run',
    );
  });

  it('says so when every run held pace', () => {
    const c = compromisedRunning({ runSec: [300, 305, 302, 306] })!;
    expect(c.worst).toBeNull();
    expect(c.lines).toEqual(["Every run stayed within 3% of your first run's pace"]);
  });

  it('takes custom station lists', () => {
    const c = compromisedRunning({ runSec: [120, 140], runDistanceM: 400, stations: ['Burpees'] })!;
    expect(c.lines[0]).toBe(
      'Running pace drops most after burpees: 17% slower than your first run',
    );
  });

  it('needs two timed runs', () => {
    expect(compromisedRunning({ runSec: [300] })).toBeNull();
    expect(compromisedRunning({ runSec: [300, 0] })).toBeNull();
  });

  it('across sessions: the costliest station on average, with counts', () => {
    const sims = [
      { runSec: [300, 310, 345, 330, 335, 320, 325, 340] },
      { runSec: [295, 300, 335, 320, 310, 305, 315, 320] },
      { runSec: [290, 300, 320, 330, 345, 300, 300, 300] },
      { runSec: [300, 305, 340, 320, 320, 310, 310, 330] },
    ];
    const a = compromisedRunningAcross(sims)!;
    expect(a.byStation[0]).toMatchObject({ station: 'Sled Push', sessions: 4, worstIn: 3 });
    expect(a.lines).toEqual([
      'Running pace drops most after sled push: 13% slower than your first run on average across 4 simulations (the biggest drop in 3 of them)',
    ]);
    expect(a.coachLines[0]).toMatch(/than their first run on average across 4 simulations/);
    expect(compromisedRunningAcross(sims.slice(0, 1))).toBeNull();
  });
});
