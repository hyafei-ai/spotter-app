/**
 * Scaling levels in a pasted workout (RX, Scaled, Level 2 …), ported from Station Zero's workoutTextParser.ts
 * (docs/ports.md row 2). Levels are hints: the parser reads one of them, and the block model decides later how
 * levels are stored.
 *
 * Changes from the source: third-party programming tier names are not in the known list (they are someone
 * else's product names), and a header with its content on the same line ("RX: 95/65") is read too.
 */

export type ScalingKind =
  | 'rx_plus'
  | 'rx'
  | 'scaled'
  | 'foundations'
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'elite'
  | 'masters'
  | 'teens'
  | 'level'
  | 'option';

export interface ScalingHint {
  kind: ScalingKind;
  /** "Level 2" gives 2, "Option B" gives 2. Null for named levels. */
  level: number | null;
}

export interface ScalingLevel extends ScalingHint {
  /** As written, without markers: "RX", "Scaled", "Level 2". */
  name: string;
  /** The level's own lines. */
  text: string;
}

export interface ScalingSplit {
  /** Lines before the first level (title, "For time:", a time cap) that apply to every level. */
  preamble: string;
  levels: ScalingLevel[];
}

const NAMED: [RegExp, ScalingKind][] = [
  [/^rx\s*\+$|^rx\s*plus$/, 'rx_plus'],
  [/^rx(?:'?d)?$|^prescribed$/, 'rx'],
  [/^scaled?$|^scaling$/, 'scaled'],
  [/^foundations?$/, 'foundations'],
  [/^beginners?$/, 'beginner'],
  [/^intermediate$/, 'intermediate'],
  [/^advanced$/, 'advanced'],
  [/^elite$|^competitors?$/, 'elite'],
  [/^masters?$/, 'masters'],
  [/^teens?$/, 'teens'],
];

/** The kind of a level name, or null when it doesn't look like a scaling level. */
export function scalingHint(name: string): ScalingHint | null {
  const n = name.toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n || n.length > 30) return null;
  const level = n.match(/^level\s*(\d)$/);
  if (level) return { kind: 'level', level: Number(level[1]) };
  const option = n.match(/^option\s*([a-d])$/);
  if (option) return { kind: 'option', level: option[1]!.charCodeAt(0) - 96 };
  // "Intermediate (Level 2)" or "Scaled (Level 1)": the named part wins and keeps the number.
  const numbered = n.match(/^(.+?)\s+level\s*(\d)$/);
  const base = numbered ? numbered[1]! : n;
  for (const [re, kind] of NAMED)
    if (re.test(base)) return { kind, level: numbered ? Number(numbered[2]) : null };
  return null;
}

const WRAPPED = [
  /^[—–-]{1,3}\s*(.+?)\s*[—–-]{1,3}$/, // — Scaled —
  /^\*\*(.+?)\*\*:?$/, // **RX**
  /^\[(.+?)\]:?$/, // [Level 2]
  /^={2,}\s*(.+?)\s*={2,}$/, // == RX ==
];

interface Header {
  name: string;
  hint: ScalingHint;
  /** Content written on the header line itself ("RX: 95/65"). */
  rest: string;
}

function header(line: string): Header | null {
  const l = line.trim();
  for (const re of WRAPPED) {
    const m = l.match(re);
    if (m) {
      const hint = scalingHint(m[1]!);
      if (hint) return { name: m[1]!.trim(), hint, rest: '' };
    }
  }
  const m = l.match(/^([A-Za-z][A-Za-z0-9'+ ]{0,24}?(?:\s*\([^)]{1,20}\))?)\s*(?::\s*(.*))?$/);
  if (!m) return null;
  const hint = scalingHint(m[1]!);
  if (!hint) return null;
  // Without a colon the whole line must be the name ("Scaled"); with one, anything may follow.
  return { name: m[1]!.trim(), hint, rest: (m[2] ?? '').trim() };
}

/** Splits a paste into scaling levels, or null when there are fewer than two. */
export function parseScalingLevels(text: string): ScalingSplit | null {
  const lines = text.split(/\r?\n/);
  const starts: { at: number; h: Header }[] = [];
  lines.forEach((line, at) => {
    const h = header(line);
    if (h) starts.push({ at, h });
  });
  if (starts.length < 2) return null;
  const levels: ScalingLevel[] = starts
    .map(({ at, h }, i) => {
      const end = i + 1 < starts.length ? starts[i + 1]!.at : lines.length;
      const body = [h.rest, ...lines.slice(at + 1, end)].map((l) => l.trim()).filter(Boolean);
      return {
        name: h.name.replace(/:$/, ''),
        kind: h.hint.kind,
        level: h.hint.level,
        text: body.join('\n'),
      };
    })
    .filter((l) => l.text.length > 0);
  if (levels.length < 2) return null;
  const preamble = lines
    .slice(0, starts[0]!.at)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  return { preamble, levels };
}
