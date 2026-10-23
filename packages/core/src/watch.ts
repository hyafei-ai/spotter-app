import { z } from 'zod';
import { checkBrandColor, deriveDarkBrand, onColor } from './brand';
import { isoDate, isoDateTime, uuid, type LoggedSet, type ProgramExercise, type SessionPlan } from './schemas';
import { performanceOrder } from './session';
import type { DailyBrief } from './physiology';
import type { TenantConfig } from './tenant';

/**
 * The phone ↔ Apple Watch contract (docs/features/watch.md, docs/ux/watch.md).
 *
 * Phone → watch: one `WatchContext` through WCSession `updateApplicationContext` (latest wins, delivered when
 * the watch app next runs): today's session as **blocks**, the brief's feel line and one action, the trainer's
 * branding and the last few coach messages.
 * Watch → phone: `WatchResult` (a finished session), `WatchCheckIn` and `WatchReply`, each through
 * `transferUserInfo` (queued, delivered in order, survives either side sleeping). `sendMessage` is only used for
 * nice-to-haves while both are reachable.
 *
 * Every payload carries `v: 1`. A side that sees a newer `v` ignores the payload and says "update the app"
 * rather than guess. Payloads are bounded well under the WatchConnectivity size limits (Apple doesn't publish
 * an exact number for application context; ~64 KB is the commonly observed message cap, so we stay under 48 KB).
 *
 * Today's program model is strength-shaped, so `watchPlanFromSession` produces strength blocks (plus `interval`
 * or `timed` blocks for the `time` and `distance` metrics). `interval` targets and `station` blocks are ready for
 * the multi-sport program model (next phase); the demo uses a MOCK conditioning session to exercise them.
 */

export const WATCH_PAYLOAD_VERSION = 1 as const;
/** Our own bound for any one payload, in bytes of JSON (UTF-8). */
export const WATCH_MAX_BYTES = 48_000;
/** How long the watch measures heart-rate recovery after a session, in seconds. */
export const HR_RECOVERY_SECONDS = 120;

const v = z.literal(WATCH_PAYLOAD_VERSION);
const short = (n: number) => z.string().max(n);
/** Watch → phone fields that may be null: Swift's JSONEncoder leaves nil keys out, so a missing key reads as null. */
const nul = <T extends z.ZodType>(s: T) => s.nullable().default(null);

/* ---------- blocks ---------- */

export const StrengthSet = z.object({
  reps: z.number().int().min(0).max(100).nullable(),
  loadKg: z.number().min(0).max(1000).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
});
export type StrengthSet = z.infer<typeof StrengthSet>;

export const IntervalTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pace'), secPerKm: z.number().int().min(60).max(1200) }),
  z.object({ kind: z.literal('watts'), watts: z.number().int().min(1).max(2000) }),
  z.object({ kind: z.literal('hr_zone'), zone: z.number().int().min(1).max(5) }),
  z.object({ kind: z.literal('rpe'), rpe: z.number().min(1).max(10) }),
]);
export type IntervalTarget = z.infer<typeof IntervalTarget>;

/** Links back to the program, when the block came from one (absent for future multi-sport blocks). */
const link = {
  exerciseId: z.string().max(80).nullable(),
  programExerciseId: uuid.nullable(),
};

export const WatchBlock = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('strength'),
    exerciseId: z.string().max(80),
    programExerciseId: uuid.nullable(),
    name: short(60),
    metric: z.enum(['weight_reps', 'bodyweight_reps']),
    sets: z.array(StrengthSet).min(1).max(20),
    restSec: z.number().int().min(0).max(900),
    /** Superset letter ("A"): exercises in a group alternate set by set (see `order`). */
    group: short(4).nullable(),
    /** The coach asked for RPE on this exercise: the watch asks after each set. */
    trackRpe: z.boolean(),
  }),
  z.object({
    kind: z.literal('interval'),
    ...link,
    name: short(60),
    reps: z.number().int().min(1).max(60),
    /** Work by time, or by distance (then the client taps Done). Exactly one is set. */
    workSec: z.number().int().min(1).max(7200).nullable(),
    distanceM: z.number().min(1).max(100_000).nullable(),
    restSec: z.number().int().min(0).max(1800),
    target: IntervalTarget.nullable(),
  }),
  z.object({
    kind: z.literal('station'),
    ...link,
    name: short(60),
    distanceM: z.number().min(1).max(100_000).nullable(),
    reps: z.number().int().min(1).max(1000).nullable(),
    loadKg: z.number().min(0).max(1000).nullable(),
  }),
  z.object({ kind: z.literal('timed'), ...link, name: short(60), seconds: z.number().int().min(1).max(7200) }),
]);
export type WatchBlock = z.infer<typeof WatchBlock>;

export const WatchVersion = z.enum(['planned', 'lighter', 'recovery']);
export type WatchVersion = z.infer<typeof WatchVersion>;

export const WatchSessionPlan = z.object({
  v,
  /** programDayId · date · version: the same plan always has the same id. */
  planId: short(120),
  programDayId: uuid,
  date: isoDate,
  title: short(60),
  version: WatchVersion,
  /** "Lower A · easier version". */
  label: short(80),
  coachNote: short(200).nullable(),
  units: z.enum(['kg', 'lb']),
  incrementKg: z.number().positive().max(10),
  /** "Loads 2.5% lighter today: …" when cycle calibration changed the suggested loads. */
  calibration: short(160).nullable(),
  blocks: z.array(WatchBlock).min(1).max(40),
  /** The order steps are done in: [block index, set/rep index]. Supersets alternate. */
  order: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).max(400),
});
export type WatchSessionPlan = z.infer<typeof WatchSessionPlan>;

/* ---------- brief, branding, messages, context ---------- */

export const WatchAction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('start'), version: WatchVersion, label: short(80) }),
  z.object({ kind: z.literal('check_in'), label: short(40) }),
  z.object({ kind: z.literal('none') }),
]);
export type WatchAction = z.infer<typeof WatchAction>;

export const WatchBrief = z.object({
  v,
  date: isoDate,
  tone: z.enum(['steady', 'watch', 'ease']),
  /** "You’re running tired today". */
  feel: short(80),
  /** The feel line in two or three words for the complication ("Running tired"). */
  glance: short(24),
  /** The word in `feel` the chalk strike goes under ("tired"), when there is one. */
  strike: short(20).nullable(),
  /** The strongest reason, one line ("HRV 18% under your usual (Apple Watch)"). */
  reason: short(100).nullable(),
  action: WatchAction,
});
export type WatchBrief = z.infer<typeof WatchBrief>;

export const WatchBranding = z.object({
  appName: short(40),
  coachName: short(60),
  coachFirst: short(30),
  monogram: short(3),
  /** The tenant's brand lightened to pass 4.5:1 on the watch's dark background. */
  accent: z.string().regex(/^#[0-9A-F]{6}$/),
  /** Label colour on an accent fill. */
  accentInk: z.string().regex(/^#[0-9A-F]{6}$/),
});
export type WatchBranding = z.infer<typeof WatchBranding>;

export const WatchMessage = z.object({ id: uuid, from: z.enum(['coach', 'client']), body: short(500), sentAt: isoDateTime });
export type WatchMessage = z.infer<typeof WatchMessage>;

export const WatchDay = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session') }),
  z.object({ kind: z.literal('done'), title: short(60), sets: z.number().int().min(0) }),
  z.object({ kind: z.literal('rest'), line: short(200) }),
  z.object({ kind: z.literal('no_program'), line: short(200) }),
]);
export type WatchDay = z.infer<typeof WatchDay>;

export const WatchContext = z.object({
  v,
  sentAt: isoDateTime,
  branding: WatchBranding,
  day: WatchDay,
  brief: WatchBrief.nullable(),
  /** Today's versions, recommended first. Empty unless `day.kind` is 'session'. */
  plans: z.array(WatchSessionPlan).max(3),
  checkedIn: z.boolean(),
  /** The client's own highest observed heart rate (never 220 − age), for zone targets. Null until known. */
  hrMax: z.number().int().min(100).max(240).nullable(),
  /** The client's "Heart rate from watch sessions" switch (Who sees what). The watch says where HR goes. */
  shareHr: z.boolean(),
  messages: z.array(WatchMessage).max(5),
  quickReplies: z.array(short(40)).max(4),
});
export type WatchContext = z.infer<typeof WatchContext>;

/* ---------- watch → phone ---------- */

export const WatchHrRecovery = z.object({
  /** Highest HR in the last minute of the session. */
  peak: z.number().int().min(30).max(240),
  /** HR 60 s and 120 s after the end (null when no sample landed near that time). */
  at60: nul(z.number().int().min(30).max(240)),
  at120: nul(z.number().int().min(30).max(240)),
});
export type WatchHrRecovery = z.infer<typeof WatchHrRecovery>;

const bpm = nul(z.number().int().min(30).max(240));

export const WatchResult = z.object({
  v,
  kind: z.literal('session'),
  /** Becomes the session id on the phone; the same result delivered twice is stored once. */
  resultId: uuid,
  planId: short(120),
  programDayId: uuid,
  date: isoDate,
  title: short(60),
  version: WatchVersion,
  startedAt: isoDateTime,
  endedAt: isoDateTime,
  ended: z.enum(['finished', 'ended_early']),
  sets: z
    .array(
      z.object({
        b: z.number().int().min(0),
        i: z.number().int().min(0),
        reps: nul(z.number().int().min(0).max(1000)),
        loadKg: nul(z.number().min(0).max(1000)),
        rpe: nul(z.number().min(1).max(10)),
        at: isoDateTime,
      }),
    )
    .max(400),
  intervals: z
    .array(
      z.object({ b: z.number().int().min(0), i: z.number().int().min(0), workSec: z.number().min(0).max(7200), distanceM: nul(z.number().min(0).max(100_000)), avgHr: bpm, maxHr: bpm }),
    )
    .max(400),
  stations: z.array(z.object({ b: z.number().int().min(0), sec: z.number().min(0).max(7200), avgHr: bpm, maxHr: bpm })).max(100),
  timed: z.array(z.object({ b: z.number().int().min(0), sec: z.number().min(0).max(7200) })).max(100),
  hr: z
    .object({
      avg: bpm,
      max: bpm,
      /** One average per minute of the session, capped at 3 hours. Summary only; raw samples stay in Apple Health. */
      perMinute: z.array(z.number().int().min(0).max(240)).max(180),
    })
    .nullable()
    .default(null),
  hrRecovery: nul(WatchHrRecovery),
});
export type WatchResult = z.infer<typeof WatchResult>;

export const WatchCheckIn = z.object({
  v,
  kind: z.literal('check_in'),
  id: uuid,
  date: isoDate,
  energy: z.number().int().min(1).max(5),
  soreness: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5),
  at: isoDateTime,
});
export type WatchCheckIn = z.infer<typeof WatchCheckIn>;

/** One-tap replies on the watch, before dictation. Plain and short; the client can always dictate instead. */
export const DEFAULT_QUICK_REPLIES = ['Done, felt good', 'Can we talk later?', 'On my way', 'Thanks!'];

/** The watch check-in's words for 1…5, with the same ends as the phone's daily check. Mirrored in CheckInView.swift. */
export const CHECK_IN_WORDS = {
  energy: ['Drained', 'Low', 'OK', 'Good', 'Full of energy'],
  soreness: ['Fresh', 'A little', 'Some', 'Sore', 'Very sore'],
  stress: ['Calm', 'A little', 'Some', 'High', 'Very stressed'],
} as const;

export const WatchReply = z.object({ v, kind: z.literal('reply'), id: uuid, body: z.string().min(1).max(500), sentAt: isoDateTime });
export type WatchReply = z.infer<typeof WatchReply>;

export const WatchInbound = z.discriminatedUnion('kind', [WatchResult, WatchCheckIn, WatchReply]);
export type WatchInbound = z.infer<typeof WatchInbound>;

export type ParsedInbound = { ok: true; value: WatchInbound } | { ok: false; reason: 'newer_version' | 'invalid' | 'too_large'; message: string };

/** Validates what the watch sent. A newer payload version is reported, never guessed at. */
export function parseWatchInbound(raw: unknown): ParsedInbound {
  if (raw && typeof raw === 'object' && 'v' in raw && typeof raw.v === 'number' && raw.v > WATCH_PAYLOAD_VERSION) {
    return { ok: false, reason: 'newer_version', message: 'Your watch app is newer than this phone app. Update the phone app.' };
  }
  if (payloadBytes(raw) > WATCH_MAX_BYTES) return { ok: false, reason: 'too_large', message: 'The watch sent more than one payload may hold.' };
  // The watch writes UUIDs with Foundation, which prints them in upper case.
  const r = WatchInbound.safeParse(lowerIds(raw));
  return r.success ? { ok: true, value: r.data } : { ok: false, reason: 'invalid', message: r.error.issues[0]?.message ?? 'Invalid payload' };
}

function lowerIds(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = { ...(raw as Record<string, unknown>) };
  for (const k of ['resultId', 'programDayId', 'id']) if (typeof o[k] === 'string') o[k] = (o[k] as string).toLowerCase();
  return o;
}

/* ---------- size ---------- */

export function payloadBytes(x: unknown): number {
  // UTF-8 length without TextEncoder (not in core's lib or every JS engine the apps run on).
  let n = 0;
  for (const ch of JSON.stringify(x) ?? '') {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/**
 * Keeps the context under WATCH_MAX_BYTES: first drops older messages, then the coach notes, then the
 * versions that weren't recommended. Returns null when even the recommended plan alone doesn't fit (a
 * session of 40 blocks fits easily; this is a guard, not a normal path).
 */
export function boundWatchContext(ctx: WatchContext, max = WATCH_MAX_BYTES): WatchContext | null {
  let c = ctx;
  const steps: ((x: WatchContext) => WatchContext)[] = [
    (x) => ({ ...x, messages: x.messages.slice(-2) }),
    (x) => ({ ...x, messages: [] }),
    (x) => ({ ...x, plans: x.plans.map((p) => ({ ...p, coachNote: null })) }),
    (x) => ({ ...x, plans: x.plans.slice(0, 1) }),
  ];
  for (const step of steps) {
    if (payloadBytes(c) <= max) return c;
    c = step(c);
  }
  return payloadBytes(c) <= max ? c : null;
}

/* ---------- building the context on the phone ---------- */

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export const VERSION_SUFFIX: Record<WatchVersion, string> = { planned: '', lighter: ' · easier', recovery: '' };

function blockFor(e: ProgramExercise): WatchBlock {
  const base = { exerciseId: e.exerciseId, programExerciseId: e.id, name: clip(e.name, 60) };
  if (e.metric === 'time') {
    const secs = e.sets.map((s) => s.durationS ?? 30);
    if (e.sets.length === 1) return { kind: 'timed', ...base, seconds: Math.max(1, secs[0]!) };
    return { kind: 'interval', ...base, reps: e.sets.length, workSec: Math.max(1, secs[0]!), distanceM: null, restSec: Math.min(1800, e.restS), target: null };
  }
  if (e.metric === 'distance') {
    return { kind: 'interval', ...base, reps: e.sets.length, workSec: null, distanceM: Math.max(1, e.sets[0]?.distanceM ?? 20), restSec: Math.min(1800, e.restS), target: null };
  }
  return {
    kind: 'strength',
    ...base,
    metric: e.metric,
    sets: e.sets.map((s) => ({
      reps: s.amrap ? null : (s.repsMax ?? s.repsMin),
      loadKg: e.metric === 'weight_reps' ? s.loadKg : null,
      rpe: s.rpe,
    })),
    restSec: Math.min(900, e.restS),
    group: e.supersetGroup ? clip(e.supersetGroup, 4) : null,
    trackRpe: e.trackRpe,
  };
}

/** Step order for a list of blocks: strength follows the phone logger's performance order; the rest run in sequence. */
export function stepOrder(plan: SessionPlan, blocks: WatchBlock[]): [number, number][] {
  const index = new Map(plan.exercises.map((e, i) => [e.id, i] as const));
  const out: [number, number][] = [];
  const seen = new Set<string>();
  for (const slot of performanceOrder(plan)) {
    const b = index.get(slot.exercise.id)!;
    const block = blocks[b]!;
    if (block.kind === 'strength') out.push([b, slot.setIndex]);
    else if (!seen.has(slot.exercise.id)) {
      seen.add(slot.exercise.id);
      out.push(...repsOf(block).map((i): [number, number] => [b, i]));
    }
  }
  return out;
}

const repsOf = (b: WatchBlock): number[] => {
  const n = b.kind === 'strength' ? b.sets.length : b.kind === 'interval' ? b.reps : 1;
  return Array.from({ length: n }, (_, i) => i);
};

/** Order for blocks with no program behind them (multi-sport sessions): each block's steps in turn. */
export function sequentialOrder(blocks: WatchBlock[]): [number, number][] {
  return blocks.flatMap((b, bi) => repsOf(b).map((i): [number, number] => [bi, i]));
}

export interface WatchPlanOptions {
  version: WatchVersion;
  units: 'kg' | 'lb';
  incrementKg: number;
  /** Cycle calibration of suggested loads (calibration.ts calibratedLoad); identity when off. Never on lighter/recovery. */
  calibrate?: (plannedKg: number) => number;
  calibrationLine?: string | null;
}

/** One of today's session versions → the plan the watch runs. Loads are already resolved and, on the planned version, calibrated. */
export function watchPlanFromSession(plan: SessionPlan, o: WatchPlanOptions): WatchSessionPlan {
  const cal = o.version === 'planned' && o.calibrate ? o.calibrate : null;
  const blocks = plan.exercises.map(blockFor).map((b) =>
    b.kind === 'strength' && cal ? { ...b, sets: b.sets.map((s) => ({ ...s, loadKg: s.loadKg == null ? null : cal(s.loadKg) })) } : b,
  );
  const changed = cal != null && blocks.some((b, i) => b.kind === 'strength' && b.sets.some((s, j) => s.loadKg !== plan.exercises[i]!.sets[j]?.loadKg));
  return {
    v: WATCH_PAYLOAD_VERSION,
    planId: `${plan.programDayId}:${plan.scheduledDate}:${o.version}`,
    programDayId: plan.programDayId,
    date: plan.scheduledDate,
    title: clip(plan.title, 60),
    version: o.version,
    label: clip(`${plan.title}${VERSION_SUFFIX[o.version]}`, 80),
    coachNote: plan.coachNote ? clip(plan.coachNote, 200) : null,
    units: o.units,
    incrementKg: o.incrementKg,
    calibration: changed && o.calibrationLine ? clip(o.calibrationLine, 160) : null,
    blocks,
    order: stepOrder(plan, blocks),
  };
}

/**
 * HealthKit activity type for a plan (HKWorkoutActivityType raw values), mirrored by SessionRunner.activity(for:)
 * in Swift: strength and holds → traditional strength training (50); runs with a pace target only → running
 * (37); anything mixed (Hyrox-style, intervals, stations) → high-intensity interval training (63).
 */
export function watchActivityType(plan: Pick<WatchSessionPlan, 'blocks'>): 37 | 50 | 63 {
  if (plan.blocks.every((b) => b.kind === 'strength' || b.kind === 'timed')) return 50;
  const runsOnly = plan.blocks.every((b) => b.kind === 'interval' && b.distanceM != null && b.target?.kind === 'pace');
  return runsOnly ? 37 : 63;
}

/** Two or three words for the complication, per tone (FEEL in brief.ts says the long form). */
export const GLANCE: Record<WatchBrief['tone'], string> = { ease: 'Running tired', watch: 'One thing to watch', steady: 'Good to go' };

/** The brief's feel words the strike goes under (FEEL in brief.ts). */
const STRIKE_WORD: Record<WatchBrief['tone'], string | null> = { ease: 'tired', watch: 'watch', steady: 'good' };

export interface WatchBriefOptions {
  /** Today's recommended version, when there's a session left today. */
  start: { version: WatchVersion; label: string } | null;
  checkedIn: boolean;
}

/** Today's brief → the watch's glance: feel line, the strongest reason, one action. */
export function watchBriefFrom(brief: DailyBrief, o: WatchBriefOptions): WatchBrief {
  const strike = STRIKE_WORD[brief.tone];
  const action: WatchAction = o.start
    ? { kind: 'start', version: o.start.version, label: clip(`Start ${o.start.label}`, 80) }
    : !o.checkedIn
      ? { kind: 'check_in', label: 'How do you feel?' }
      : { kind: 'none' };
  return {
    v: WATCH_PAYLOAD_VERSION,
    date: brief.date,
    tone: brief.tone,
    feel: clip(brief.feel, 80),
    glance: brief.why.length || brief.todo.length ? GLANCE[brief.tone] : 'Check in today',
    strike: strike && brief.feel.includes(strike) ? strike : null,
    reason: brief.why[0] ? clip(brief.why[0].text, 100) : null,
    action,
  };
}

/** Watch colours from the tenant: the phone's dark-mode rule (brand lightened to 4.5:1 on #171614). */
export const WATCH_BACKGROUND = '#171614';
export function watchBranding(t: Pick<TenantConfig, 'appName' | 'brandColor' | 'coach'>): WatchBranding {
  const light = checkBrandColor(t.brandColor, '#F3EFE7').suggestion;
  const accent = deriveDarkBrand(light, WATCH_BACKGROUND);
  return {
    appName: clip(t.appName, 40),
    coachName: clip(t.coach.name, 60),
    coachFirst: clip(t.coach.name.split(' ')[0] ?? t.coach.name, 30),
    monogram: t.coach.monogram.slice(0, 3),
    accent,
    accentInk: onColor(accent, '#FFFFFF', '#1C1B18'),
  };
}

/* ---------- results back into the phone's sessions ---------- */

/**
 * A deterministic UUID-shaped id from the result id and a running number, so a result delivered twice maps
 * to the same logged-set ids (the server's upserts then do nothing the second time).
 */
export function derivedId(base: string, n: number): string {
  const tail = base.slice(-4);
  const next = ((parseInt(tail, 16) + n + 1) % 0x10000).toString(16).padStart(4, '0');
  return `${base.slice(0, -4)}${next}`.toLowerCase();
}

/** Heart-rate recovery as plain numbers: bpm down after 1 and 2 minutes. */
export function hrRecoveryDrops(r: WatchHrRecovery | null): { drop60: number | null; drop120: number | null } {
  if (!r) return { drop60: null, drop120: null };
  return { drop60: r.at60 == null ? null : r.peak - r.at60, drop120: r.at120 == null ? null : r.peak - r.at120 };
}

/** "Down 31 bpm in the first minute" (and the second minute when known). Explain, don't score. */
export function hrRecoveryLine(r: WatchHrRecovery | null): string | null {
  const { drop60, drop120 } = hrRecoveryDrops(r);
  return recoveryDropLine(drop60, drop120);
}

/** The same line from a stored summary's drops (session.watch hrr60 / hrr120). */
export function recoveryDropLine(drop60: number | null, drop120: number | null): string | null {
  if (drop60 == null) return null;
  return drop120 != null ? `Down ${drop60} bpm in the first minute, ${drop120} after two` : `Down ${drop60} bpm in the first minute`;
}

/**
 * Pure helper the watch's Swift code mirrors (RecoveryMeter): from samples taken after the session ended
 * (t = seconds after the end), the reading nearest 60 s and 120 s, each within ±10 s.
 */
export function hrRecoveryFrom(peak: number | null, after: { t: number; bpm: number }[]): WatchHrRecovery | null {
  if (peak == null || peak < 30) return null;
  const near = (target: number) => {
    const c = after.filter((s) => Math.abs(s.t - target) <= 10).sort((a, b) => Math.abs(a.t - target) - Math.abs(b.t - target))[0];
    return c ? Math.round(c.bpm) : null;
  };
  return { peak: Math.round(peak), at60: near(60), at120: near(120) };
}

/** The per-session summary the coach may see (mutation `session.watch`), when the client shares it. */
export interface WatchSessionSummary {
  sessionId: string;
  source: 'apple_watch';
  avgHr: number | null;
  maxHr: number | null;
  hrrPeak: number | null;
  hrr60: number | null;
  hrr120: number | null;
  splits: { kind: 'interval' | 'station' | 'timed'; name: string; rep: number; sec: number; distanceM: number | null; avgHr: number | null; maxHr: number | null }[];
  recordedAt: string;
}

/** The phone's completed-session shape (apps/client store: PastSession + note/plan/variant). */
export interface CompletedFromWatch {
  sessionId: string;
  title: string;
  date: string;
  startedAt: string;
  finishedAt: string;
  feel: number;
  note: string | null;
  sets: LoggedSet[];
  variant?: 'lighter' | 'recovery';
  source: 'watch';
}

/**
 * A watch result → the phone's completed session (so it counts everywhere: load, progress, patterns) plus the
 * HR summary. Strength sets map 1:1; interval reps, stations and timed work with a program exercise behind them
 * become logged sets with duration/distance too; blocks with no program exercise (multi-sport, MOCK) are kept
 * in the summary's splits only.
 */
export function watchResultToSession(result: WatchResult, plan: WatchSessionPlan): { session: CompletedFromWatch; summary: WatchSessionSummary } {
  const sets: LoggedSet[] = [];
  let n = 0;
  const push = (programExerciseId: string, exerciseId: string, setIndex: number, x: Partial<LoggedSet>, at: string) =>
    sets.push({
      id: derivedId(result.resultId, n++),
      sessionId: result.resultId,
      programExerciseId,
      exerciseId,
      setIndex,
      weightKg: x.weightKg ?? null,
      reps: x.reps ?? null,
      rpe: x.rpe ?? null,
      durationS: x.durationS ?? null,
      distanceM: x.distanceM ?? null,
      loggedAt: at,
    });

  for (const s of result.sets) {
    const b = plan.blocks[s.b];
    if (b?.kind !== 'strength' || !b.programExerciseId) continue;
    push(b.programExerciseId, b.exerciseId, s.i, { weightKg: b.metric === 'weight_reps' ? s.loadKg : null, reps: s.reps, rpe: s.rpe }, s.at);
  }
  const splits: WatchSessionSummary['splits'] = [];
  for (const it of result.intervals) {
    const b = plan.blocks[it.b];
    if (b?.kind !== 'interval') continue;
    splits.push({ kind: 'interval', name: b.name, rep: it.i, sec: Math.round(it.workSec), distanceM: it.distanceM, avgHr: it.avgHr, maxHr: it.maxHr });
    if (b.programExerciseId && b.exerciseId) push(b.programExerciseId, b.exerciseId, it.i, { durationS: Math.round(it.workSec), distanceM: it.distanceM ?? b.distanceM }, result.endedAt);
  }
  for (const st of result.stations) {
    const b = plan.blocks[st.b];
    if (b?.kind !== 'station') continue;
    splits.push({ kind: 'station', name: b.name, rep: 0, sec: Math.round(st.sec), distanceM: b.distanceM, avgHr: st.avgHr, maxHr: st.maxHr });
    if (b.programExerciseId && b.exerciseId) push(b.programExerciseId, b.exerciseId, 0, { durationS: Math.round(st.sec), distanceM: b.distanceM, reps: b.reps, weightKg: b.loadKg }, result.endedAt);
  }
  for (const t of result.timed) {
    const b = plan.blocks[t.b];
    if (b?.kind !== 'timed') continue;
    splits.push({ kind: 'timed', name: b.name, rep: 0, sec: Math.round(t.sec), distanceM: null, avgHr: null, maxHr: null });
    if (b.programExerciseId && b.exerciseId) push(b.programExerciseId, b.exerciseId, 0, { durationS: Math.round(t.sec) }, result.endedAt);
  }
  sets.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const r = result.hrRecovery;
  const { drop60, drop120 } = hrRecoveryDrops(r);
  return {
    session: {
      sessionId: result.resultId,
      title: result.title,
      date: result.date,
      startedAt: result.startedAt,
      finishedAt: result.endedAt,
      feel: 0,
      note: null,
      sets,
      ...(result.version !== 'planned' ? { variant: result.version } : {}),
      source: 'watch',
    },
    summary: {
      sessionId: result.resultId,
      source: 'apple_watch',
      avgHr: result.hr?.avg ?? null,
      maxHr: result.hr?.max ?? null,
      hrrPeak: r?.peak ?? null,
      hrr60: drop60,
      hrr120: drop120,
      splits: splits.slice(0, 60),
      recordedAt: result.endedAt,
    },
  };
}
