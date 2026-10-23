import type { WorkoutFormat } from './types';

/**
 * Workout format detection, ported from Station Zero's workoutFormatDetection.ts (docs/ports.md row 2).
 *
 * Matchers run in order and the first that fires wins. Each has a fixed confidence: these are the parser's own
 * certainty levels (how specific the keywords are), not statistics about workouts.
 *
 * Changes from the source:
 * - "rounds for time" is its own format instead of a keyword inside "for time".
 * - A bare rep scheme ("5-5-3-3-1") on a lift reads as strength, not "for time" (the source sent "Back squat
 *   5-5-5-3-3" to for-time because the rep-scheme check ran first).
 * - Interval sessions written as "8x400m" or "6 x 500m row" are recognised (the source needed the word "interval").
 * - The PFT/assessment matcher is not ported: it fired on the word "test", and a test is a use, not a format.
 */

export interface FormatDetection {
  format: WorkoutFormat;
  confidence: number;
  /** The keywords that matched, for "Read as AMRAP because of 'amrap 20'". */
  matched: string[];
}

const STRENGTH_MOVEMENTS = [
  'squat',
  'deadlift',
  'bench',
  'press',
  'clean',
  'snatch',
  'jerk',
  'row',
  'lunge',
  'thrust',
];
const STRENGTH_WORDS =
  /\b(heavy|1\s*rm|one\s*rep\s*max|build\s*to|working\s*sets?|pr\s*attempt|e1rm|rpe\s*\d|@\s*\d+\s*%|\d+\s*%)/;
const REP_SCHEME = /\b\d+\s*[-–]\s*\d+(?:\s*[-–]\s*\d+)+\b/;
const CONDITIONING =
  /pull-?\s?ups?|push-?\s?ups?|burpee|\brun\b|\bcal\b|calorie|box|double|wall\s*ball|toes|swing|jump|sit-?\s?ups?|muscle|hspu|air\s*squat/;

interface Matcher {
  format: WorkoutFormat;
  confidence: number;
  test: (t: string) => string[];
}

const MATCHERS: Matcher[] = [
  {
    format: 'hyrox',
    confidence: 0.95,
    test: (t) => {
      // Must say "hyrox": station names alone are just a conditioning piece (source rule, kept).
      if (!/hyrox/.test(t)) return [];
      const k = ['hyrox'];
      if (/8\s*stations/.test(t)) k.push('8 stations');
      for (const s of [
        'skierg',
        'ski erg',
        'sled push',
        'sled pull',
        'burpee broad jump',
        'row',
        'farmers carry',
        'sandbag lunges',
        'wall balls',
      ])
        if (t.includes(s)) k.push(s);
      return k;
    },
  },
  {
    format: 'amrap',
    confidence: 0.9,
    test: (t) => {
      const k: string[] = [];
      if (/\bamrap\b/.test(t)) k.push('amrap');
      if (/as many (rounds|reps)/.test(t)) k.push('as many rounds');
      return k;
    },
  },
  {
    format: 'emom',
    confidence: 0.85,
    test: (t) => {
      const k: string[] = [];
      if (/\bemom\b/.test(t)) k.push('emom');
      if (/\be\d+mom\b/.test(t)) k.push('e_mom');
      if (
        /every\s+(?:\d+(?::\d{2})?\s*)?(?:min(?:ute)?s?|sec(?:ond)?s?|s\b)/.test(t) ||
        /every\s+\d+:\d{2}/.test(t)
      )
        k.push('every minute');
      return k;
    },
  },
  {
    format: 'tabata',
    confidence: 0.85,
    test: (t) => {
      const k: string[] = [];
      if (/tabata/.test(t)) k.push('tabata');
      if (/\b20\s*\/\s*10\b/.test(t)) k.push('20/10');
      if (/20\s*s(?:ec)?\s*(?:on|work)/.test(t) && /10\s*s(?:ec)?\s*(?:off|rest)/.test(t))
        k.push('20s on 10s off');
      return k;
    },
  },
  {
    format: 'rounds_for_time',
    confidence: 0.9,
    test: (t) => {
      const k: string[] = [];
      if (/\d+\s*(?:rounds?|rnds?)\s*(?:for|4)\s*time/.test(t)) k.push('rounds for time');
      if (/\d*\s*\brft\b/.test(t)) k.push('rft');
      return k;
    },
  },
  {
    format: 'strength',
    confidence: 0.8,
    test: (t) => {
      const k: string[] = [];
      const lift = STRENGTH_MOVEMENTS.filter((m) => t.includes(m));
      const sxr = /\b\d+\s*[x×]\s*\d+\b(?!\s*(?:m\b|km|k\b|cal|min|s\b|sec))/.test(t);
      const words = STRENGTH_WORDS.test(t);
      // A rep scheme reads as strength only when every number is 10 or under and nothing in the text is a
      // conditioning movement: "5-5-3-3-1 back squat" is strength, "21-15-9 thrusters, pull-ups" is not.
      const schemeMatch = t.match(REP_SCHEME);
      const lowReps =
        !!schemeMatch && schemeMatch[0].split(/[-–]/).every((n) => Number(n.trim()) <= 10);
      const scheme = lowReps && !CONDITIONING.test(t);
      const timed = /for\s*time|\brft\b|\bamrap\b/.test(t);
      if (words) k.push('strength words');
      if (sxr) k.push('sets x reps');
      if (scheme && lift.length && !timed) k.push('rep scheme on a lift');
      // Needs a strength word, or sets x reps on a lift, or a rep scheme on a lift that isn't "for time":
      // "5x10 burpees" is conditioning (source rule, kept).
      const fires = words || ((sxr || k.includes('rep scheme on a lift')) && lift.length > 0);
      return fires ? [...k, ...lift] : [];
    },
  },
  {
    format: 'for_time',
    confidence: 0.9,
    test: (t) => {
      const k: string[] = [];
      if (/for\s*time/.test(t)) k.push('for time');
      if (/chipper/.test(t)) k.push('chipper');
      if (REP_SCHEME.test(t)) k.push('rep scheme');
      return k;
    },
  },
  {
    format: 'intervals',
    confidence: 0.8,
    test: (t) => {
      const k: string[] = [];
      if (/interval/.test(t)) k.push('interval');
      if (/repeats?\b/.test(t)) k.push('repeats');
      if (/sprints?\b/.test(t) && /\b\d+\s*[x×]/.test(t)) k.push('sprints');
      if (/\b\d+\s*[x×]\s*\d+\s*(?:s|secs?|seconds?|min|mins|minutes?)\b/.test(t))
        k.push('n x time');
      if (/work\s*:\s*rest/.test(t)) k.push('work:rest');
      if (/\d+\s*(?:s|sec)?\s*on\s*[/,]?\s*\d+\s*(?:s|sec)?\s*off/.test(t)) k.push('on/off');
      if (/\b\d+\s*[x×]\s*\d+(?:\.\d+)?\s*(?:m|km|k|mi)\b/.test(t)) k.push('n x distance');
      if (/\b\d+(?:\.\d+)?\s*(?:m|km|k|mi)\b[^\n]*?[x×]\s*\d+\b/.test(t)) k.push('distance x n');
      return k;
    },
  },
];

/** Guesses the format of pasted workout text. Unknown (confidence 0) when nothing matches. */
export function detectWorkoutFormat(text: string): FormatDetection {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return { format: 'unknown', confidence: 0, matched: [] };
  for (const m of MATCHERS) {
    const matched = m.test(t);
    if (matched.length) return { format: m.format, confidence: m.confidence, matched };
  }
  return { format: 'unknown', confidence: 0, matched: [] };
}
