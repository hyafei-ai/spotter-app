import { uuidv7 } from './ids';
import { STARTER_LIBRARY, findLibraryExercise } from './library';
import { formatRaceTime } from './hyrox';
import { formatNumber, toDisplay, type WeightUnit } from './units';
import { parseWorkout, splitWorkoutParts } from './parse/segments';
import { WORKOUT_FORMAT_LABEL, type ParseOptions, type ParsedSegment, type ParsedWorkout } from './parse/types';
import { BENCHMARKS } from './templates/benchmarks';
import { HYROX_STATION_IDS } from './templates/raceSims';
import type { TemplateWorkout } from './templates/types';
import type {
  Block,
  BlockKind,
  BlockMovement,
  BlockOf,
  BlockResult,
  BlockScore,
  IntervalModality,
  LoggedSet,
  RaceSegment,
  ScoringMode,
  SessionPlan,
} from './schemas';

/**
 * The block workout model (docs/ports.md row 1, docs/features/multisport-core.md): kinds, defaults, how each kind
 * is scored, plain descriptions, mapping from the paste parser and the templates, and session progress across
 * blocks. Ported in idea from Station Zero's `src/types/index.ts` (WorkoutBlock, ScoringMode) and
 * `src/utils/inferWorkoutMeta.ts`; the shapes are Spotter's (schemas.ts `Block`).
 */

const r1 = (n: number) => Math.round(n * 10) / 10;

/* ---------- labels ---------- */

export const BLOCK_KIND_LABEL: Record<BlockKind, string> = {
  strength: 'Strength',
  rounds_for_time: 'Rounds for time',
  amrap: 'AMRAP',
  interval_amrap: 'Interval AMRAP',
  emom: 'EMOM',
  for_time: 'For time',
  rep_scheme: 'Rep scheme',
  tabata: 'Tabata',
  intervals: 'Intervals',
  station_race: 'Race simulation',
  timed: 'Timed piece',
  rest: 'Rest',
  note: 'Note',
};

/** One example line per kind, for the block picker. */
export const BLOCK_KIND_EXAMPLE: Record<BlockKind, string> = {
  strength: 'Sets, reps and load: 5 × 5 back squat',
  rounds_for_time: '3 rounds of a few movements, as fast as possible',
  amrap: 'As many rounds as possible in a set time',
  interval_amrap: 'AMRAP windows with rest between: 3 × 4 min, 2 min rest',
  emom: 'Every minute on the minute (or every 2, 3 …)',
  for_time: 'A list done once, as fast as possible (a chipper)',
  rep_scheme: 'Descending reps like 21-15-9',
  tabata: '8 rounds of 20 s on, 10 s off',
  intervals: 'Run, row, bike or ski reps with rest: 5 × 1 km, 2 min rest',
  station_race: 'Runs and stations in order, split by split',
  timed: 'A steady piece for a set time: 20 min easy row',
  rest: 'Planned rest between parts',
  note: 'A line of instructions for the client',
};

export const SCORING_LABEL: Record<ScoringMode, string> = {
  time: 'Time',
  rounds_reps: 'Rounds + reps',
  load: 'Heaviest load',
  reps: 'Total reps',
  distance: 'Distance',
  calories: 'Calories',
  none: 'Not scored',
};

export const MODALITY_LABEL: Record<IntervalModality, string> = {
  run: 'Run',
  row: 'Row',
  bike: 'Bike',
  ski: 'Ski',
  swim: 'Swim',
  other: 'Intervals',
};

/** Picker groups (docs/ux/multisport.md 5.2), in the default order. */
export const BLOCK_GROUPS: { id: 'strength' | 'functional' | 'endurance' | 'race' | 'other'; label: string; kinds: BlockKind[] }[] = [
  { id: 'strength', label: 'Strength', kinds: ['strength'] },
  { id: 'functional', label: 'Functional fitness · WODs', kinds: ['for_time', 'rounds_for_time', 'amrap', 'emom', 'rep_scheme', 'tabata', 'interval_amrap'] },
  { id: 'endurance', label: 'Endurance', kinds: ['intervals'] },
  { id: 'race', label: 'Race-format', kinds: ['station_race'] },
  { id: 'other', label: 'Other', kinds: ['timed', 'rest', 'note'] },
];

/* ---------- scoring (port of inferWorkoutMeta.ts, per block) ---------- */

/** The usual score for a kind. The coach can change it. */
export function defaultScoring(kind: BlockKind): ScoringMode {
  switch (kind) {
    case 'rounds_for_time':
    case 'for_time':
    case 'rep_scheme':
    case 'intervals':
    case 'station_race':
      return 'time';
    case 'amrap':
    case 'interval_amrap':
      return 'rounds_reps';
    case 'tabata':
      return 'reps';
    case 'strength':
      return 'load';
    default:
      return 'none';
  }
}

export type SessionType = 'strength' | 'conditioning' | 'intervals' | 'race_sim' | 'test' | 'mixed';
export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  strength: 'Strength',
  conditioning: 'Conditioning',
  intervals: 'Intervals',
  race_sim: 'Race simulation',
  test: 'Test',
  mixed: 'Mixed',
};

/**
 * What kind of session a list of blocks makes (inferWorkoutType in the source), conservative on purpose: when
 * the mix is unclear it says "mixed" rather than guessing. A name like "race sim" or "simulation" wins.
 */
export function inferSessionType(blocks: Pick<Block, 'kind'>[], name?: string | null): SessionType {
  const n = (name ?? '').toLowerCase();
  if (/\brace\s*sim|\bsimulation\b|\bhyrox\b/.test(n)) return 'race_sim';
  const kinds = blocks.map((b) => b.kind).filter((k) => k !== 'rest' && k !== 'note');
  if (!kinds.length) return 'mixed';
  if (kinds.includes('station_race')) return 'race_sim';
  if (kinds.filter((k) => k === 'strength').length / kinds.length >= 0.6) return 'strength';
  if (kinds.every((k) => k === 'intervals' || k === 'timed')) return 'intervals';
  if (kinds.every((k) => k === 'emom' || k === 'tabata' || k === 'interval_amrap')) return 'conditioning';
  const conditioning = kinds.filter((k) => ['rounds_for_time', 'amrap', 'for_time', 'rep_scheme', 'emom', 'tabata', 'interval_amrap'].includes(k)).length;
  if (conditioning / kinds.length >= 0.5) return 'conditioning';
  return 'mixed';
}

/** The session's headline score: the dominant block kind's usual scoring (inferScoringMode in the source). */
export function inferSessionScoring(blocks: Pick<Block, 'kind'>[]): ScoringMode {
  const kinds = blocks.map((b) => b.kind).filter((k) => k !== 'rest' && k !== 'note');
  if (!kinds.length) return 'none';
  const counts = new Map<BlockKind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return defaultScoring(dominant);
}

/* ---------- making blocks ---------- */

export function newMovement(fields: Partial<BlockMovement> & Pick<BlockMovement, 'name'>, newId: () => string = uuidv7): BlockMovement {
  return {
    id: newId(),
    movementId: null,
    reps: null,
    repsAlt: null,
    loadKg: null,
    loadKgAlt: null,
    pct1rm: null,
    calories: null,
    caloriesAlt: null,
    distanceM: null,
    durationSec: null,
    note: null,
    verify: false,
    ...fields,
  };
}

const lib = (id: string) => STARTER_LIBRARY.find((e) => e.id === id);
const mv = (movementId: string, fields: Partial<BlockMovement>, newId: () => string) =>
  newMovement({ name: lib(movementId)?.name ?? movementId, movementId, ...fields }, newId);

/**
 * A new block of a kind with sensible defaults (docs/ux/multisport.md 5.2), so the coach edits rather than
 * fills in. Strength starts empty: its exercises come from the library picker.
 */
export function newWorkoutBlock(kind: BlockKind, newId: () => string = uuidv7): Block {
  const base = { id: newId(), title: null, note: null, scoring: defaultScoring(kind), timeCapSec: null, templateId: null };
  switch (kind) {
    case 'strength':
      return { ...base, kind, exerciseIds: [] };
    case 'rounds_for_time':
      return { ...base, kind, rounds: 3, restSec: null, movements: [mv('run', { distanceM: 400 }, newId), mv('kettlebell-swing', { reps: 21 }, newId), mv('pull-up', { reps: 12 }, newId)] };
    case 'amrap':
      return { ...base, kind, durationSec: 12 * 60, movements: [mv('pull-up', { reps: 5 }, newId), mv('push-up', { reps: 10 }, newId), mv('air-squat', { reps: 15 }, newId)] };
    case 'interval_amrap':
      return { ...base, kind, rounds: 3, workSec: 240, restSec: 120, movements: [mv('rower', { calories: 12 }, newId), mv('burpee', { reps: 10 }, newId)] };
    case 'emom':
      return { ...base, kind, intervalSec: 60, rounds: 10, rotate: false, movements: [mv('kettlebell-swing', { reps: 12 }, newId)] };
    case 'for_time':
      return { ...base, timeCapSec: 15 * 60, kind, movements: [mv('rower', { distanceM: 1000 }, newId), mv('thruster', { reps: 50 }, newId), mv('pull-up', { reps: 30 }, newId)] };
    case 'rep_scheme':
      return { ...base, timeCapSec: 10 * 60, kind, scheme: [21, 15, 9], movements: [mv('thruster', {}, newId), mv('pull-up', {}, newId)] };
    case 'tabata':
      return { ...base, kind, rounds: 8, workSec: 20, restSec: 10, movements: [mv('air-squat', {}, newId)] };
    case 'intervals':
      return { ...base, kind, modality: 'run', reps: 5, workSec: null, distanceM: 1000, restSec: 120, target: null };
    case 'station_race':
      return { ...base, kind, segments: defaultRaceSegments(newId) };
    case 'timed':
      return { ...base, kind, durationSec: 10 * 60, movements: [mv('rower', { note: 'easy' }, newId)] };
    case 'rest':
      return { ...base, kind, durationSec: 120 };
    case 'note':
      return { ...base, kind, text: '' };
  }
}

/** Eight runs and eight stations, distances only; loads are the coach's to set (no invented standards). */
function defaultRaceSegments(newId: () => string): RaceSegment[] {
  const stations: [string, Partial<BlockMovement>][] = [
    ['ski-erg', { distanceM: 1000 }],
    ['sled-push', { distanceM: 50 }],
    ['sled-pull', { distanceM: 50 }],
    ['burpee-broad-jump', { distanceM: 80 }],
    ['rower', { distanceM: 1000 }],
    ['farmer-carry', { distanceM: 200 }],
    ['sandbag-lunge', { distanceM: 100 }],
    ['wall-ball', { reps: 100 }],
  ];
  return stations.flatMap(([id, f], i) => [
    { ...mv('run', { name: `Run ${i + 1}`, distanceM: 1000, verify: true }, newId), name: `Run ${i + 1}`, kind: 'run' as const },
    { ...mv(id, { ...f, verify: true }, newId), kind: 'station' as const },
  ]);
}

/** A copy with fresh ids (for templates added twice, or copying a day). */
export function cloneBlock(b: Block, newId: () => string = uuidv7): Block {
  const fresh = <T extends { id: string }>(xs: T[]) => xs.map((x) => ({ ...x, id: newId() }));
  const out = { ...b, id: newId() } as Block;
  if ('movements' in out) (out as { movements: BlockMovement[] }).movements = fresh(out.movements);
  if (out.kind === 'station_race') out.segments = fresh(out.segments);
  if (out.kind === 'strength') out.exerciseIds = [...out.exerciseIds];
  return out;
}

/* ---------- describing ---------- */

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const minutes = (sec: number) => (sec % 60 === 0 ? `${sec / 60}` : formatRaceTime(sec));
/** "1 km", "400 m", "1.5 km", "21.1 km". */
export function distanceText(m: number): string {
  if (m >= 1000 && m % 100 === 0) return `${formatNumber(m / 1000)} km`;
  return `${formatNumber(m)} m`;
}
/** "90 s", "2 min", "2:30". */
export function shortDuration(sec: number): string {
  if (sec < 60) return `${sec} s`;
  if (sec % 60 === 0) return `${sec / 60} min`;
  return formatRaceTime(sec);
}

/** A load in the tenant's unit, with a second standard when there is one: "43/30 kg". */
export function loadText(kg: number | null, altKg: number | null, unit: WeightUnit): string | null {
  if (kg == null) return null;
  const v = (x: number) => formatNumber(Math.round(toDisplay(x, unit) * 2) / 2);
  return altKg != null ? `${v(kg)}/${v(altKg)} ${unit}` : `${v(kg)} ${unit}`;
}

/** "Thruster" → "Thrusters" when there's more than one rep (library names are singular; whiteboards aren't). */
export function pluralName(name: string, reps: number | null): string {
  if (reps == null || reps <= 1 || /s$/i.test(name) || !/[a-z]$/i.test(name)) return name;
  return `${name}s`;
}

/** One movement as a whiteboard line: "21 Thrusters · 43/30 kg", "500 m Row", "15/12 cal Air Bike". */
export function movementLine(m: BlockMovement, unit: WeightUnit = 'kg'): string {
  const lead = [
    m.reps != null ? (m.repsAlt != null ? `${m.reps}/${m.repsAlt}` : `${m.reps}`) : null,
    m.calories != null ? (m.caloriesAlt != null ? `${m.calories}/${m.caloriesAlt} cal` : `${m.calories} cal`) : null,
    m.distanceM != null ? distanceText(m.distanceM) : null,
    m.durationSec != null ? shortDuration(m.durationSec) : null,
  ].filter(Boolean);
  const load = loadText(m.loadKg, m.loadKgAlt, unit) ?? (m.pct1rm != null ? `${Math.round(m.pct1rm * 100)}% of max` : null);
  return [`${lead.length ? `${lead.join(' ')} ` : ''}${pluralName(m.name, m.reps)}`, load, m.note].filter(Boolean).join(' · ');
}

/** A race-sim segment: runs read "Run 3 · 1 km"; stations as a whiteboard line ("50 m Sled Push · 102 kg"). */
export function segmentLine(s: RaceSegment, unit: WeightUnit = 'kg'): string {
  if (s.kind === 'run' && /^run\b/i.test(s.name)) return [s.name, s.distanceM != null ? distanceText(s.distanceM) : null, s.note].filter(Boolean).join(' · ');
  return movementLine(s, unit);
}

/**
 * The block's name as it reads in a result line: the title when the coach gave one ("Fran"), else the
 * whiteboard shorthand: "AMRAP 20", "EMOM 10", "21-15-9", "3 rounds for time", "5 × 1 km", "Race simulation".
 */
export function blockLabel(b: Block): string {
  if (b.title?.trim()) return b.title.trim();
  switch (b.kind) {
    case 'amrap':
      return `AMRAP ${minutes(b.durationSec)}`;
    case 'emom': {
      const total = b.intervalSec * b.rounds;
      return b.intervalSec === 60 ? `EMOM ${minutes(total)}` : `Every ${shortDuration(b.intervalSec)} × ${b.rounds}`;
    }
    case 'interval_amrap':
      return `${b.rounds} × AMRAP ${minutes(b.workSec)}`;
    case 'rounds_for_time':
      return `${count(b.rounds, 'round')} for time`;
    case 'rep_scheme':
      return b.scheme.join('-');
    case 'tabata':
      return `Tabata ${count(b.rounds, 'round')}`;
    case 'intervals': {
      const each = b.distanceM != null ? distanceText(b.distanceM) : shortDuration(b.workSec ?? 0);
      const what = b.modality === 'run' || b.modality === 'other' ? '' : ` ${MODALITY_LABEL[b.modality].toLowerCase()}`;
      return b.reps === 1 ? `${each}${what || (b.modality === 'run' ? ' run' : '')}` : `${b.reps} × ${each}${what}`;
    }
    case 'timed':
      return `${shortDuration(b.durationSec)} piece`;
    case 'rest':
      return `Rest ${shortDuration(b.durationSec)}`;
    default:
      return BLOCK_KIND_LABEL[b.kind];
  }
}

/** The kind line above a block ("AMRAP · 20 min", "Intervals · 2 min rest"). */
export function blockKindLine(b: Block): string {
  switch (b.kind) {
    case 'amrap':
      return `AMRAP · ${shortDuration(b.durationSec)}`;
    case 'emom':
      return `${b.intervalSec === 60 ? 'EMOM' : `Every ${shortDuration(b.intervalSec)}`} · ${count(b.rounds, b.intervalSec === 60 ? 'minute' : 'round')}${b.rotate ? ', rotating' : ''}`;
    case 'interval_amrap':
      return `Interval AMRAP · ${b.rounds} × ${shortDuration(b.workSec)}, ${shortDuration(b.restSec)} rest`;
    case 'tabata':
      return `Tabata · ${b.rounds} × ${b.workSec} s on, ${b.restSec} s off`;
    case 'intervals':
      return `${MODALITY_LABEL[b.modality]} intervals · ${b.restSec ? `${shortDuration(b.restSec)} rest` : 'no rest'}${b.target ? ` · ${targetText(b.target)}` : ''}`;
    case 'rep_scheme':
      // "For time · 21-15-9 · 10 min cap": what the client does, not what the builder calls it.
      return `${b.scoring === 'time' ? 'For time' : BLOCK_KIND_LABEL[b.kind]} · ${b.scheme.join('-')}${b.timeCapSec ? ` · ${shortDuration(b.timeCapSec)} cap` : ''}`;
    case 'rounds_for_time':
    case 'for_time':
      return `${BLOCK_KIND_LABEL[b.kind]}${b.timeCapSec ? ` · ${shortDuration(b.timeCapSec)} cap` : ''}`;
    case 'station_race': {
      const runs = b.segments.filter((s) => s.kind === 'run').length;
      return `Race simulation · ${count(runs, 'run')}, ${count(b.segments.length - runs, 'station')}`;
    }
    default:
      return BLOCK_KIND_LABEL[b.kind];
  }
}

export function targetText(t: NonNullable<BlockOf<'intervals'>['target']>): string {
  switch (t.kind) {
    case 'pace':
      return `target ${formatRaceTime(t.secPerKm)}/km`;
    case 'watts':
      return `target ${t.watts} W`;
    case 'hr_zone':
      return `heart rate zone ${t.zone}`;
    case 'rpe':
      return `RPE ${t.rpe}`;
  }
}

/** The lines under a block, as a client reads them. Strength blocks are described by their exercises elsewhere. */
export function blockLines(b: Block, unit: WeightUnit = 'kg'): string[] {
  switch (b.kind) {
    case 'strength':
      return [];
    case 'note':
      return b.text.trim() ? [b.text.trim()] : [];
    case 'rest':
      return [`Rest ${shortDuration(b.durationSec)}`];
    case 'intervals': {
      const each = b.distanceM != null ? distanceText(b.distanceM) : shortDuration(b.workSec ?? 0);
      return [`${b.reps} × ${each} ${MODALITY_LABEL[b.modality].toLowerCase()}${b.restSec ? `, ${shortDuration(b.restSec)} rest` : ''}`];
    }
    case 'station_race':
      // Runs read "Run 3 · 1 km"; stations as a whiteboard line ("50 m Sled Push · 102 kg").
      return b.segments.map((s) => segmentLine(s, unit));
    case 'emom':
      return b.movements.map((m, i) => (b.rotate && b.movements.length > 1 ? `Minute ${i + 1}: ${movementLine(m, unit)}` : movementLine(m, unit)));
    case 'rep_scheme':
      return b.movements.map((m) => movementLine({ ...m, reps: null }, unit));
    default:
      return b.movements.map((m) => movementLine(m, unit));
  }
}

/** One line for a builder row or a Today summary: "AMRAP 20 · 5 Pull-up, 10 Push-up, 15 Air Squat". */
export function describeBlock(b: Block, unit: WeightUnit = 'kg', exerciseNames: string[] = []): string {
  if (b.kind === 'strength') return exerciseNames.length ? exerciseNames.join(', ') : 'No exercises yet';
  const lines = blockLines(b, unit);
  const head = b.kind === 'rep_scheme' ? b.scheme.join('-') : b.kind === 'note' || b.kind === 'rest' || b.kind === 'intervals' ? null : blockLabel(b);
  const shown = b.kind === 'station_race' ? [`${b.segments.length} segments`] : lines.slice(0, 4).map((l) => l.split(' · ')[0]!);
  return [head, shown.join(', ') + (b.kind !== 'station_race' && lines.length > 4 ? '…' : '')].filter(Boolean).join(' · ');
}

/** Movements in a block that carry a number marked to verify (race loads and distances). */
export function blockNeedsVerify(b: Block): boolean {
  const ms = b.kind === 'station_race' ? b.segments : 'movements' in b ? b.movements : [];
  return ms.some((m) => m.verify);
}

export const CHECK_STANDARD = 'Check against the current official standard';

/* ---------- validation ---------- */

/** Plain problems for one block, or none. */
export function blockProblems(b: Block): string[] {
  const out: string[] = [];
  const label = blockLabel(b);
  if ('movements' in b && b.kind !== 'timed' && b.movements.length === 0) out.push(`${label}: add at least one movement.`);
  if (b.kind === 'strength' && b.exerciseIds.length === 0) out.push('Strength: add at least one exercise.');
  if (b.kind === 'intervals' && (b.workSec == null) === (b.distanceM == null)) out.push(`${label}: set a time or a distance for each rep, not both.`);
  if (b.kind === 'note' && !b.text.trim()) out.push('Note: write the instructions or remove it.');
  if (b.kind === 'station_race' && b.segments.length === 0) out.push('Race simulation: add the runs and stations.');
  if (b.timeCapSec != null && (b.kind === 'amrap' || b.kind === 'emom' || b.kind === 'tabata')) out.push(`${label}: a time cap only applies to work done for time.`);
  return out;
}

/* ---------- keys: which results compare with each other ---------- */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Results with the same key are the same piece of work done again: the template id when the block came from one
 * ("benchmark.fran"), else the title with the kind, else the structure (intervals by modality, reps and distance or
 * time; AMRAPs by length and movements).
 */
export function blockKey(b: Block): string {
  if (b.templateId) return b.templateId;
  if (b.title?.trim()) return `${b.kind}:${norm(b.title)}`;
  const names = 'movements' in b ? b.movements.map((m) => m.movementId ?? norm(m.name)).join('+') : '';
  switch (b.kind) {
    case 'intervals':
      return `intervals:${b.modality}:${b.reps}x${b.distanceM != null ? `${b.distanceM}m` : `${b.workSec}s`}`;
    case 'amrap':
      return `amrap:${b.durationSec}:${names}`;
    case 'station_race':
      return `station_race:${b.segments.map((s) => `${s.movementId ?? norm(s.name)}${s.distanceM ?? s.reps ?? ''}`).join('+')}`;
    case 'rep_scheme':
      return `rep_scheme:${b.scheme.join('-')}:${names}`;
    case 'rounds_for_time':
      return `rounds_for_time:${b.rounds}:${names}`;
    default:
      return `${b.kind}:${names}`;
  }
}

/* ---------- scores ---------- */

export const EMPTY_SCORE: BlockScore = { timeSec: null, rounds: null, reps: null, loadKg: null, distanceM: null, calories: null, capped: false, scaled: false };

/** Lower is better for time; higher for everything else. */
export function betterIsLower(r: Pick<BlockResult, 'scoring' | 'score'>): boolean {
  return r.scoring === 'time' && !r.score.capped;
}

/**
 * One comparable number per result, oriented so bigger is better: −seconds for time, rounds × 1000 + reps for an
 * AMRAP (rounds first), the load, reps, metres or calories. Capped "for time" results rank below every finish.
 */
export function scoreValue(r: Pick<BlockResult, 'scoring' | 'score'>): number | null {
  const s = r.score;
  switch (r.scoring) {
    case 'time':
      if (s.capped) return -1e7 + (s.rounds ?? 0) * 1000 + (s.reps ?? 0);
      return s.timeSec != null ? -s.timeSec : null;
    case 'rounds_reps':
      return s.rounds != null || s.reps != null ? (s.rounds ?? 0) * 1000 + (s.reps ?? 0) : null;
    case 'load':
      return s.loadKg;
    case 'reps':
      return s.reps;
    case 'distance':
      return s.distanceM;
    case 'calories':
      return s.calories;
    default:
      return null;
  }
}

/** Pace in seconds per km for a distance and time, or null. */
export const pacePerKm = (sec: number, m: number) => (m > 0 && sec > 0 ? (sec / m) * 1000 : null);

/** "4:31/km", or "1:52/500 m" for rowing and skiing (the erg convention). */
export function paceText(secPerKm: number, modality: IntervalModality = 'run'): string {
  if (modality === 'row' || modality === 'ski') return `${formatRaceTime(secPerKm / 2)}/500 m`;
  return `${formatRaceTime(secPerKm)}/km`;
}

/** Average work pace across interval splits with distance, in s/km. */
export function averagePace(splits: Pick<BlockResult['splits'][number], 'sec' | 'distanceM'>[]): number | null {
  const withD = splits.filter((s) => s.distanceM != null && s.distanceM > 0 && s.sec > 0);
  if (!withD.length) return null;
  const sec = withD.reduce((a, s) => a + s.sec, 0);
  const m = withD.reduce((a, s) => a + s.distanceM!, 0);
  return pacePerKm(sec, m);
}

/** The score alone: "4:12", "7 rounds + 12", "100 kg", "140 reps", "Capped · 2 rounds + 30". */
export function scoreText(r: Pick<BlockResult, 'scoring' | 'score' | 'splits' | 'kind'>, unit: WeightUnit = 'kg'): string {
  const s = r.score;
  const rr = () => (s.rounds != null ? `${count(s.rounds, 'round')}${s.reps ? ` + ${s.reps}` : ''}` : `${s.reps ?? 0} reps`);
  let text: string;
  switch (r.scoring) {
    case 'time':
      if (s.capped) text = `Capped · ${s.rounds != null ? rr() : `${s.reps ?? 0} reps`}`;
      else if (r.kind === 'intervals') {
        const pace = averagePace(r.splits);
        // One continuous effort (a time trial, a long run): the time, with the pace beside it.
        if (r.splits.length <= 1 && s.timeSec != null) text = pace != null ? `${formatRaceTime(s.timeSec)} (${paceText(pace)})` : formatRaceTime(s.timeSec);
        else text = pace != null ? `avg ${paceText(pace)}` : s.timeSec != null ? `avg ${formatRaceTime(s.timeSec / Math.max(1, r.splits.length))}` : '—';
      } else text = formatRaceTime(s.timeSec);
      break;
    case 'rounds_reps':
      text = rr();
      break;
    case 'load':
      text = s.loadKg != null ? `${formatNumber(r1(toDisplay(s.loadKg, unit)))} ${unit}` : '—';
      break;
    case 'reps':
      text = `${s.reps ?? 0} reps`;
      break;
    case 'distance':
      text = s.distanceM != null ? distanceText(s.distanceM) : '—';
      break;
    case 'calories':
      text = `${s.calories ?? 0} cal`;
      break;
    default:
      // Not scored (an EMOM for technique, a rest): it was done; a clock time would read like a score.
      text = 'Done';
  }
  return s.scaled ? `${text} (scaled)` : text;
}

/**
 * The result as one line in history and progress: "Fran 4:12", "AMRAP 20: 7 rounds + 12",
 * "5 × 1 km avg 4:31/km", "Race simulation 1:24:10".
 */
export function resultLine(r: Pick<BlockResult, 'label' | 'scoring' | 'score' | 'splits' | 'kind'>, unit: WeightUnit = 'kg'): string {
  const score = scoreText(r, unit);
  if (r.kind === 'intervals' || (r.scoring === 'time' && !r.score.capped)) return `${r.label} ${score}`;
  return `${r.label}: ${score}`;
}

/* ---------- sessions: blocks of a plan, progress through them ---------- */

/** The plan's blocks; a plan from before blocks is one strength block of every exercise. */
export function planBlocks(plan: Pick<SessionPlan, 'blocks' | 'exercises' | 'programDayId'>): Block[] {
  if (plan.blocks?.length) return plan.blocks;
  return plan.exercises.length ? [legacyStrengthBlock(plan.programDayId, plan.exercises.map((e) => e.id))] : [];
}

/** The one strength block that stands for a pre-block day: same id every time for the same day. */
export function legacyStrengthBlock(dayId: string, exerciseIds: string[]): BlockOf<'strength'> {
  return { id: `${dayId}:strength`, kind: 'strength', title: null, note: null, scoring: 'load', timeCapSec: null, templateId: null, exerciseIds };
}

/** True when a plan is strength only (one strength block or none): the logger looks exactly as it always has. */
export function isStrengthOnly(plan: Pick<SessionPlan, 'blocks' | 'exercises' | 'programDayId'>): boolean {
  return planBlocks(plan).every((b) => b.kind === 'strength');
}

/** Blocks the client logs a result for (rest and notes don't need one; strength is logged as sets). */
export const needsResult = (b: Block) => b.kind !== 'strength' && b.kind !== 'rest' && b.kind !== 'note';

export type SessionStep =
  | { kind: 'set'; blockId: string; programExerciseId: string; setIndex: number }
  | { kind: 'block'; block: Block };

/**
 * The next thing to do: blocks in order; inside a strength block, its exercises in the logger's performance order
 * (supersets alternate). Rest and note blocks never hold the session up.
 */
export function nextStep(
  plan: SessionPlan,
  logged: Pick<LoggedSet, 'programExerciseId' | 'setIndex'>[],
  results: Pick<BlockResult, 'blockId'>[],
): SessionStep | null {
  const done = new Set(logged.map((s) => `${s.programExerciseId}:${s.setIndex}`));
  const scored = new Set(results.map((r) => r.blockId));
  for (const b of planBlocks(plan)) {
    if (b.kind === 'strength') {
      const ex = b.exerciseIds.map((id) => plan.exercises.find((e) => e.id === id)).filter((e): e is SessionPlan['exercises'][number] => !!e);
      for (let i = 0; i < ex.length; ) {
        const g = ex[i]!.supersetGroup;
        let j = i + 1;
        if (g) while (j < ex.length && ex[j]!.supersetGroup === g) j++;
        const group = ex.slice(i, j);
        const rounds = Math.max(...group.map((e) => e.sets.length));
        for (let r = 0; r < rounds; r++)
          for (const e of group) {
            const s = e.sets[r];
            if (s && !done.has(`${e.id}:${s.index}`)) return { kind: 'set', blockId: b.id, programExerciseId: e.id, setIndex: s.index };
          }
        i = j;
      }
    } else if (needsResult(b) && !scored.has(b.id)) return { kind: 'block', block: b };
  }
  return null;
}

/** Planned items (sets plus blocks needing a result) and how many are done. */
export function sessionProgress(plan: SessionPlan, logged: Pick<LoggedSet, 'programExerciseId' | 'setIndex'>[], results: Pick<BlockResult, 'blockId'>[]): { done: number; planned: number; sets: number; blocks: number } {
  const blocks = planBlocks(plan);
  const ids = new Set(blocks.flatMap((b) => (b.kind === 'strength' ? b.exerciseIds : [])));
  const sets = plan.exercises.filter((e) => ids.has(e.id)).reduce((n, e) => n + e.sets.length, 0);
  const scoredBlocks = blocks.filter(needsResult);
  const doneSets = new Set(logged.filter((s) => ids.has(s.programExerciseId)).map((s) => `${s.programExerciseId}:${s.setIndex}`)).size;
  const doneBlocks = scoredBlocks.filter((b) => results.some((r) => r.blockId === b.id)).length;
  return { done: doneSets + doneBlocks, planned: sets + scoredBlocks.length, sets, blocks: scoredBlocks.length };
}

/** "3 exercises · AMRAP 20 · 5 × 1 km": the session in one line for Today. */
export function planSummary(plan: SessionPlan, unit: WeightUnit = 'kg'): string[] {
  return planBlocks(plan).flatMap((b) => {
    if (b.kind === 'strength') return b.exerciseIds.map((id) => plan.exercises.find((e) => e.id === id)?.name).filter((x): x is string => !!x);
    if (b.kind === 'rest' || b.kind === 'note') return [];
    return [b.title?.trim() ? b.title.trim() : describeBlock(b, unit).split(' · ')[0]!];
  });
}

/** Minutes a block takes when it's clock-bound, or a fair estimate; for "about 45 min" on Today. */
export function blockMinutes(b: Block): number {
  switch (b.kind) {
    case 'amrap':
    case 'timed':
    case 'rest':
      return b.durationSec / 60;
    case 'emom':
      return (b.intervalSec * b.rounds) / 60;
    case 'interval_amrap':
      return (b.rounds * b.workSec + (b.rounds - 1) * b.restSec) / 60;
    case 'tabata':
      return (b.rounds * (b.workSec + b.restSec)) / 60;
    case 'intervals':
      return (b.reps * ((b.workSec ?? ((b.distanceM ?? 1000) / 1000) * 300) + b.restSec)) / 60;
    case 'station_race':
      return b.segments.length * 5;
    case 'for_time':
    case 'rep_scheme':
    case 'rounds_for_time':
      return (b.timeCapSec ?? 900) / 60;
    default:
      return 0;
  }
}

/* ---------- from the paste parser and the templates ---------- */

const MODALITY_BY_ID: Record<string, IntervalModality> = { run: 'run', rower: 'row', 'bike-erg': 'bike', 'air-bike': 'bike', 'bike-intervals': 'bike', 'ski-erg': 'ski' };
const RACE_STATION_IDS = new Set(Object.values(HYROX_STATION_IDS));

function movementFrom(s: ParsedSegment, newId: () => string, opts: { keepDistance?: boolean; verify?: boolean } = {}): BlockMovement {
  const libName = s.movementId ? lib(s.movementId)?.name : null;
  return newMovement(
    {
      movementId: s.movementId,
      name: (libName ?? s.movement).slice(0, 60) || 'Movement',
      reps: s.reps,
      repsAlt: s.repsAlt,
      loadKg: s.loadKg,
      loadKgAlt: s.loadKgAlt,
      pct1rm: s.percent1rm != null ? Math.min(1.2, s.percent1rm / 100) : null,
      calories: s.calories,
      caloriesAlt: s.caloriesAlt,
      distanceM: opts.keepDistance === false ? null : s.distanceM,
      durationSec: s.durationSec,
      note: s.note ? s.note.slice(0, 120) : null,
      verify: !!opts.verify && (s.loadKg != null || s.distanceM != null || s.reps != null),
    },
    newId,
  );
}

/** A strength line the program side turns into an exercise with sets (programs.ts `addStrengthLines`). */
export interface StrengthLine {
  movementId: string | null;
  name: string;
  sets: number;
  /** Reps per set (a rep scheme like 5-5-3-3-1 gives one entry per set). */
  reps: (number | null)[];
  loadKg: number | null;
  pct1rm: number | null;
  rpe: number | null;
  note: string | null;
}

/** A neutral block list: the non-strength blocks, plus strength lines for the caller to make into exercises. */
export interface BlocksFromText {
  /** In order; a strength block's `exerciseIds` holds placeholders `line:<n>` for `strength[n]`. */
  blocks: Block[];
  strength: StrengthLine[];
  /** "Read as: AMRAP 20 · For time" style summary, per part. */
  readAs: string[];
  warnings: string[];
}

const benchmarkByName = new Map(BENCHMARKS.map((b) => [norm(b.name), b.id]));

/** One parsed workout (one part) → blocks. `title` overrides the parsed title (a part label like "Metcon"). */
export function blocksFromParsed(w: ParsedWorkout, opts: { newId?: () => string; title?: string | null; templateId?: string | null; verify?: boolean } = {}): BlocksFromText {
  const newId = opts.newId ?? uuidv7;
  const work = w.segments.filter((s) => s.kind === 'work');
  const rest = w.segments.find((s) => s.kind === 'rest' && s.durationSec != null)?.durationSec ?? null;
  const title = (opts.title ?? w.title)?.slice(0, 60) ?? null;
  const templateId = opts.templateId ?? (w.title ? (benchmarkByName.get(norm(w.title)) ?? null) : null);
  const verify = !!opts.verify;
  const base = (kind: BlockKind) => ({ id: newId(), title, note: w.notes.length ? w.notes.join(' · ').slice(0, 300) : null, scoring: defaultScoring(kind), timeCapSec: null as number | null, templateId });
  const ms = (keepDistance = true) => work.map((s) => movementFrom(s, newId, { keepDistance, verify }));
  const out: BlocksFromText = { blocks: [], strength: [], readAs: [WORKOUT_FORMAT_LABEL[w.format]], warnings: [...w.warnings] };
  if (!work.length) return out;

  switch (w.format) {
    case 'amrap':
      out.blocks.push({ ...base('amrap'), kind: 'amrap', durationSec: Math.max(30, w.timeCapSec ?? 600), movements: ms() });
      if (w.timeCapSec == null) out.warnings.push('Read as 10 minutes; change the length in the block');
      break;
    case 'for_time':
      if (w.repScheme) out.blocks.push({ ...base('rep_scheme'), timeCapSec: w.timeCapSec, kind: 'rep_scheme', scheme: w.repScheme, movements: ms().map((m) => ({ ...m, reps: null })) });
      else out.blocks.push({ ...base('for_time'), timeCapSec: w.timeCapSec, kind: 'for_time', movements: ms() });
      break;
    case 'rounds_for_time':
      out.blocks.push({ ...base('rounds_for_time'), timeCapSec: w.timeCapSec, kind: 'rounds_for_time', rounds: w.rounds ?? 1, restSec: rest, movements: ms() });
      break;
    case 'emom': {
      const interval = w.intervalSec ?? 60;
      const rounds = w.rounds ?? (w.timeCapSec ? Math.max(1, Math.round(w.timeCapSec / interval)) : 10);
      const rotate = work.length > 1 && work.some((s) => /odd|even|minute/i.test(s.note ?? ''));
      out.blocks.push({ ...base('emom'), kind: 'emom', intervalSec: interval, rounds, rotate, movements: ms() });
      break;
    }
    case 'tabata':
      out.blocks.push({ ...base('tabata'), kind: 'tabata', rounds: w.rounds ?? 8, workSec: w.workSec ?? 20, restSec: w.restSec ?? 10, movements: ms() });
      break;
    case 'hyrox':
      out.blocks.push({
        ...base('station_race'),
        kind: 'station_race',
        segments: work.map((s, i) => ({ ...movementFrom(s, newId, { verify }), kind: s.movementId === 'run' ? ('run' as const) : ('station' as const), name: s.movementId === 'run' ? `Run ${work.slice(0, i + 1).filter((x) => x.movementId === 'run').length}` : (lib(s.movementId ?? '')?.name ?? s.movement).slice(0, 60) })),
      });
      break;
    case 'intervals':
      for (const s of work) out.blocks.push(intervalsFrom(s, w, rest, base, newId));
      break;
    case 'strength':
      for (const s of work) {
        const n = s.repScheme?.length ?? s.sets ?? 1;
        out.strength.push({
          movementId: s.movementId,
          name: (s.movementId ? lib(s.movementId)?.name : null) ?? s.movement,
          sets: n,
          reps: Array.from({ length: n }, (_, i) => s.repScheme?.[i] ?? s.reps),
          loadKg: s.loadKg,
          pct1rm: s.percent1rm != null ? Math.min(1.2, s.percent1rm / 100) : null,
          rpe: Number(s.note?.match(/RPE (\d+(?:\.\d)?)/)?.[1]) || null,
          note: s.note?.replace(/RPE \d+(?:\.\d)?/, '').trim() || null,
        });
      }
      out.blocks.push({ ...base('strength'), title: opts.title ?? null, kind: 'strength', exerciseIds: out.strength.map((_, i) => `line:${i}`) });
      break;
    default: {
      // Not sure: a single run or erg piece is intervals of one; runs with race stations are a race sim; else a list.
      const mono = work.length === 1 && MODALITY_BY_ID[work[0]!.movementId ?? ''] && (work[0]!.distanceM != null || work[0]!.durationSec != null);
      if (mono) {
        out.blocks.push(intervalsFrom(work[0]!, w, rest, base, newId));
        out.readAs = ['Intervals'];
      } else if (work.some((s) => s.movementId === 'run') && work.some((s) => RACE_STATION_IDS.has(s.movementId ?? ''))) {
        out.blocks.push({ ...base('station_race'), scoring: 'time', kind: 'station_race', segments: work.map((s) => ({ ...movementFrom(s, newId, { verify }), kind: s.movementId === 'run' ? ('run' as const) : ('station' as const) })) });
        out.readAs = ['Race simulation'];
      } else {
        out.blocks.push({ ...base('for_time'), scoring: 'none', kind: 'for_time', movements: ms() });
        out.readAs = ['A list, done in order'];
        out.warnings.push('No format written (AMRAP, for time, EMOM…); read as a list, not scored');
      }
    }
  }
  return out;
}

function intervalsFrom(s: ParsedSegment, w: ParsedWorkout, rest: number | null, base: (k: BlockKind) => Omit<BlockOf<'intervals'>, 'kind' | 'modality' | 'reps' | 'workSec' | 'distanceM' | 'restSec' | 'target'>, newId: () => string): Block {
  void newId;
  const modality = MODALITY_BY_ID[s.movementId ?? ''] ?? 'other';
  const distance = s.distanceM;
  const b: BlockOf<'intervals'> = {
    ...base('intervals'),
    kind: 'intervals',
    modality,
    reps: Math.max(1, Math.min(60, s.sets ?? w.rounds ?? 1)),
    workSec: distance == null ? Math.max(5, s.durationSec ?? 60) : null,
    distanceM: distance,
    restSec: Math.min(1800, w.restSec ?? rest ?? 0),
    target: (() => {
      const rpe = s.note?.match(/RPE (\d+(?:\.\d)?)/);
      return rpe ? { kind: 'rpe' as const, rpe: Number(rpe[1]) } : null;
    })(),
  };
  if (s.note && !b.note) b.note = s.note.slice(0, 300);
  if (modality === 'other' && !b.title) b.title = (s.movement || 'Intervals').slice(0, 60);
  return b;
}

/**
 * Pasted whiteboard text → blocks, one or more per part ("A) Back squat 5x5 / B) Metcon: AMRAP 12 …"). Loads with no
 * unit use `defaultLoadUnit` (pass the tenant's units). Warnings are the parser's, prefixed with the part.
 */
export function blocksFromText(text: string, opts: ParseOptions & { newId?: () => string } = {}): BlocksFromText {
  const parts = splitWorkoutParts(text);
  const out: BlocksFromText = { blocks: [], strength: [], readAs: [], warnings: [] };
  if (!text.trim()) return { ...out, warnings: ['Nothing to read'] };
  for (const p of parts) {
    const w = parseWorkout(p.text, opts);
    const part = blocksFromParsed(w, { newId: opts.newId, title: parts.length > 1 ? (w.title ?? p.label) : null });
    const offset = out.strength.length;
    for (const b of part.blocks) {
      if (b.kind === 'strength') b.exerciseIds = b.exerciseIds.map((x) => `line:${Number(x.slice(5)) + offset}`);
      out.blocks.push(b);
    }
    out.strength.push(...part.strength);
    out.readAs.push(...part.readAs);
    const prefix = parts.length > 1 ? `${p.label ?? `Part ${out.readAs.length}`}: ` : '';
    // A multi-part paste read part by part doesn't need the parser's "read as one list" warning.
    out.warnings.push(...part.warnings.filter((x) => !x.startsWith('This looks like')).map((x) => prefix + x));
  }
  return out;
}

/** A template → blocks; race-format numbers carry the verify flag, and the block remembers the template id. */
export function blocksFromTemplate(t: TemplateWorkout, newId: () => string = uuidv7): BlocksFromText {
  const verify = t.category === 'race_sim' && t.verify.length > 0;
  const res = blocksFromParsed(t.workout, { newId, title: t.category === 'benchmark' ? t.name : t.workout.format === 'hyrox' ? null : t.name, templateId: t.id, verify });
  for (const b of res.blocks) {
    if (t.category === 'race_sim' && b.kind === 'for_time') b.scoring = t.scoring === 'none' ? 'none' : 'time';
    if (t.scoring === 'none' && b.kind !== 'strength') b.scoring = 'none';
  }
  return { ...res, warnings: [] };
}

/** Exercises in the library a movement name matches (for "Not in your library" tags). */
export function movementInLibrary(m: Pick<BlockMovement, 'movementId' | 'name'>): boolean {
  return m.movementId != null || findLibraryExercise(STARTER_LIBRARY, m.name) != null;
}
