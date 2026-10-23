import { CYCLE_PHASE_LABEL, type DailyRead, type ReadTone } from './signals';
import type { BriefReason, CycleEstimate, DailyBrief, FuelPattern, PhaseAdjustment, Symptom } from './physiology';
import { WEARABLE_SOURCE_LABEL, type BaselineStatus } from './wearables';
import { BODY_REGION_LABEL, painText, regionWord, regionsFor, type MonotonyStrain, type OngoingPain, type RegionLoad } from './injury';

/**
 * The daily brief (docs/features/brief.md): "you're running tired today, here's why, here's what to
 * do". Built on the existing daily read (signals.ts), plus wearables, fuelling, pain, symptoms and
 * cycle context. It combines strain the same way as dailyRead: two or more strain signals suggest an
 * easier day, one means "mostly good, one thing to watch".
 *
 * The cycle phase is never a strain signal. It's context, used to explain (and, through calibration,
 * to set loads), never framed as a problem.
 */

export interface BriefInjury {
  pain: OngoingPain[];
  regions: RegionLoad[];
  monotony: MonotonyStrain | null;
}

export interface BriefInput {
  read: DailyRead;
  hrv: BaselineStatus | null;
  restingHr: BaselineStatus | null;
  cycle: CycleEstimate | null;
  /** The calibration for today's phase, from the cycle build's calibrator. */
  calibration: PhaseAdjustment | null;
  fuel: FuelPattern | null;
  injury: BriefInjury | null;
  /** Today's symptoms, 0 none … 3 severe. */
  symptoms: Partial<Record<Symptom, number>> | null;
  /** The coach has an easier version of today's session the athlete can pick. */
  hasLighter: boolean;
  /** The coach's first name, for "Take the easier version Maya set". */
  coach: string;
  /** Today's planned exercises, so pain advice can name the exercise ("Skip the deadlift…"). */
  planned?: { exerciseId: string; name: string }[];
  /** Bedtime to suggest after short sleep or low HRV ("10:30"). */
  bedtime?: string;
  /** No session left today (rest day, or already done): the to-dos talk about the day, not about sets. */
  restDay?: boolean;
}

interface Candidate extends BriefReason {
  strain: boolean;
  /** Higher = stronger; used to order "Here's why". */
  weight: number;
}

interface Todo {
  text: string;
  source: BriefReason['source'] | null;
  weight: number;
}

/** Cycle modes with phases. Hormonal contraception, post-menopause and not tracking have none. */
const PHASED_MODES = new Set<CycleEstimate['mode']>(['natural', 'irregular', 'perimenopause']);

const SYMPTOM_WORDS: Record<Symptom, string> = {
  hot_flashes: 'hot flashes',
  night_sweats: 'night sweats',
  poor_sleep: 'poor sleep',
  joint_aches: 'joint aches',
  low_mood: 'low mood',
  brain_fog: 'brain fog',
  cramps: 'cramps',
  bloating: 'bloating',
  headache: 'headache',
};

/** Symptoms that cost recovery when they're moderate or worse (2+ of 3). */
const RECOVERY_SYMPTOMS: Symptom[] = ['night_sweats', 'poor_sleep', 'hot_flashes', 'joint_aches', 'headache', 'cramps'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export const FEEL: Record<ReadTone, string> = {
  ease: 'You’re running tired today',
  watch: 'Mostly good, one thing to watch',
  steady: 'You’re good to go',
};

export function dailyBrief(input: BriefInput): DailyBrief {
  const { read, coach } = input;
  const c: Candidate[] = [];
  const todos: Todo[] = [];
  const bed = input.bedtime ?? '10:30';

  // From the daily read: sleep, load, the check answers. Fuel from the read is replaced by the fuel
  // pattern when the fuel build provides one, so it never counts twice.
  for (const f of read.factors) {
    if (f.kind === 'cycle_phase') continue; // the brief explains the phase itself, below
    if (f.kind === 'fuel_low' && input.fuel) continue;
    const source: BriefReason['source'] =
      f.kind === 'sleep_short' || f.kind === 'sleep_ok' ? 'sleep' : f.kind === 'load_spike' || f.kind === 'load_drop' ? 'load' : f.kind === 'fuel_low' ? 'fuel' : 'check';
    const weight = f.kind === 'sleep_short' ? 80 : f.kind === 'load_spike' ? 75 : f.kind === 'fuel_low' ? 60 : f.strain ? 55 : f.kind === 'note' ? 5 : 10;
    c.push({ source, text: f.text, strain: f.strain, weight });
  }

  // Wearables, each against the athlete's own baseline.
  const hrv = input.hrv;
  if (hrv?.status === 'low' && hrv.deltaPct != null && hrv.source) {
    c.push({ source: 'hrv', strain: true, weight: 85 + Math.min(10, Math.abs(hrv.deltaPct) / 3), text: `HRV ${Math.abs(hrv.deltaPct)}% under your usual (${WEARABLE_SOURCE_LABEL[hrv.source]})` });
  } else if (hrv?.status === 'normal' && hrv.source) {
    c.push({ source: 'hrv', strain: false, weight: 12, text: `HRV in your usual range (${WEARABLE_SOURCE_LABEL[hrv.source]})` });
  }
  const rhr = input.restingHr;
  if (rhr?.status === 'high' && rhr.delta != null && rhr.source) {
    c.push({ source: 'resting_hr', strain: true, weight: 82 + Math.min(10, rhr.delta), text: `Resting heart rate ${Math.round(rhr.delta)} bpm over your usual (${WEARABLE_SOURCE_LABEL[rhr.source]})` });
  }

  // Fuelling pattern from the fuel build.
  const fuel = input.fuel;
  if (fuel && fuel.level !== 'none') {
    const sign = fuel.signs.find((s) => s.kind === 'low_ea') ?? fuel.signs[0];
    c.push({ source: 'fuel', strain: true, weight: fuel.level === 'talk_to_someone' ? 78 : 65, text: sign?.text ?? 'Eating under what training needs lately' });
  }

  // Pain and region load.
  const injury = input.injury;
  const pain = injury?.pain[0];
  if (pain) c.push({ source: 'pain', strain: true, weight: 70 + pain.latestLevel, text: painText(pain) });
  const hasLoadSpike = read.factors.some((f) => f.kind === 'load_spike');
  const spikes = (injury?.regions ?? []).filter((r) => r.spike).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  const painSpike = pain ? spikes.find((r) => r.region === pain.region) : undefined;
  const topSpike = painSpike ?? spikes[0];
  if (topSpike) {
    // A region spike on its own is a heads-up; with pain in the same region, or no overall spike already
    // counted, it's a strain signal.
    c.push({
      source: 'load',
      strain: !!painSpike || !hasLoadSpike,
      weight: painSpike ? 74 : 50,
      text: `${BODY_REGION_LABEL[topSpike.region]} load this week is ${topSpike.ratio}× your usual`,
    });
  }
  if (injury?.monotony?.high && !hasLoadSpike && !topSpike) {
    c.push({ source: 'load', strain: true, weight: 45, text: 'Most days this week were a similar hard load, with little easy time between' });
  }

  // Symptoms (perimenopause and any mode).
  const sym = input.symptoms ?? {};
  const strongSymptoms = RECOVERY_SYMPTOMS.filter((s) => (sym[s] ?? 0) >= 2);
  if (strongSymptoms.length) {
    c.push({ source: 'symptoms', strain: true, weight: 58, text: `${cap(list(strongSymptoms.map((s) => SYMPTOM_WORDS[s])))} logged today` });
  }

  // Cycle: context only, and only in modes that have phases.
  const cycle = input.cycle;
  const phased = cycle && PHASED_MODES.has(cycle.mode) && cycle.phase;
  const cal = input.calibration;
  if (phased && cal && cal.phase === cycle!.phase && cal.confidence !== 'none' && Math.abs(cal.deltaPct) >= 1) {
    const dir = cal.deltaPct < 0 ? 'lower' : 'higher';
    c.push({
      source: 'cycle',
      strain: false,
      weight: 20,
      text: `${CYCLE_PHASE_LABEL[cal.phase]} phase: your lifts usually run ~${Math.round(Math.abs(cal.deltaPct))}% ${dir} here (your own data, ${cal.cycles} cycle${cal.cycles === 1 ? '' : 's'})`,
    });
  } else if (phased) {
    c.push({ source: 'cycle', strain: false, weight: 8, text: cycle!.note || `${CYCLE_PHASE_LABEL[cycle!.phase!]} phase` });
  }

  const strain = c.filter((x) => x.strain);
  const tone: ReadTone = strain.length >= 2 ? 'ease' : strain.length === 1 ? 'watch' : 'steady';
  const anything = c.length > 0 || read.factors.length > 0;
  const feel = !anything ? 'Check in to get today’s brief' : FEEL[tone];

  // Strain reasons first (strongest first), then context.
  const why = [...c]
    .sort((a, b) => Number(b.strain) - Number(a.strain) || b.weight - a.weight)
    .slice(0, 3)
    .map(({ source, text }) => ({ source, text }));

  // What to do.
  const sources = new Set(strain.map((s) => s.source));
  if (input.restDay) {
    if (tone !== 'steady') todos.push({ text: 'Keep today easy: a walk or some mobility is plenty', source: null, weight: 100 });
  } else if (tone === 'ease') {
    todos.push(input.hasLighter ? { text: `Take the easier version ${coach} set`, source: null, weight: 100 } : { text: 'Keep top sets at RPE 7', source: null, weight: 100 });
  } else if (tone === 'watch' && (sources.has('hrv') || sources.has('resting_hr') || sources.has('load') || sources.has('sleep'))) {
    todos.push({ text: 'Keep top sets at RPE 7', source: null, weight: 90 });
  }
  if (pain) {
    const regionHit = (input.planned ?? []).find((p) => regionsFor(p.exerciseId).includes(pain.region));
    todos.push({
      source: 'pain',
      weight: 95,
      text: regionHit
        ? `Skip the ${regionHit.name.toLowerCase()} if the ${regionWord(pain.region)} pain is above 3/10 and tell ${coach}`
        : `Keep it pain-free: if the ${regionWord(pain.region)} hurts above 3/10 during a set, stop that exercise and tell ${coach}`,
    });
  }
  if (sources.has('fuel')) {
    todos.push({ source: 'fuel', weight: 80, text: fuel?.fixes[0] ?? 'Eat carbs + protein within an hour after' });
  }
  if (sources.has('sleep') || sources.has('hrv') || sources.has('resting_hr') || (sources.has('symptoms') && strongSymptoms.some((s) => s === 'night_sweats' || s === 'poor_sleep'))) {
    todos.push({ source: sources.has('sleep') ? 'sleep' : sources.has('hrv') ? 'hrv' : sources.has('resting_hr') ? 'resting_hr' : 'symptoms', weight: 70, text: `Aim for bed by ${bed}` });
  }
  if (!todos.length && anything) todos.push({ source: null, weight: 10, text: input.restDay ? 'Nothing else needed today: enjoy it' : 'Train as planned' });
  const top = todos.sort((a, b) => b.weight - a.weight).slice(0, 3);

  const calibration =
    phased && cal && cal.phase === cycle!.phase && cal.appliedPct !== 0
      ? {
          appliedPct: cal.appliedPct,
          reason: `Suggested loads ${cal.appliedPct < 0 ? 'eased' : 'raised'} ${Math.abs(cal.appliedPct)}% to match how your lifts usually run in this phase (your own data, ${cal.cycles} cycle${cal.cycles === 1 ? '' : 's'})`,
        }
      : null;

  return {
    date: read.date,
    tone,
    feel,
    why,
    todo: top.map((t) => t.text),
    todoSources: top.map((t) => t.source),
    calibration,
    suggestLighter: tone === 'ease',
  };
}

/* ---------- what the coach sees ---------- */

export interface SharedBrief {
  tone: ReadTone;
  feel: string;
  why: BriefReason[];
  todo: string[];
  suggestLighter: boolean;
}

export interface BriefSharing {
  shareCycle: boolean;
  shareFuel: boolean;
  sharePain: boolean;
}

/**
 * The brief as the coach may see it: cycle reasons (and the calibration note) only with shareCycle,
 * fuel reasons only with shareFuel, pain only with sharePain, along with the to-dos that came from them.
 */
export function sharedBrief(brief: DailyBrief, s: BriefSharing): SharedBrief {
  const hidden = (src: BriefReason['source'] | null | undefined) =>
    (src === 'cycle' && !s.shareCycle) || (src === 'fuel' && !s.shareFuel) || (src === 'pain' && !s.sharePain);
  const sources = brief.todoSources ?? [];
  return {
    tone: brief.tone,
    feel: brief.feel,
    why: brief.why.filter((r) => !hidden(r.source)),
    todo: brief.todo.filter((_, i) => !hidden(sources[i])),
    suggestLighter: brief.suggestLighter,
  };
}
