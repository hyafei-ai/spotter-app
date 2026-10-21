import type { DailyRead } from './signals';

/**
 * Coach memory (docs/jtbd.md, coach job): "remember what's going on with each athlete" and
 * "prep for a conversation in under 30 seconds". Pure functions from data the app already has to
 * plain sentences. Deterministic: no model, no scores.
 */

export type MemoryKind =
  | 'sleep_short'
  | 'load_spike'
  | 'easy_reads'
  | 'lighter_session'
  | 'recovery_session'
  | 'pr'
  | 'missed_sessions'
  | 'weight_trend'
  | 'low_adherence'
  | 'said'
  | 'unanswered'
  | 'injury'
  | 'form_check_waiting'
  | 'note'
  | 'follow_up';

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  /** YYYY-MM-DD the item happened (the last day, for a streak). */
  date: string;
  text: string;
  /** Worth raising in the next conversation. */
  important: boolean;
}

export interface MemoryInput {
  today: string;
  /** Shared daily reads, any order. A null read means the athlete didn't share that day. */
  reads: { date: string; read: DailyRead | null }[];
  sessions: { date: string; title: string; variant: 'planned' | 'lighter' | 'recovery' }[];
  prs: { date: string; text: string }[];
  missed: { date: string; title: string }[];
  checkIns: {
    date: string;
    bodyweightKg: number | null;
    adherence: 'all' | 'most' | 'some' | 'little' | null;
  }[];
  messages: { at: string; fromClient: boolean; body: string }[];
  injuries: { date: string; text: string }[];
  formChecksWaiting: { date: string; exerciseName: string }[];
  notes: { at: string; text: string }[];
  followUps: { id: string; text: string; dueOn: string; doneAt: string | null }[];
}

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
/** Monday-based week number. Day 0 (1 Jan 1970) was a Thursday. */
const weekNum = (iso: string) => Math.floor((dayNum(iso) + 3) / 7);
const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const clip = (s: string, n = 90) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** Consecutive-day runs of dates, oldest first. */
function streaks(dates: string[]): string[][] {
  const out: string[][] = [];
  for (const d of [...new Set(dates)].sort()) {
    const last = out[out.length - 1];
    if (last && dayNum(d) - dayNum(last[last.length - 1]!) === 1) last.push(d);
    else out.push([d]);
  }
  return out;
}

function streakItems(
  dates: string[],
  kind: MemoryKind,
  text: (run: string[]) => string,
  important: (run: string[]) => boolean,
): MemoryItem[] {
  return streaks(dates).map((run) => ({
    id: `${kind}:${run[0]}`,
    kind,
    date: run[run.length - 1]!,
    text: text(run),
    important: important(run),
  }));
}

const span = (run: string[]) => `${shortDate(run[0]!)}–${shortDate(run[run.length - 1]!)}`;

/** Everything worth remembering about one client, newest first. Streaks collapse to one item. */
export function buildMemory(input: MemoryInput): MemoryItem[] {
  const items: MemoryItem[] = [];
  const reads = input.reads.filter(
    (r): r is { date: string; read: DailyRead } =>
      !!r.read && dayNum(r.date) <= dayNum(input.today),
  );
  const factorText = (kind: string) =>
    new Map(
      reads.flatMap((r) =>
        r.read.factors.filter((f) => f.kind === kind).map((f) => [r.date, f.text] as const),
      ),
    );

  // Body variance from shared reads (signals.ts), collapsed so a run of short nights is one line.
  const sleep = factorText('sleep_short');
  items.push(
    ...streakItems(
      [...sleep.keys()],
      'sleep_short',
      (run) =>
        run.length === 1
          ? sleep.get(run[0]!)!
          : `Short sleep reported ${run.length} days running (${span(run)})`,
      (run) => run.length >= 2,
    ),
  );
  const spike = factorText('load_spike');
  items.push(
    ...streakItems(
      [...spike.keys()],
      'load_spike',
      (run) => spike.get(run[run.length - 1]!)!,
      () => true,
    ),
  );
  items.push(
    ...streakItems(
      reads.filter((r) => r.read.tone === 'ease').map((r) => r.date),
      'easy_reads',
      (run) =>
        run.length === 1
          ? 'Their read said to take it easier'
          : `Their read said to take it easier ${run.length} days running`,
      (run) => run.length >= 3,
    ),
  );

  for (const s of input.sessions) {
    if (s.variant === 'lighter')
      items.push({
        id: `lighter:${s.date}`,
        kind: 'lighter_session',
        date: s.date,
        text: `Chose the lighter version of ${s.title}`,
        important: false,
      });
    if (s.variant === 'recovery')
      items.push({
        id: `recovery:${s.date}`,
        kind: 'recovery_session',
        date: s.date,
        text: `Did a recovery session instead of ${s.title}`,
        important: false,
      });
  }
  for (const p of input.prs)
    items.push({
      id: `pr:${p.date}:${p.text}`,
      kind: 'pr',
      date: p.date,
      text: `New best: ${p.text}`,
      important: false,
    });

  // Missed sessions: one line per week.
  const missedByWeek = new Map<number, { date: string; title: string }[]>();
  for (const m of input.missed)
    missedByWeek.set(weekNum(m.date), [...(missedByWeek.get(weekNum(m.date)) ?? []), m]);
  for (const list of missedByWeek.values()) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    // A missed session may have no title (e.g. counted from triage); then just say how many.
    const titles = [...new Set(sorted.map((m) => m.title).filter(Boolean))];
    const which = titles.length ? ` (${titles.join(', ')})` : '';
    items.push({
      id: `missed:${sorted[0]!.date}`,
      kind: 'missed_sessions',
      date: sorted[sorted.length - 1]!.date,
      text:
        sorted.length === 1
          ? `Missed ${titles[0] ?? 'a session'}`
          : `Missed ${sorted.length} sessions${which}`,
      important: sorted.length >= 2,
    });
  }

  // Check-ins: bodyweight trend over three weeks or more, and self-rated adherence when it's low.
  const weighed = input.checkIns
    .filter((c) => c.bodyweightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = weighed[weighed.length - 1];
  const earlier = latest
    ? [...weighed].reverse().find((c) => dayNum(latest.date) - dayNum(c.date) >= 21)
    : undefined;
  if (latest && earlier) {
    const diff = Math.round((latest.bodyweightKg! - earlier.bodyweightKg!) * 10) / 10;
    if (Math.abs(diff) >= 1) {
      const weeks = Math.round((dayNum(latest.date) - dayNum(earlier.date)) / 7);
      items.push({
        id: `weight:${latest.date}`,
        kind: 'weight_trend',
        date: latest.date,
        text: `Bodyweight ${diff < 0 ? 'down' : 'up'} ${Math.abs(diff)} kg over ${weeks} weeks (now ${latest.bodyweightKg} kg)`,
        important: false,
      });
    }
  }
  for (const c of input.checkIns) {
    if (c.adherence !== 'some' && c.adherence !== 'little') continue;
    items.push({
      id: `adherence:${c.date}`,
      kind: 'low_adherence',
      date: c.date,
      text:
        c.adherence === 'little'
          ? 'Said they managed little of the plan this week'
          : 'Said they managed only some of the plan this week',
      important: true,
    });
  }

  // Messages: the last thing they said, flagged when it's a question still waiting for a reply.
  const msgs = [...input.messages].sort((a, b) => a.at.localeCompare(b.at));
  const lastClient = [...msgs].reverse().find((m) => m.fromClient);
  const lastCoach = [...msgs].reverse().find((m) => !m.fromClient);
  if (lastClient) {
    const unanswered =
      (!lastCoach || lastCoach.at < lastClient.at) && lastClient.body.includes('?');
    items.push({
      id: `msg:${lastClient.at}`,
      kind: unanswered ? 'unanswered' : 'said',
      date: lastClient.at.slice(0, 10),
      text: unanswered
        ? `Asked “${clip(lastClient.body)}”, not answered yet`
        : `Said “${clip(lastClient.body)}”`,
      important: unanswered,
    });
  }

  for (const i of input.injuries)
    items.push({
      id: `injury:${i.text}`,
      kind: 'injury',
      date: i.date,
      text: `Injury: ${clip(i.text)}`,
      important: true,
    });
  for (const f of input.formChecksWaiting) {
    items.push({
      id: `fc:${f.date}:${f.exerciseName}`,
      kind: 'form_check_waiting',
      date: f.date,
      text: `Form check waiting: ${f.exerciseName}`,
      important: true,
    });
  }
  for (const n of input.notes) {
    if (n.text.trim())
      items.push({
        id: `note:${n.at}`,
        kind: 'note',
        date: n.at.slice(0, 10),
        text: `Your note: ${clip(n.text, 140)}`,
        important: false,
      });
  }
  for (const f of input.followUps) {
    if (f.doneAt) continue;
    items.push({
      id: `fu:${f.id}`,
      kind: 'follow_up',
      date: f.dueOn,
      text: `To ask (${shortDate(f.dueOn)}): ${clip(f.text)}`,
      important: dayNum(f.dueOn) <= dayNum(input.today) + 3,
    });
  }

  // Dedupe the same fact arriving twice, then newest first (important first within a day).
  const seen = new Set<string>();
  return items
    .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.important) - Number(a.important));
}

/** Memory items grouped by Monday-based week, newest week first, for the timeline. */
export function groupByWeek(
  items: MemoryItem[],
  today: string,
): { label: string; items: MemoryItem[] }[] {
  const now = weekNum(today);
  const groups = new Map<number, MemoryItem[]>();
  for (const i of items) groups.set(weekNum(i.date), [...(groups.get(weekNum(i.date)) ?? []), i]);
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([wk, list]) => ({
      label:
        wk > now
          ? 'Coming up'
          : wk === now
            ? 'This week'
            : wk === now - 1
              ? 'Last week'
              : `Week of ${shortDate(new Date((wk * 7 - 3) * DAY).toISOString())}`,
      items: list,
    }));
}

export interface PrepInput {
  today: string;
  week: { done: number; planned: number };
  memory: MemoryItem[];
  /** Shared daily reads; only the last seven days count. */
  reads: { date: string; read: DailyRead | null }[];
}

export const PREP_MAX_LINES = 5;

const STRAIN_WORDS: Partial<Record<string, string>> = {
  sleep_short: 'short sleep',
  load_spike: 'a jump in training load',
  soreness_high: 'soreness',
  energy_low: 'low energy',
  stress_high: 'stress',
  fuel_low: 'eating under target',
};

/**
 * The 30-second prep card: how the week went, how their body has been, the one thing to ask
 * about, the last thing they said, and something worth a mention. Never more than five lines.
 */
export function buildPrep(p: PrepInput): string[] {
  const lines: string[] = [];
  const inLastWeek = (date: string) =>
    dayNum(p.today) - dayNum(date) < 7 && dayNum(date) <= dayNum(p.today);

  const lighter = p.memory.filter(
    (m) => (m.kind === 'lighter_session' || m.kind === 'recovery_session') && inLastWeek(m.date),
  ).length;
  lines.push(
    p.week.planned > 0
      ? `${p.week.done} of ${p.week.planned} sessions done this week${lighter ? `, ${lighter} of them lighter` : ''}.`
      : 'No sessions planned this week.',
  );

  const shared = p.reads.filter((r) => inLastWeek(r.date)).flatMap((r) => (r.read ? [r.read] : []));
  if (shared.length === 0) {
    lines.push('No daily reads shared this week.');
  } else {
    const ease = shared.filter((r) => r.tone === 'ease').length;
    const watch = shared.filter((r) => r.tone === 'watch').length;
    const counts = new Map<string, number>();
    for (const r of shared)
      for (const f of r.factors) if (f.strain) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const mostly = main && STRAIN_WORDS[main] ? `, mostly ${STRAIN_WORDS[main]}` : '';
    const parts = [
      ease ? `${ease} easy-day read${ease === 1 ? '' : 's'}` : null,
      watch ? `${watch} to keep an eye on` : null,
    ].filter(Boolean);
    lines.push(
      parts.length === 0
        ? `Body: steady on all ${shared.length} shared reads.`
        : `Body: ${parts.join(' and ')} in ${shared.length} shared reads${mostly}.`,
    );
  }

  // The one thing to ask about: an open follow-up, then a question waiting, then injury, then form check.
  const followUp = p.memory
    .filter((m) => m.kind === 'follow_up' && m.important)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const unanswered = p.memory.find((m) => m.kind === 'unanswered');
  const injury = p.memory.find((m) => m.kind === 'injury');
  const formCheck = p.memory.find((m) => m.kind === 'form_check_waiting');
  const slipping = p.memory.find(
    (m) => (m.kind === 'missed_sessions' || m.kind === 'low_adherence') && inLastWeek(m.date),
  );
  if (followUp) lines.push(`Ask about: ${followUp.text.replace(/^To ask \([^)]*\): /, '')}`);
  else if (unanswered)
    lines.push(
      `Answer their question: ${unanswered.text.replace(/^Asked /, '').replace(/, not answered yet$/, '')}`,
    );
  else if (injury) lines.push(`Check on: ${injury.text.replace(/^Injury: /, '')}`);
  else if (formCheck)
    lines.push(`Reply to their ${formCheck.text.replace(/^Form check waiting: /, '')} form check.`);
  else if (slipping)
    lines.push(`Check in on: ${slipping.text.charAt(0).toLowerCase()}${slipping.text.slice(1)}.`);

  // The last thing they said (skipped when it's already the question above).
  const said = p.memory.find((m) => m.kind === 'said' || (m.kind === 'unanswered' && !!followUp));
  if (said) {
    const days = dayNum(p.today) - dayNum(said.date);
    const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
    lines.push(
      `Last said (${when}): ${said.text.replace(/^Said |^Asked /, '').replace(/, not answered yet$/, '')}`,
    );
  }

  const pr = p.memory.find((m) => m.kind === 'pr' && inLastWeek(m.date));
  if (pr) lines.push(`Worth a mention: ${pr.text.charAt(0).toLowerCase()}${pr.text.slice(1)}.`);

  return lines.slice(0, PREP_MAX_LINES);
}
