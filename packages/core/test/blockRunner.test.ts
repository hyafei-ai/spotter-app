import { describe, expect, it } from 'vitest';
import {
  LEAD_IN_SEC,
  NEW_RUNNER,
  UNDO_WINDOW_SEC,
  blocksFromTemplate,
  newWorkoutBlock,
  runnerReduce,
  runnerScore,
  runnerSpec,
  runnerSplits,
  runnerView,
  settle,
  templateById,
  type Block,
  type RunnerEvent,
  type RunnerState,
} from '../src';

let n = 0;
const ids = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
const T0 = 1_000_000;
const L = LEAD_IN_SEC * 1000;
/** Wall time `s` seconds into the work (after the lead-in). */
const at = (s: number) => T0 + L + s * 1000;

function run(b: Block, events: RunnerEvent[]) {
  const spec = runnerSpec(b)!;
  let s: RunnerState = NEW_RUNNER;
  for (const e of events) s = runnerReduce(spec, s, e);
  return { spec, s, view: (now: number) => runnerView(spec, s, now) };
}

describe('AMRAP countdown', () => {
  const amrap = { ...newWorkoutBlock('amrap', ids), durationSec: 600 } as Block;

  it('counts down after a 3 s lead-in, counts rounds, and ends by itself', () => {
    const r = run(amrap, [{ type: 'start', at: T0 }]);
    expect(r.view(T0)).toMatchObject({ phase: 'lead_in', clockSec: 3 });
    expect(r.view(at(0.5))).toMatchObject({ phase: 'work', clockSec: 600, direction: 'down' });
    const r2 = run(amrap, [{ type: 'start', at: T0 }, { type: 'lap', at: at(80) }, { type: 'lap', at: at(170) }]);
    expect(r2.view(at(200))).toMatchObject({ laps: 2, index: 3, clockSec: 400 });
    expect(r2.view(at(601))).toMatchObject({ phase: 'done', clockSec: 0, ended: 'finished' });
    const settled = settle(r2.spec, r2.s, at(700));
    expect(settled.endedAt).toBe(600_000);
    expect(runnerScore(amrap, r2.spec, settled)).toMatchObject({ rounds: 2, reps: 0 });
  });

  it('pausing stops the clock; a round tap can be undone', () => {
    const r = run(amrap, [{ type: 'start', at: T0 }, { type: 'pause', at: at(60) }, { type: 'resume', at: at(90) }, { type: 'lap', at: at(100) }, { type: 'undo', at: at(200) }]);
    expect(r.view(at(120))).toMatchObject({ clockSec: 510, laps: 0 });
  });

  it('a tap while paused does nothing', () => {
    const r = run(amrap, [{ type: 'start', at: T0 }, { type: 'pause', at: at(10) }, { type: 'lap', at: at(20) }]);
    expect(r.s.laps).toEqual([]);
  });
});

describe('EMOM windows and tabata', () => {
  it('EMOM 10: minute by minute, then done at 10:00', () => {
    const b = { ...newWorkoutBlock('emom', ids), intervalSec: 60, rounds: 10 } as Block;
    const r = run(b, [{ type: 'start', at: T0 }]);
    expect(r.view(at(0))).toMatchObject({ phase: 'work', index: 1, clockSec: 60 });
    expect(r.view(at(185))).toMatchObject({ phase: 'work', index: 4, clockSec: 55, of: 10 });
    expect(r.view(at(600))).toMatchObject({ phase: 'done' });
  });

  it('tabata alternates 20 s work and 10 s rest, with no rest after the last round', () => {
    const b = newWorkoutBlock('tabata', ids);
    const r = run(b, [{ type: 'start', at: T0 }]);
    expect(r.view(at(5))).toMatchObject({ phase: 'work', index: 1, clockSec: 15 });
    expect(r.view(at(25))).toMatchObject({ phase: 'rest', index: 2, clockSec: 5 });
    expect(r.view(at(7 * 30 + 19))).toMatchObject({ phase: 'work', index: 8, clockSec: 1 });
    expect(r.spec.totalSec).toBe(230);
    expect(r.view(at(231))).toMatchObject({ phase: 'done' });
  });

  it('interval AMRAP counts rounds only during work', () => {
    const b = newWorkoutBlock('interval_amrap', ids); // 3 × 4 min, 2 min rest
    const r = run(b, [{ type: 'start', at: T0 }, { type: 'lap', at: at(100) }, { type: 'lap', at: at(250) }]);
    expect(r.s.laps).toHaveLength(1);
    expect(r.view(at(250))).toMatchObject({ phase: 'rest', index: 2 });
  });
});

describe('for time with a cap', () => {
  it('Done stops the clock and gives the time', () => {
    const b = blocksFromTemplate(templateById('benchmark.fran')!, ids).blocks[0]!;
    const r = run(b, [{ type: 'start', at: T0 }, { type: 'lap', at: at(90) }, { type: 'lap', at: at(170) }, { type: 'lap', at: at(200) }, { type: 'finish', at: at(252) }]);
    expect(r.s.laps).toHaveLength(2); // 21-15-9: the third round ends with Done, not a lap
    expect(r.view(at(400))).toMatchObject({ phase: 'done', clockSec: 252 });
    expect(runnerScore(b, r.spec, r.s)).toMatchObject({ timeSec: 252, capped: false });
    expect(runnerSplits(r.spec, r.s).map((x) => x.sec)).toEqual([90, 80, 82]); // Done closes round 3
  });

  it('the cap ends it and asks for reps instead of a time', () => {
    const b = { ...newWorkoutBlock('for_time', ids), timeCapSec: 600 } as Block;
    const r = run(b, [{ type: 'start', at: T0 }]);
    expect(r.view(at(590))).toMatchObject({ capLeftSec: 10, clockSec: 590 });
    const s = settle(r.spec, r.s, at(605));
    expect(s.ended).toBe('capped');
    expect(runnerScore(b, r.spec, s)).toMatchObject({ capped: true, timeSec: null });
  });
});

describe('intervals', () => {
  it('distance reps: Done ends each rep, rest counts down, splits are work only', () => {
    const b = newWorkoutBlock('intervals', ids); // 5 × 1 km, 2 min rest
    const ev: RunnerEvent[] = [{ type: 'start', at: T0 }];
    let t = 0;
    for (const work of [261, 270, 272, 275, 278]) {
      t += work;
      ev.push({ type: 'lap', at: at(t) });
      t += 120;
    }
    const r = run(b, ev.slice(0, 2));
    expect(r.view(at(261 + 30))).toMatchObject({ phase: 'rest', clockSec: 90, index: 2 });
    expect(r.view(at(261 + 150))).toMatchObject({ phase: 'work', clockSec: 30, index: 2 });
    const all = run(b, ev);
    expect(all.s.ended).toBe('finished');
    expect(runnerSplits(all.spec, all.s).map((x) => x.sec)).toEqual([261, 270, 272, 275, 278]);
    expect(runnerScore(b, all.spec, all.s)).toMatchObject({ timeSec: 1356, distanceM: 5000 });
  });

  it('a tap during rest does nothing', () => {
    const b = newWorkoutBlock('intervals', ids);
    const r = run(b, [{ type: 'start', at: T0 }, { type: 'lap', at: at(200) }, { type: 'lap', at: at(210) }]);
    expect(r.s.laps).toHaveLength(1);
  });

  it('time reps run on the clock alone', () => {
    const b = { ...newWorkoutBlock('intervals', ids), distanceM: null, workSec: 60, restSec: 60, reps: 3 } as Block;
    const r = run(b, [{ type: 'start', at: T0 }]);
    expect(r.view(at(90))).toMatchObject({ phase: 'rest', index: 2 });
    const s = settle(r.spec, r.s, at(400));
    expect(runnerSplits(r.spec, s)).toHaveLength(3);
  });
});

describe('race simulation segments', () => {
  const sim = blocksFromTemplate(templateById('race.half.singles.open_women')!, ids).blocks[0]!;

  it('one Done per segment; the last one ends the sim', () => {
    const ev: RunnerEvent[] = [{ type: 'start', at: T0 }];
    let t = 0;
    for (let i = 0; i < 8; i++) ev.push({ type: 'lap', at: at((t += 240 + i)) });
    const r = run(sim, ev);
    expect(r.s.ended).toBe('finished');
    const splits = runnerSplits(r.spec, r.s);
    expect(splits.map((x) => x.kind)).toEqual(['run', 'station', 'run', 'station', 'run', 'station', 'run', 'station']);
    expect(splits[0]!.sec).toBe(240);
    expect(runnerScore(sim, r.spec, r.s).timeSec).toBe(t);
  });

  it('undo works for 5 seconds after a Done, then not', () => {
    const r = run(sim, [{ type: 'start', at: T0 }, { type: 'lap', at: at(240) }]);
    expect(r.view(at(240 + UNDO_WINDOW_SEC - 1)).canUndo).toBe(true);
    expect(r.view(at(240 + UNDO_WINDOW_SEC + 1)).canUndo).toBe(false);
    const undone = runnerReduce(r.spec, r.s, { type: 'undo', at: at(242) });
    expect(undone.laps).toEqual([]);
    expect(runnerView(r.spec, undone, at(250))).toMatchObject({ index: 1, clockSec: 250 });
  });

  it('undoing the final Done reopens the last segment', () => {
    const ev: RunnerEvent[] = [{ type: 'start', at: T0 }];
    for (let i = 1; i <= 8; i++) ev.push({ type: 'lap', at: at(i * 100) });
    const r = run(sim, ev);
    const reopened = runnerReduce(r.spec, r.s, { type: 'undo', at: at(802) });
    expect(reopened.ended).toBeNull();
    expect(runnerView(r.spec, reopened, at(810))).toMatchObject({ phase: 'work', index: 8 });
  });

  it('ending early keeps what was done', () => {
    const r = run(sim, [{ type: 'start', at: T0 }, { type: 'lap', at: at(240) }, { type: 'finish', at: at(300), early: true }]);
    expect(r.s.ended).toBe('ended_early');
    expect(runnerSplits(r.spec, r.s)).toHaveLength(1);
  });
});

describe('a runner survives the app being killed', () => {
  it('the same state read later gives the same clock', () => {
    const b = newWorkoutBlock('amrap', ids);
    const r = run(b, [{ type: 'start', at: T0 }, { type: 'lap', at: at(60) }]);
    const restored = JSON.parse(JSON.stringify(r.s)) as RunnerState;
    expect(runnerView(r.spec, restored, at(300))).toEqual(r.view(at(300)));
  });

  it('strength and notes have no runner', () => {
    expect(runnerSpec(newWorkoutBlock('strength', ids))).toBeNull();
    expect(runnerSpec(newWorkoutBlock('note', ids))).toBeNull();
  });
});
