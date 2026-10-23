import { STARTER_LIBRARY, findLibraryExercise, type LibraryExercise } from '../library';
import { detectWorkoutFormat } from './format';
import { parseScalingLevels } from './scaling';
import type { ParseOptions, ParsedSegment, ParsedWorkout } from './types';

/**
 * Rule-based paste-to-structure parser (docs/ports.md row 2): the rule half of Station Zero's
 * WorkoutSegmentService.ts, plus its format detection and scaling-level parsing. No AI fallback: what the rules
 * can't read is reported in `warnings`, so the coach fixes it rather than a model guessing.
 *
 * What it reads, line by line: reps ("21 Thrusters", "Wall Balls 100 reps"), pairs ("15/12 cal"), sets × reps
 * ("5x5"), loads ("135/95", "60 kg", "225#", "@ 80%", "1.5 pood"), calories, distance (m, km, k, mi, ft),
 * duration ("30s", "2 min", "1:30"), rest lines and inline rest ("90s rest"), rounds ("5 rounds for time",
 * "3 RFT"), rep schemes ("21-15-9"), time caps, AMRAP/EMOM/E2MOM/"every 2:00"/tabata/"40 on 20 off" headers,
 * odd/even minutes, a per-station cap, and a title line.
 *
 * Source behaviour not carried over: the source expanded rounds into one segment per round (the block model
 * will own repetition), estimated durations and heart-rate zones per segment (invented pacing numbers), and
 * appended a run after the last Hyrox station (a real race ends on the last station).
 */

const LB_PER_KG = 2.2046226218;
/** Kettlebells sized in pood are 16 kg per pood by convention (1.5 pood = 24 kg). */
const KG_PER_POOD = 16;
const M_PER_MILE = 1609.344;
const M_PER_FT = 0.3048;

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (s: string | undefined) => (s == null ? null : Number(s));

/* ---------- small extractors: each finds one thing in a piece of text and removes it ---------- */

interface Piece {
  s: string;
}

function take(p: Piece, re: RegExp): RegExpMatchArray | null {
  const m = p.s.match(re);
  if (m) p.s = `${p.s.slice(0, m.index!)} ${p.s.slice(m.index! + m[0].length)}`;
  return m;
}

const SEC_UNIT = /^(?:s|secs?|seconds?)$/i;

/** "1:30" → 90, "90s" → 90, "2 min" → 120, "1.5 min" → 90. `bareM` reads "2m" as minutes (only for rest). */
function durationOf(text: string, bareM: boolean): { sec: number; match: string } | null {
  const clock = text.match(/(?<![\d.])(\d{1,2}):([0-5]\d)(?!\d)/);
  if (clock) return { sec: Number(clock[1]) * 60 + Number(clock[2]), match: clock[0] };
  const unit = bareM ? 'seconds?|secs?|s|minutes?|mins?|m' : 'seconds?|secs?|s|minutes?|mins?';
  const m = text.match(new RegExp(`(?<![\\d.])(\\d+(?:\\.\\d+)?)\\s*(${unit})(?![a-z])`, 'i'));
  if (!m) return null;
  const n = Number(m[1]);
  return { sec: Math.round(SEC_UNIT.test(m[2]!) ? n : n * 60), match: m[0] };
}

const toKg = (n: number, unit: string): { kg: number; lb: boolean } => {
  const u = unit.toLowerCase();
  if (u === '#' || u.startsWith('lb') || u.startsWith('pound'))
    return { kg: r1(n / LB_PER_KG), lb: true };
  if (u === 'pood' || u === 'pd') return { kg: r1(n * KG_PER_POOD), lb: false };
  return { kg: r1(n), lb: false };
};

const toMetres = (n: number, unit: string): number => {
  const u = unit.toLowerCase();
  if (u === 'k' || u.startsWith('km') || u.startsWith('kilo')) return Math.round(n * 1000);
  if (u === 'mi' || u.startsWith('mile')) return Math.round(n * M_PER_MILE);
  if (u === 'ft' || u === 'feet' || u === "'") return Math.round(n * M_PER_FT);
  return Math.round(n);
};

interface LineContext {
  defaultUnit: 'kg' | 'lb';
  /** Loads read without a unit, for one warning per paste. */
  assumed: string[];
  lib: LibraryExercise[];
}

/** A segment with every field empty. */
export function emptySegment(raw: string): ParsedSegment {
  return {
    kind: 'work',
    movement: '',
    movementId: null,
    reps: null,
    repsAlt: null,
    sets: null,
    repScheme: null,
    loadKg: null,
    loadKgAlt: null,
    loadFromLb: false,
    loadUnitAssumed: false,
    percent1rm: null,
    calories: null,
    caloriesAlt: null,
    distanceM: null,
    durationSec: null,
    note: null,
    raw,
  };
}

/** Bullets and list numbers off the front: "- ", "• ", "1. ", "2) ". */
const stripBullet = (l: string) =>
  l
    .trim()
    .replace(/^[-*•·]\s+/, '')
    .replace(/^\d{1,2}[.)]\s+/, '')
    .trim();

/**
 * One movement line → a segment. Returns null when nothing movement-like is left (a line of only numbers).
 * Fields are filled from the main text first, then from anything in brackets ("Thrusters (95/65)").
 */
export function parseMovementLine(line: string, opts: ParseOptions = {}): ParsedSegment | null {
  const ctx: LineContext = {
    defaultUnit: opts.defaultLoadUnit ?? 'lb',
    assumed: [],
    lib: STARTER_LIBRARY,
  };
  return movementLine(line, ctx);
}

function movementLine(line: string, ctx: LineContext): ParsedSegment | null {
  const seg = emptySegment(line);
  const notes: string[] = [];
  const main: Piece = { s: stripBullet(line) };
  const brackets: Piece[] = [];
  main.s = main.s.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    brackets.push({ s: inner });
    return ' ';
  });
  const pieces = [main, ...brackets];

  for (const p of pieces) {
    // Box and target heights: 24"/20" or 24/20 in. Kept as a note, never a load.
    const inch = take(
      p,
      /(\d+)\s*(?:"|''|in\b|inch(?:es)?)?\s*\/\s*(\d+)\s*(?:"|''|in\b|inch(?:es)?)|(\d+)\s*(?:"|''|inch(?:es)?\b)/i,
    );
    if (inch) notes.push(inch[3] ? `${inch[3]} in` : `${inch[1]}/${inch[2]} in`);
    const pace = take(
      p,
      /@?\s*(?:at\s+)?([\w:.]+\s*(?:k|km|mile|marathon|race|threshold|tempo|easy)?\s*pace)\b/i,
    );
    if (pace) notes.push(pace[0].replace(/^@\s*/, '@ ').trim());
    const effort = take(
      p,
      /(?:@|\bat\b)?\s*\b(easy|conversational|steady|threshold|tempo|race|moderate|hard|all[\s-]out|zone\s*\d)(?:\s*(?:effort|pace|intensity))?\b/i,
    );
    if (effort)
      notes.push(
        effort[0]
          .replace(/^\s*@\s*/, '')
          .trim()
          .toLowerCase(),
      );
    const back = take(
      p,
      /[,;]?\s*\b(?:walk|jog)(?:ing)?\s+back(?:\s+down)?(?:\s+(?:recovery|rest|to\s+recover))?\b/i,
    );
    if (back)
      notes.push(
        back[0]
          .replace(/^[,;\s]+/, '')
          .trim()
          .toLowerCase(),
      );
    const build = take(p, /\bbuild(?:ing)?\s+(?:up\s+)?to\s+(?:an?\s+)?[\w\s-]*$/i);
    if (build) notes.push(build[0].trim().toLowerCase());
    const rpe = take(p, /@?\s*rpe\s*(\d+(?:\.\d+)?)/i);
    if (rpe) notes.push(`RPE ${rpe[1]}`);
    const each = take(
      p,
      /\/\s*(?:leg|side|arm)\b|\beach\s+(?:leg|side|arm)\b|\bper\s+(?:leg|side|arm)\b/i,
    );
    if (each) notes.push(each[0].replace(/^\/\s*/, 'per ').trim());
  }

  for (const p of pieces) {
    // Sets of a timed hold or effort: "3x60s", "4 x 2 min".
    if (seg.sets == null) {
      const hold = take(
        p,
        /(?<![\d.])(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|min|mins|minutes?)(?![a-z])/i,
      );
      if (hold) {
        seg.sets = Number(hold[1]);
        seg.durationSec = Math.round(
          SEC_UNIT.test(hold[3]!) ? Number(hold[2]) : Number(hold[2]) * 60,
        );
      }
    }
    // Repeats before a distance: "8 x 400m", "6x 500m row".
    if (seg.sets == null) {
      const reps = take(
        p,
        /^\s*(\d+)\s*[x×]\s*(?=\d+(?:\.\d+)?\s*(?:km|k|m|mi|miles?|met(?:er|re)s?)(?![a-z]))/i,
      );
      if (reps) seg.sets = Number(reps[1]);
    }
    if (seg.percent1rm == null) {
      const pct = take(
        p,
        /@?\s*(\d{2,3}(?:\.\d+)?)\s*%\s*(?:of\s*)?(?:(?:e?1\s*rm|max|training max|tm)\b)?/i,
      );
      if (pct) seg.percent1rm = Number(pct[1]);
    }
    if (seg.calories == null) {
      const cal = take(
        p,
        /(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*-?\s*(?:cals?|calories?|kcal)\b/i,
      );
      if (cal) {
        seg.calories = Number(cal[1]);
        seg.caloriesAlt = num(cal[2]);
      }
    }
    if (seg.loadKg == null) {
      // "2 x 24 kg" or "2x24kg": two implements, the load is per implement.
      const impl = take(
        p,
        /(\d)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kgs?|kilos?|lbs?|pounds?|#)(?![a-z])/i,
      );
      const withUnit = impl
        ? null
        : take(
            p,
            /(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*(kgs?|kilos?|lbs?|pounds?|#|pood|pd)(?![a-z])/i,
          );
      const m = impl ?? withUnit;
      if (m) {
        const unit = impl ? m[3]! : m[3]!;
        const a = toKg(Number(impl ? m[2] : m[1]), unit.replace(/s$/i, ''));
        seg.loadKg = a.kg;
        seg.loadFromLb = a.lb;
        if (!impl && m[2]) seg.loadKgAlt = toKg(Number(m[2]), unit.replace(/s$/i, '')).kg;
        if (impl) notes.push(`${m[1]} × ${m[2]} ${unit.toLowerCase().replace(/s$/, '')}`);
      }
    }
    if (seg.distanceM == null) {
      const d = take(
        p,
        /(?<![\d.:])(\d+(?:\.\d+)?)\s*(kilomet(?:er|re)s?|km|k|miles?|mi|met(?:er|re)s?|m|feet|ft|')(?![a-z0-9])/i,
      );
      if (d) seg.distanceM = toMetres(Number(d[1]), d[2]!);
    }
  }

  for (const p of pieces) {
    if (seg.sets == null) {
      const setsOf = take(p, /(\d+)\s*sets?\s*(?:of\s*|x\s*)(\d+|max)\b/i);
      const sxr =
        setsOf ??
        take(
          p,
          /(?<![\d.])(\d+)\s*[x×]\s*(\d+|max)\b(?!\s*(?:m\b|km|k\b|mi\b|cal|min|sec|s\b|%))/i,
        );
      if (sxr) {
        seg.sets = Number(sxr[1]);
        if (/max/i.test(sxr[2]!)) notes.push('max reps');
        else seg.reps = Number(sxr[2]);
      } else {
        const lead =
          take(p, /^\s*(\d+)\s*[x×](?=\s|$|[A-Za-z]{2})\s*/i) ??
          take(p, /(?:^|\s)[x×]\s*(\d+)\s*$/i) ??
          take(p, /^\s*(\d+)\s*sets?\b/i);
        if (lead) seg.sets = Number(lead[1]);
      }
    }
  }

  for (const p of pieces) {
    if (seg.durationSec == null) {
      const d = durationOf(p.s, false);
      if (d) {
        seg.durationSec = d.sec;
        p.s = p.s.replace(d.match, ' ');
      }
    }
  }

  // Reps: a leading number (or pair), "N reps", or "max".
  if (seg.reps == null) {
    const lead = take(main, /^\s*(\d+)(?:\s*\/\s*(\d+))?\s+(?=[A-Za-z])(?![x×]\s)/);
    if (lead) {
      seg.reps = Number(lead[1]);
      seg.repsAlt = num(lead[2]);
    } else {
      for (const p of pieces) {
        const r = take(p, /(\d+)\s*reps?\b/i);
        if (r) {
          seg.reps = Number(r[1]);
          break;
        }
      }
    }
  }
  for (const p of pieces) {
    if (
      take(p, /\bmax(?:imum)?\s*(?:reps?|effort|cals?|distance)?\b/i) &&
      !notes.includes('max reps')
    )
      notes.push('max');
  }

  // Loads written without a unit: "@ 225", or a pair like "95/65" anywhere but the start (the start is reps).
  if (seg.loadKg == null) {
    for (const p of pieces) {
      const at =
        take(p, /@\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?(?![\d%])/) ??
        take(p, /(?<![\d.])(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?![\d%])/);
      if (at) {
        const a = toKg(Number(at[1]), ctx.defaultUnit);
        seg.loadKg = a.kg;
        seg.loadFromLb = a.lb;
        seg.loadUnitAssumed = true;
        if (at[2]) seg.loadKgAlt = toKg(Number(at[2]), ctx.defaultUnit).kg;
        ctx.assumed.push(at[2] ? `${at[1]}/${at[2]}` : at[1]!);
        break;
      }
    }
  }

  // A trailing bare number after a known movement is reps: "Wall Balls 100".
  let name = main.s;
  if (
    seg.reps == null &&
    seg.distanceM == null &&
    seg.calories == null &&
    seg.durationSec == null
  ) {
    const trail = name.match(/^(.*[A-Za-z].*?)\s+(\d{1,3})\s*$/);
    if (trail && findLibraryExercise(ctx.lib, cleanName(trail[1]!))) {
      seg.reps = Number(trail[2]);
      name = trail[1]!;
    }
  }

  for (const b of brackets) {
    const left = cleanName(b.s);
    if (left && /[a-z]/i.test(left)) notes.push(left);
  }

  seg.movement = cleanName(name);
  if (!seg.movement || !/[a-z]/i.test(seg.movement)) {
    // "400m" on its own line is a run in race and interval pastes.
    if (seg.distanceM != null) seg.movement = 'Run';
    else return null;
  }
  seg.movementId = findLibraryExercise(ctx.lib, seg.movement)?.id ?? null;
  seg.note = notes.length ? notes.join('; ') : null;
  return seg;
}

/** What's left once numbers are gone: "@ Thrusters -" → "Thrusters". */
function cleanName(s: string): string {
  return s
    .replace(/\bfor\s+time\b|\bfor\s+(?:quality|load)\b/gi, ' ')
    .replace(/\bof\b|\breps?\b/gi, ' ')
    .replace(/\s+(?:in|at|on|for|with|under|within)\s*$/i, ' ')
    .replace(/[@:;,]+/g, ' ')
    .replace(/(^|\s)[x×](\s|$)/gi, ' ')
    .replace(/(^|\s)[/+&\-–—]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—./]+|[\s\-–—./]+$/g, '')
    .trim();
}

/* ---------- line kinds ---------- */

const REST_LINE =
  /^(?:rest|recover(?:y)?|walk(?:ing)?\s*rest)\b|^\d+(?::\d{2})?\s*(?:s|sec|secs|seconds|min|mins|minutes|m)?\s*(?:of\s*)?(?:(?:jog|walk|easy)\s*)?(?:rest|recovery)\b/i;
const INLINE_REST =
  /[,;]?\s*(?:w\/|with\s*)?\s*(\d+(?::\d{2})?\s*(?:s|sec|secs|seconds|min|mins|minutes|m)?)\s*(?:of\s*)?(?:(?:jog|walk)\s*)?(?:rest|recovery|recover)(?:\s*(?:jog|walk))?(?:\s*between(?:\s*\w+)?)?\b|[,;]?\s*(?:rest|recover)\s*(\d+(?::\d{2})?\s*(?:s|sec|secs|seconds|min|mins|minutes|m)?)(?:\s*between(?:\s*\w+)?)?/i;
const META_LINE =
  /^(?:score[ds]?|scoring|scored)\b|^(?:notes?|goal|stimulus|target|intent|coach(?:'s)?\s*notes?|focus)\s*[:\-–]/i;
const SEPARATOR = /^[\s\-—–=*_~.]+$/;
const FORMAT_WORD = /^(?:chipper|partner\s*wod|team\s*wod|for\s*(?:quality|load|reps|max))\s*:?$/i;

interface Collected {
  w: ParsedWorkout;
  ctx: LineContext;
  /** Scheme that applies to the movement lines after a standalone "21-15-9". */
  scheme: number[] | null;
  schemes: number[][];
  forTime: boolean;
}

function readRest(text: string): number | null {
  const d = durationOf(text, true);
  if (d) return d.sec;
  const bare = text.match(/(?:rest|recover(?:y)?)\s*[:\-–]?\s*(\d+)\s*$/i);
  if (bare) {
    const n = Number(bare[1]);
    // Source rule, kept: a bare number of 10 or more is seconds, under 10 is minutes ("rest 90", "rest 2").
    return n >= 10 ? n : n * 60;
  }
  return null;
}

function restSegment(raw: string, sec: number | null, note: string | null = null): ParsedSegment {
  return { ...emptySegment(raw), kind: 'rest', movement: 'Rest', durationSec: sec, note };
}

/** Header lines change the workout's fields and may leave movement text after a colon. Returns that text, or null when the line wasn't a header. */
function header(line: string, c: Collected): string | null {
  const w = c.w;
  let m: RegExpMatchArray | null;

  // Time caps and per-station caps can sit on any line; take them out first.
  let l = line;
  const station = l.match(
    /(\d+)\s*(?:min|minutes?|m)\s*(?:\/|per|each|a)\s*station|each\s+station\s*[:\-–]?\s*(\d+)\s*(?:min|minutes?)|station\s+cap\s*[:\-–]?\s*(\d+)\s*(?:min|minutes?)/i,
  );
  if (station) {
    w.stationCapSec = Number(station[1] ?? station[2] ?? station[3]) * 60;
    l = l.replace(station[0], ' ').trim();
  }
  const cap = l.match(
    /\(?\s*(?:time\s*cap|\bcap|\btc)\s*(?:of\s*)?[:\-–=]?\s*(\d+)(?::(\d{2}))?\s*(?:min(?:ute)?s?|'|m\b)?\s*\)?|\(?\s*(\d+)\s*(?:min(?:ute)?s?|')\s*(?:time\s*)?cap\s*\)?/i,
  );
  if (cap) {
    w.timeCapSec = cap[3] ? Number(cap[3]) * 60 : Number(cap[1]) * 60 + Number(cap[2] ?? 0);
    l = l.replace(cap[0], ' ').trim();
  }
  const onOff = l.match(
    /(\d+)\s*(?:s|sec|secs|seconds)?\s*(?:on|work)\s*[/,:]?\s*(\d+)\s*(?:s|sec|secs|seconds)?\s*(?:off|rest)/i,
  );
  if (onOff) {
    w.workSec = Number(onOff[1]);
    w.restSec = Number(onOff[2]);
    l = l.replace(onOff[0], ' ').trim();
  }
  const changed = l !== line;
  // What's left of "40 on / 20 off x 8".
  const times = changed ? l.match(/^[x×]\s*(\d+)\s*(?:rounds?|sets?)?\s*$/i) : null;
  if (times) {
    w.rounds = Number(times[1]);
    return '';
  }

  // AMRAP
  m = l.match(
    /^(?:(\d+)\s*(?:min(?:ute)?s?|')\s*amrap|(\d+):00\s*amrap|amrap\s*(?:in\s*|of\s*)?(?:(\d+)(?::00)?\s*(?:min(?:ute)?s?|')?)?|as many (?:rounds|reps)(?: (?:and reps )?as possible)?\s*(?:in\s*)?(?:(\d+)\s*(?:min(?:ute)?s?)?)?)\s*(?:[:\-–]\s*|\s+|$)(.*)$/i,
  );
  if (m && /amrap|as many/i.test(l)) {
    const min = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (min) w.timeCapSec = Number(min) * 60;
    return m[5] ?? '';
  }

  // E2MOM / EMOM: "EMOM 12", "12 min EMOM", "E2MOM x 5", "EMOM x 10"
  m = l.match(
    /^(?:(\d+)\s*(?:min(?:ute)?s?|')\s+)?e(\d*)mom\b\s*(x|for)?\s*(\d+)?\s*(min(?:ute)?s?|rounds?|sets?)?\s*(?:[:\-–]\s*|$)(.*)$/i,
  );
  if (m) {
    w.intervalSec = (m[2] ? Number(m[2]) : 1) * 60;
    if (m[1]) w.timeCapSec = Number(m[1]) * 60;
    else if (m[4]) {
      const n = Number(m[4]);
      const asRounds =
        /round|set/i.test(m[5] ?? '') || (m[3]?.toLowerCase() === 'x' && w.intervalSec > 60);
      if (asRounds) {
        w.rounds = n;
        w.timeCapSec = n * w.intervalSec;
      } else w.timeCapSec = n * 60;
    }
    return m[6] ?? '';
  }

  // "Every 2:00 x 5", "Every 90 seconds for 12 min", "Every minute on the minute for 10 minutes"
  m = l.match(
    /^every\s+(?:(\d+):(\d{2})|(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|sec(?:ond)?s?|s|m)\b|min(?:ute)?\b)(?:\s*on\s*the\s*minute)?\s*(?:(x|for)\s*(\d+)\s*(min(?:ute)?s?|rounds?|sets?)?)?\s*(?:\(\s*(\d+)\s*(?:rounds?|sets?)\s*\))?\s*(?:[:\-–]\s*|$)(.*)$/i,
  );
  if (m) {
    w.intervalSec = m[1]
      ? Number(m[1]) * 60 + Number(m[2])
      : m[3]
        ? Math.round(SEC_UNIT.test(m[4]!) ? Number(m[3]) : Number(m[3]) * 60)
        : 60;
    const n = m[6] ? Number(m[6]) : m[8] ? Number(m[8]) : null;
    if (n != null) {
      const minutes = /min/i.test(m[7] ?? '') || (m[5]?.toLowerCase() === 'for' && !m[7]);
      if (minutes && !m[8]) w.timeCapSec = n * 60;
      else {
        w.rounds = n;
        w.timeCapSec = n * w.intervalSec;
      }
    }
    return m[9] ?? '';
  }

  // Tabata
  m = l.match(/^tabata\b\s*(?:x\s*(\d+)|(\d+)\s*rounds?)?\s*(?:[:\-–]\s*)?(.*)$/i);
  if (m) {
    w.workSec = w.workSec ?? 20;
    w.restSec = w.restSec ?? 10;
    if (m[1] ?? m[2]) w.rounds = Number(m[1] ?? m[2]);
    return m[3] ?? '';
  }

  // "For time", "For time (cap 12)"
  m = l.match(/^for\s*time\b\s*(?:of\s*)?(?:[:\-–]\s*)?(.*)$/i);
  if (m) {
    c.forTime = true;
    return m[1] ?? '';
  }

  // Rounds: "5 rounds for time:", "3 RFT", "5 rounds of:", "4 rounds", "For 5 rounds:"
  m = l.match(
    /^(?:(\d+)\s*(?:rounds?|rnds?|rft)\b(\s*(?:for|4)\s*time)?|for\s+(\d+)\s*rounds?\b)\s*(?:of\b\s*)?(?:[:\-–]\s*)?(.*)$/i,
  );
  if (m) {
    w.rounds = Number(m[1] ?? m[3]);
    if (m[2] || /rft/i.test(l)) c.forTime = true;
    return m[4] ?? '';
  }
  // "4 sets:" on its own line means rounds of what follows.
  m = l.match(/^(\d+)\s*sets?\s*(?:of\s*)?:?\s*$/i);
  if (m) {
    w.rounds = Number(m[1]);
    return '';
  }
  return changed ? l : null;
}

const SCHEME =
  /^((?:\d+(?:\s*\/\s*\d+)?\s*[-–]\s*)+\d+(?:\s*\/\s*\d+)?)\s*(?:reps?)?\s*(?:of\b)?\s*(?:[:\-–]\s*)?(.*)$/i;

function readScheme(s: string): number[] | null {
  const parts = s.split(/\s*[-–]\s*/).map((x) => Number(x.split('/')[0]!.trim()));
  return parts.length >= 2 &&
    parts.length <= 12 &&
    parts.every((n) => Number.isInteger(n) && n > 0 && n <= 999)
    ? parts
    : null;
}

/** "5 pull-ups, 10 push-ups, 15 squats" or "thrusters / pull-ups" → one piece each, when the pieces look like movements. */
function splitMovements(text: string, lib: LibraryExercise[]): string[] {
  const pieces = text
    .split(/\s*[,;]\s*|\s+\/\s+|\s+\+\s+|\s+then\s+|\s+&\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
  if (pieces.length < 2) return [text];
  const looksLikeMovement = (p: string) =>
    /^\d/.test(p) ||
    findLibraryExercise(lib, cleanName(p.replace(/\d+.*$/, ''))) != null ||
    findLibraryExercise(lib, cleanName(p)) != null;
  const ok = pieces.filter(looksLikeMovement).length;
  return ok >= 2 && pieces.every((p) => /[a-z]/i.test(p)) ? pieces : [text];
}

function addMovements(
  text: string,
  c: Collected,
  extraNote: string | null = null,
  scheme: number[] | null = c.scheme,
) {
  for (const piece of splitMovements(text, c.ctx.lib)) {
    const prev = c.w.segments[c.w.segments.length - 1];
    if (REST_LINE.test(piece.trim())) {
      const sec = readRest(piece);
      c.w.segments.push(restSegment(piece, sec, sec == null ? piece.trim() : null));
      if (sec != null && c.w.restSec == null && (prev?.sets != null || c.w.rounds != null))
        c.w.restSec = sec;
      continue;
    }
    // A modifier on its own line belongs to the line above: "Bike" then "Max cal".
    if (
      prev &&
      prev.kind === 'work' &&
      /^(?:max(?:imum)?|unbroken|easy|moderate|hard|steady|all out)\b[\w\s]*$/i.test(
        piece.trim(),
      ) &&
      !findLibraryExercise(c.ctx.lib, piece.trim())
    ) {
      prev.note = prev.note
        ? `${prev.note}; ${piece.trim().toLowerCase()}`
        : piece.trim().toLowerCase();
      continue;
    }
    // Movement-first scheme: "Back Squat 5-5-5-3-3" or "Back squat: 5-3-1".
    const tail = piece.match(
      /^([A-Za-z][A-Za-z '&-]*?)\s*[:\-–]?\s+((?:\d+\s*[-–]\s*)+\d+)\s*(.*)$/,
    );
    let own = scheme;
    let body = piece;
    if (tail && readScheme(tail[2]!)) {
      own = readScheme(tail[2]!);
      body = `${tail[1]} ${tail[3] ?? ''}`;
    }
    const inlineRest = body.match(INLINE_REST);
    let restSec: number | null = null;
    if (inlineRest && !REST_LINE.test(body.trim())) {
      restSec = readRest(inlineRest[1] ?? inlineRest[2] ?? '');
      body = body.replace(inlineRest[0], ' ');
    }
    const seg = movementLine(body, c.ctx);
    if (!seg) {
      if (/\S/.test(body)) c.w.warnings.push(`Couldn’t read “${piece.trim()}”`);
      continue;
    }
    seg.raw = piece;
    if (own) {
      seg.repScheme = own;
      c.schemes.push(own);
    }
    if (extraNote) seg.note = seg.note ? `${extraNote}; ${seg.note}` : extraNote;
    c.w.segments.push(seg);
    if (restSec != null) {
      c.w.segments.push(restSegment(piece, restSec));
      if (c.w.restSec == null && (seg.sets != null || c.w.rounds != null)) c.w.restSec = restSec;
    }
  }
}

function lineOf(raw: string, c: Collected, index: number, lines: string[]) {
  const line = stripBullet(raw);
  if (!line || SEPARATOR.test(line)) return;
  if (META_LINE.test(line)) {
    c.w.notes.push(line);
    return;
  }
  if (FORMAT_WORD.test(line)) return;
  if (/^(?:hyrox|race)\s*(?:sim(?:ulation)?)?\s*:?\s*$/i.test(line) && index === 0) {
    c.w.title = line.replace(/:$/, '');
    return;
  }

  // Rest lines: "Rest 2:00", "90s rest", "Rest 3 min between rounds".
  if (REST_LINE.test(line)) {
    const sec = readRest(line);
    if (/between/i.test(line) && sec != null) c.w.restSec = c.w.restSec ?? sec;
    c.w.segments.push(restSegment(raw, sec, sec == null ? line : null));
    return;
  }

  const h = header(line, c);
  if (h != null) {
    // A first line like "Hyrox sim, 4 min per station" can still be the title once the cap is taken out.
    if (h.trim()) lineOf(h, c, h === line ? index + 1 : index, lines);
    return;
  }

  // Odd / even minutes, "Min 1: …"
  const oe = line.match(/^(odd|even)\s*(?:min(?:ute)?s?)?\s*[:\-–]\s*(.+)$/i);
  if (oe) return addMovements(oe[2]!, c, `${oe[1]!.toLowerCase()} minutes`);
  const minute = line.match(/^(?:min(?:ute)?)\s*(\d+)\s*[:\-–.)]\s*(.+)$/i);
  if (minute) return addMovements(minute[2]!, c, `minute ${minute[1]}`);

  // Rep scheme: standalone "21-15-9" (applies to what follows) or inline "21-15-9 Thrusters / Pull-ups".
  const sm = line.match(SCHEME);
  if (sm) {
    const scheme = readScheme(sm[1]!);
    if (scheme) {
      let rest = (sm[2] ?? '').trim();
      // "33/24-22/18-13/10 cal bike", "25-50-75 ft handstand walk": the scheme counts that unit, not reps.
      const unit = rest.match(/^(cals?|calories|m|meters?|metres?|ft|feet)\b\s*/i);
      const note = unit
        ? /^c/i.test(unit[1]!)
          ? 'scheme in calories'
          : /^f/i.test(unit[1]!)
            ? 'scheme in feet'
            : 'scheme in metres'
        : null;
      if (unit) rest = rest.slice(unit[0].length);
      c.scheme = scheme;
      if (rest) addMovements(rest, c, note, scheme);
      return;
    }
  }

  // "Cash out: 50 sit-ups", "Buy-in: 1 km run".
  const label = line.match(/^(cash[\s-]?out|buy[\s-]?in|finisher|then)\s*[:\-–]\s*(.+)$/i);
  if (label) return addMovements(label[2]!, c, label[1]!.toLowerCase().replace(/[\s-]+/, ' '));

  // Title: a first line with no numbers that isn't a movement ("Fran", "Tuesday conditioning").
  if (index === 0 && lines.length > 1 && !/\d/.test(line) && line.split(/\s+/).length <= 6) {
    const t = line
      .replace(/^["“'‘]|["”'’]$/g, '')
      .replace(/[\s:\-–—,]*\bfor\s+time\b/i, '')
      .replace(/[\s:\-–—,]+$/, '')
      .trim();
    if (!findLibraryExercise(c.ctx.lib, t)) {
      c.w.title = t;
      return;
    }
  }
  addMovements(line, c);
}

/* ---------- parts ---------- */

const PART =
  /^(?:(?:(part\s*[a-z0-9]+)|([a-e]))\s*[).:\-–]\s*|(warm[\s-]?up|cool[\s-]?down|strength|skill|metcon|conditioning|finisher|accessor(?:y|ies)|wod|engine)\s*(?:[:\-–]\s*|$)|[-–—]+\s*(into|then)\s*[-–—]+\s*$|(into|then)\s*:?\s*$)(.*)$/i;

export interface WorkoutPart {
  /** "Strength", "Part B", "A" … or null for a single-part paste. */
  label: string | null;
  text: string;
}

/** Splits a multi-part paste ("A) Back squat 5x5", "Metcon:", "-into-") into parts. One part when there are no headers. */
export function splitWorkoutParts(text: string): WorkoutPart[] {
  const parts: WorkoutPart[] = [];
  let cur: WorkoutPart = { label: null, text: '' };
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(PART);
    if (m) {
      if (cur.text.trim() || cur.label) parts.push(cur);
      const label = m[1] ?? m[2] ?? m[3] ?? null;
      cur = {
        label: label ? label.replace(/\s+/g, ' ').replace(/^./, (x) => x.toUpperCase()) : null,
        text: (m[6] ?? '').trim(),
      };
      continue;
    }
    cur.text = cur.text ? `${cur.text}\n${raw}` : raw;
  }
  if (cur.text.trim() || cur.label) parts.push(cur);
  const filled = parts.filter((p) => p.text.trim());
  return filled.length
    ? filled.map((p) => ({ ...p, text: p.text.trim() }))
    : [{ label: null, text: text.trim() }];
}

/* ---------- the whole paste ---------- */

/** A workout with every field empty. */
export function emptyWorkout(): ParsedWorkout {
  return {
    format: 'unknown',
    confidence: 0,
    timeCapSec: null,
    rounds: null,
    repScheme: null,
    intervalSec: null,
    workSec: null,
    restSec: null,
    stationCapSec: null,
    title: null,
    levels: [],
    levelUsed: null,
    segments: [],
    notes: [],
    warnings: [],
  };
}

/**
 * Pasted whiteboard text → ParsedWorkout. When several scaling levels are pasted, the first (or `opts.level`) is
 * read and the others are listed. Multi-part pastes are read as one list with a warning; use
 * `parseWorkoutParts` to read each part on its own.
 */
export function parseWorkout(text: string, opts: ParseOptions = {}): ParsedWorkout {
  const w = emptyWorkout();
  let body = text.replace(/\r\n?/g, '\n').trim();
  if (!body) {
    w.warnings.push('Nothing to read');
    return w;
  }

  const split = parseScalingLevels(body);
  if (split) {
    const want = opts.level;
    const idx =
      typeof want === 'number'
        ? want
        : typeof want === 'string'
          ? split.levels.findIndex((l) => l.name.toLowerCase() === want.toLowerCase())
          : 0;
    const level = split.levels[idx >= 0 && idx < split.levels.length ? idx : 0]!;
    w.levels = split.levels.map((l) => l.name);
    w.levelUsed = level.name;
    body = [split.preamble, level.text].filter(Boolean).join('\n');
    const others = split.levels.filter((l) => l !== level).map((l) => l.name);
    w.warnings.push(`Read the ${level.name} level; also found ${others.join(', ')}`);
  }

  const parts = splitWorkoutParts(body);
  if (parts.length > 1) {
    const names = parts.map((p, i) => p.label ?? `part ${i + 1}`);
    w.warnings.push(
      `This looks like ${parts.length} parts (${names.join(', ')}); read here as one list`,
    );
  }

  const detection = detectWorkoutFormat(body);
  w.format = detection.format;
  w.confidence = detection.confidence;

  const c: Collected = {
    w,
    ctx: { defaultUnit: opts.defaultLoadUnit ?? 'lb', assumed: [], lib: STARTER_LIBRARY },
    scheme: null,
    schemes: [],
    forTime: false,
  };
  const lines = parts.flatMap((p) => p.text.split('\n')).filter((l) => l.trim());
  lines.forEach((l, i) => lineOf(l, c, i, lines));

  // Shared rep scheme: when every movement that has one shares it.
  if (c.schemes.length) {
    const key = (s: number[]) => s.join('-');
    const first = c.schemes[0]!;
    if (c.schemes.every((s) => key(s) === key(first))) w.repScheme = first;
  }
  if (w.format === 'for_time' && w.rounds != null) w.format = 'rounds_for_time';
  if (w.format === 'unknown' && c.forTime) {
    w.format = w.rounds != null ? 'rounds_for_time' : 'for_time';
    w.confidence = 0.9;
  }
  if (w.format === 'unknown' && w.rounds != null && w.segments.some((s) => s.kind === 'work')) {
    w.format = 'rounds_for_time';
    w.confidence = 0.5;
    w.warnings.push('No “for time” written; read as rounds for time');
  }
  if (w.format === 'tabata') {
    if (w.rounds == null) {
      w.rounds = 8;
      w.warnings.push('No round count written; read as the usual 8 rounds of 20 s on, 10 s off');
    }
    w.workSec = w.workSec ?? 20;
    w.restSec = w.restSec ?? 10;
  }
  if (w.format === 'emom' && w.intervalSec == null) w.intervalSec = 60;
  if (w.format === 'amrap' && w.timeCapSec == null) w.warnings.push('No AMRAP length found');
  if (
    w.format === 'unknown' &&
    w.segments.some((s) => s.sets != null && (s.loadKg != null || s.percent1rm != null))
  ) {
    w.format = 'strength';
    w.confidence = 0.6;
  }
  if (c.ctx.assumed.length) {
    w.warnings.push(
      `Loads with no unit were read as ${c.ctx.defaultUnit}: ${[...new Set(c.ctx.assumed)].join(', ')}`,
    );
  }
  if (!w.segments.some((s) => s.kind === 'work')) w.warnings.push('Couldn’t find any movements');
  return w;
}

/** Each part of a multi-part paste, parsed on its own. */
export function parseWorkoutParts(
  text: string,
  opts: ParseOptions = {},
): { label: string | null; workout: ParsedWorkout }[] {
  return splitWorkoutParts(text).map((p) => ({
    label: p.label,
    workout: parseWorkout(p.text, opts),
  }));
}
