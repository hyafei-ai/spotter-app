/**
 * Endurance layer (docs/ports.md row 6): heart-rate zones from the athlete's own max, time in zone, aerobic
 * decoupling, efficiency factor, a run classifier on personal zones, heart-rate recovery with a personal trend,
 * and training impulse (TRIMP) from the heart-rate stream.
 *
 * Ported from Station Zero's DeviceManager.ts, HealthKitService.ts (zone bucketing), aerobicEfficiency.ts,
 * runClassifier.ts and HRRecoveryService.ts. Fixed rather than copied:
 * - Max HR was a default 190 when unknown. Here it comes from the coach or the athlete's own highest observed
 *   heart rate (wearables.ts maxObservedHr), and when neither exists every function says it can't tell.
 * - Efficiency factor was pace ÷ HR ("lower is better"). Here it's the conventional speed ÷ HR (higher is better),
 *   so decoupling has its usual sign.
 * - The decoupling labels (<5% excellent, 5–10% good), HRR60 categories (≥30 excellent … <12 below average),
 *   power-to-weight levels and the run classifier's fixed %max cut-offs were population bands; not ported.
 *   Readings compare the athlete with themselves.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/* ---------- max heart rate ---------- */

export interface MaxHr {
  bpm: number;
  source: 'coach' | 'observed';
}

/** The plain words when max HR isn't known, shown instead of zones. */
export const MAX_HR_UNKNOWN =
  'Max heart rate isn’t known yet: set it, or it will come from the highest heart rate seen in workouts';

/**
 * The max HR to use: the coach's value, else the athlete's highest observed (wearables.ts maxObservedHr). Null
 * when neither: never 190, never 220 − age.
 */
export function maxHrFor(
  coachSetMaxHr: number | null | undefined,
  observedMaxHr: number | null | undefined,
): MaxHr | null {
  if (coachSetMaxHr != null && coachSetMaxHr >= 100 && coachSetMaxHr <= 240)
    return { bpm: Math.round(coachSetMaxHr), source: 'coach' };
  if (observedMaxHr != null && observedMaxHr >= 100 && observedMaxHr <= 240)
    return { bpm: Math.round(observedMaxHr), source: 'observed' };
  return null;
}

/* ---------- zones ---------- */

export type HrZone = 1 | 2 | 3 | 4 | 5;
export const HR_ZONES: HrZone[] = [1, 2, 3, 4, 5];

/**
 * Zone floors as a share of max HR: the common five-zone %HRmax convention (Z1 under 60%, Z2 60–70, Z3 70–80,
 * Z4 80–90, Z5 90+), the same one the source and most watches use. A convention for naming effort, applied to the
 * athlete's own max; not a population norm.
 */
export const ZONE_FLOORS_PCT: Record<HrZone, number> = { 1: 0, 2: 60, 3: 70, 4: 80, 5: 90 };

export interface ZoneRange {
  zone: HrZone;
  /** Lowest bpm in the zone (inclusive). */
  fromBpm: number;
  /** Highest bpm in the zone (inclusive), null for zone 5. */
  toBpm: number | null;
}

/** Zone ranges in bpm for this athlete. */
export function hrZones(maxHr: number): ZoneRange[] {
  return HR_ZONES.map((z) => {
    const from = Math.ceil((maxHr * ZONE_FLOORS_PCT[z]) / 100);
    const next = z < 5 ? Math.ceil((maxHr * ZONE_FLOORS_PCT[(z + 1) as HrZone]) / 100) - 1 : null;
    return { zone: z, fromBpm: z === 1 ? 0 : from, toBpm: next };
  });
}

export function zoneOf(hr: number, maxHr: number): HrZone {
  const pct = (hr / maxHr) * 100;
  return pct >= 90 ? 5 : pct >= 80 ? 4 : pct >= 70 ? 3 : pct >= 60 ? 2 : 1;
}

export interface HrSample {
  /** Seconds from the start of the workout. */
  t: number;
  hr: number;
  /** Metres per second, when the source has it. */
  speed?: number | null;
  /** Watts, when the source has it. */
  power?: number | null;
}

/** A sample counts for at most this long, so a sensor dropout isn't credited to one zone (source rule, kept). */
export const MAX_SAMPLE_GAP_SEC = 10;

/** Clean, sorted samples with how long each one counts for. */
function weighted(samples: HrSample[], endT?: number): { s: HrSample; dt: number }[] {
  const xs = samples
    .filter((s) => Number.isFinite(s.t) && s.hr >= 30 && s.hr <= 250)
    .sort((a, b) => a.t - b.t);
  return xs.map((s, i) => {
    const next = i + 1 < xs.length ? xs[i + 1]!.t : (endT ?? s.t + 1);
    return { s, dt: Math.min(MAX_SAMPLE_GAP_SEC, Math.max(0, next - s.t)) };
  });
}

export type ZoneSeconds = Record<HrZone, number>;

/** Seconds in each zone. Null when max HR isn't known. */
export function timeInZones(
  samples: HrSample[],
  maxHr: number | null,
  endT?: number,
): ZoneSeconds | null {
  if (!maxHr) return null;
  const out: ZoneSeconds = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const { s, dt } of weighted(samples, endT)) out[zoneOf(s.hr, maxHr)] += dt;
  for (const z of HR_ZONES) out[z] = Math.round(out[z]);
  return out;
}

/* ---------- efficiency and decoupling ---------- */

/**
 * Efficiency factor: output per heartbeat. For running, speed in metres per minute ÷ average HR; for power,
 * average watts ÷ average HR. This is the conventional definition used in endurance coaching (higher is better).
 * Compare it only with the same athlete on similar sessions.
 */
export function efficiencyFactor(output: number, avgHr: number): number | null {
  if (!(output > 0) || !(avgHr > 0)) return null;
  return Math.round((output / avgHr) * 1000) / 1000;
}

export interface Decoupling {
  /** (first-half EF − second-half EF) ÷ first-half EF, %. Positive = heart rate drifted up for the same output. */
  pct: number;
  basis: 'pace' | 'power';
  firstEf: number;
  secondEf: number;
  /** To the athlete. */
  line: string;
}

/**
 * Aerobic decoupling (pace:HR or power:HR): splits a steady session in two by time and compares efficiency in
 * each half. Uses power when every sample has it, else speed. Needs 10 samples with output in each half.
 */
export function aerobicDecoupling(samples: HrSample[]): Decoupling | null {
  const xs = samples.filter((s) => Number.isFinite(s.t) && s.hr > 0).sort((a, b) => a.t - b.t);
  if (xs.length < 20) return null;
  const basis: 'pace' | 'power' = xs.every((s) => s.power != null && s.power > 0)
    ? 'power'
    : 'pace';
  const out = (s: HrSample) => (basis === 'power' ? s.power! : (s.speed ?? 0) * 60);
  const midT = (xs[0]!.t + xs[xs.length - 1]!.t) / 2;
  const halves = [xs.filter((s) => s.t < midT), xs.filter((s) => s.t >= midT)].map((h) =>
    h.filter((s) => out(s) > 0),
  );
  if (halves.some((h) => h.length < 10)) return null;
  const [a, b] = halves.map((h) =>
    efficiencyFactor(mean(h.map(out)), mean(h.map((s) => s.hr)))!,
  ) as [number, number];
  const pct = r1(((a - b) / a) * 100);
  const what = basis === 'power' ? 'power' : 'pace';
  const line =
    Math.abs(pct) < 1
      ? `Heart rate held steady against ${what} from the first half to the second`
      : pct > 0
        ? `Heart rate drifted up ${Math.round(pct)}% relative to ${what} in the second half`
        : `Heart rate came down ${Math.round(-pct)}% relative to ${what} in the second half`;
  return { pct, basis, firstEf: a, secondEf: b, line };
}

/* ---------- run classifier on personal zones ---------- */

export type RunType = 'recovery' | 'easy' | 'long' | 'tempo' | 'intervals' | 'race' | 'unknown';

export const RUN_TYPE_LABEL: Record<RunType, string> = {
  recovery: 'Recovery',
  easy: 'Easy',
  long: 'Long',
  tempo: 'Tempo',
  intervals: 'Intervals',
  race: 'Race effort',
  unknown: 'Not sure',
};

/** A run this long or longer, mostly in zones 1–2, is a long run. A default the coach can change. */
export const DEFAULT_LONG_RUN_MIN = 60;

export interface RunClassification {
  type: RunType;
  /** Plain reason: "Most of the time in zone 2", or why it can't tell. */
  reason: string;
}

/** Hard efforts: separate stretches of 30 s or more at zone 4+, with a drop to zone 2 or below between them. */
function hardEfforts(samples: HrSample[], maxHr: number): number {
  let efforts = 0;
  let inEffort = false;
  let start = 0;
  let counted = false;
  for (const { s } of weighted(samples)) {
    const z = zoneOf(s.hr, maxHr);
    if (z >= 4) {
      if (!inEffort) {
        inEffort = true;
        start = s.t;
        counted = false;
      }
      if (!counted && s.t - start >= 30) {
        efforts++;
        counted = true;
      }
    } else if (z <= 2) inEffort = false;
  }
  return efforts;
}

/**
 * Classifies a run by where the time went in the athlete's own zones: three or more separate hard efforts →
 * intervals; otherwise the zone with the most time decides (1 recovery, 2 easy or long, 3–4 tempo, 5 race
 * effort). Without heart rate or a known max HR it says "not sure" rather than guessing from duration.
 */
export function classifyRun(input: {
  durationSec: number;
  samples?: HrSample[] | null;
  zoneSeconds?: ZoneSeconds | null;
  maxHr: number | null;
  longRunMin?: number;
}): RunClassification {
  if (!input.maxHr) return { type: 'unknown', reason: MAX_HR_UNKNOWN };
  const zones =
    input.zoneSeconds ?? (input.samples?.length ? timeInZones(input.samples, input.maxHr) : null);
  const total = zones ? HR_ZONES.reduce((n, z) => n + zones[z], 0) : 0;
  if (!zones || total <= 0)
    return { type: 'unknown', reason: 'No heart rate recorded for this run' };
  if (input.samples && hardEfforts(input.samples, input.maxHr) >= 3)
    return {
      type: 'intervals',
      reason: 'Three or more separate hard efforts with easier running between',
    };
  const top = HR_ZONES.reduce((a, z) => (zones[z] > zones[a] ? z : a), 1 as HrZone);
  const share = Math.round((zones[top] / total) * 100);
  const why = `${share}% of the time in zone ${top}`;
  if (top === 1) return { type: 'recovery', reason: why };
  if (top === 2)
    return input.durationSec / 60 >= (input.longRunMin ?? DEFAULT_LONG_RUN_MIN)
      ? { type: 'long', reason: `${why}, for ${Math.round(input.durationSec / 60)} min` }
      : { type: 'easy', reason: why };
  if (top === 5) return { type: 'race', reason: why };
  return { type: 'tempo', reason: why };
}

/* ---------- heart-rate recovery ---------- */

export interface HrRecovery {
  peakHr: number;
  hrAt60: number;
  /** Peak minus HR 60 s after the effort ended, bpm. */
  dropBpm: number;
}

/** A reading 60 s after the effort must be within this many seconds of the 60 s mark (source tolerance, kept). */
export const HRR_TOLERANCE_SEC = 10;

/**
 * HRR60: the peak HR in the last 30 s of an effort minus the HR 60 s after it ended. Null without a reading near
 * the 60 s mark, or when the peak is under 100 bpm (not a hard enough effort to read; source rule, kept).
 */
export function hrr60(samples: HrSample[], effortEndT: number): HrRecovery | null {
  const xs = samples.filter((s) => s.hr > 0);
  const peakWindow = xs.filter((s) => s.t <= effortEndT && s.t >= effortEndT - 30);
  if (!peakWindow.length) return null;
  const peak = Math.max(...peakWindow.map((s) => s.hr));
  if (peak < 100) return null;
  const target = effortEndT + 60;
  const near = xs
    .filter((s) => Math.abs(s.t - target) <= HRR_TOLERANCE_SEC)
    .sort((a, b) => Math.abs(a.t - target) - Math.abs(b.t - target))[0];
  if (!near) return null;
  return {
    peakHr: Math.round(peak),
    hrAt60: Math.round(near.hr),
    dropBpm: Math.round(peak - near.hr),
  };
}

export interface HrrTrend {
  recentAvg: number;
  earlierAvg: number;
  /** Positive = recovering faster than before. */
  changeBpm: number;
  recentCount: number;
  earlierCount: number;
  line: string;
  coachLine: string;
}

/**
 * The athlete's HRR60 now against their own earlier readings: the last 3 against up to 5 before them. Needs 2
 * recent and 3 earlier. No population categories.
 */
export function hrrTrend(readings: { date: string; dropBpm: number }[]): HrrTrend | null {
  const xs = [...readings]
    .filter((r) => Number.isFinite(r.dropBpm))
    .sort((a, b) => b.date.localeCompare(a.date));
  const recent = xs.slice(0, 3);
  const earlier = xs.slice(3, 8);
  if (recent.length < 2 || earlier.length < 3) return null;
  const a = r1(mean(recent.map((r) => r.dropBpm)));
  const b = r1(mean(earlier.map((r) => r.dropBpm)));
  const change = r1(a - b);
  const n = Math.abs(Math.round(change));
  const tail = `(last ${recent.length} readings against the ${earlier.length} before)`;
  const line =
    n === 0
      ? `Heart rate recovery is about the same as your earlier readings ${tail}`
      : change > 0
        ? `Heart rate recovery is ${n} bpm faster than your earlier readings ${tail}`
        : `Heart rate recovery is ${n} bpm slower than your earlier readings ${tail}`;
  const coachLine = line.replace('your earlier', 'their earlier');
  return {
    recentAvg: a,
    earlierAvg: b,
    changeBpm: change,
    recentCount: recent.length,
    earlierCount: earlier.length,
    line,
    coachLine,
  };
}

/* ---------- training impulse (TRIMP) ---------- */

/**
 * Banister's impulse-response TRIMP (Banister 1991; Morton, Fitz-Clarke & Banister 1990), summed over the HR
 * stream: Σ minutes × ΔHR × k × e^(b × ΔHR), where ΔHR = (HR − resting HR) ÷ (max HR − resting HR), clamped to
 * 0–1. The published weighting constants: k = 0.64, b = 1.92 for men; k = 0.86, b = 1.67 for women.
 *
 * Banister needs resting HR, max HR and which constants to use. When sex isn't given or resting HR isn't known,
 * Edwards' zone TRIMP is used instead (Edwards 1993): minutes in 50–60% of max HR × 1, 60–70% × 2, 70–80% × 3,
 * 80–90% × 4, 90–100% × 5. It needs only max HR and doesn't weight by sex. The two scales differ, so the method
 * travels with the number and only same-method values should be compared.
 */
export const BANISTER_CONSTANTS = {
  male: { k: 0.64, b: 1.92 },
  female: { k: 0.86, b: 1.67 },
} as const;
export const EDWARDS_ZONE_FLOORS_PCT = [50, 60, 70, 80, 90] as const;

export interface Trimp {
  value: number;
  method: 'banister' | 'edwards';
  /** Plain words for "How this is worked out". */
  note: string;
}

export function trimp(
  samples: HrSample[],
  p: { maxHr: number | null; restingHr?: number | null; sex?: 'male' | 'female' | null },
  endT?: number,
): Trimp | null {
  if (!p.maxHr) return null;
  const ws = weighted(samples, endT);
  if (!ws.length) return null;
  const rest = p.restingHr;
  if (p.sex && rest != null && rest > 0 && rest < p.maxHr) {
    const { k, b } = BANISTER_CONSTANTS[p.sex];
    let sum = 0;
    for (const { s, dt } of ws) {
      const d = Math.min(1, Math.max(0, (s.hr - rest) / (p.maxHr - rest)));
      sum += (dt / 60) * d * k * Math.exp(b * d);
    }
    return {
      value: Math.round(sum),
      method: 'banister',
      note: `Banister TRIMP from heart rate, resting ${Math.round(rest)} and max ${p.maxHr} bpm`,
    };
  }
  let sum = 0;
  for (const { s, dt } of ws) {
    const pct = (s.hr / p.maxHr) * 100;
    const weight = EDWARDS_ZONE_FLOORS_PCT.filter((f) => pct >= f).length;
    sum += (dt / 60) * weight;
  }
  const why = !p.sex ? 'sex isn’t set' : 'resting heart rate isn’t known';
  return {
    value: Math.round(sum),
    method: 'edwards',
    note: `Zone TRIMP (Edwards) from heart rate and max ${p.maxHr} bpm, because ${why}`,
  };
}
