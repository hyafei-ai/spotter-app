import { CYCLE_PHASE_LABEL } from '@spotter/core';
import type { BetweenSessions, PainSummary } from './inputs';

/*
 * Coach copy for "Between sessions" (coach job, docs/jtbd.md: remember, and prep a real conversation
 * in under 30 seconds). Plain facts from what the athlete shared, then what to ask. No scores, no
 * diagnosis, no churn or risk wording.
 */

const REGION: Record<PainSummary['region'], string> = {
  neck: 'neck',
  shoulder: 'shoulder',
  elbow: 'elbow',
  wrist: 'wrist',
  upper_back: 'upper back',
  lower_back: 'lower back',
  hip: 'hip',
  knee: 'knee',
  ankle: 'ankle',
  foot: 'foot',
  other: 'pain',
};
const where = (p: PainSummary) => [p.side === 'left' || p.side === 'right' ? p.side : '', REGION[p.region]].filter(Boolean).join(' ');
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export interface SummaryLine {
  key: 'reads' | 'fuel' | 'pain' | 'progress' | 'cycle';
  text: string;
  /** Worth raising: drawn in the accent colour. */
  flag: boolean;
}

export function summaryLines(b: BetweenSessions): SummaryLine[] {
  const out: SummaryLine[] = [];
  if (b.tired) {
    const { tiredDays, sharedDays } = b.tired;
    out.push({
      key: 'reads',
      flag: tiredDays >= 4,
      text:
        tiredDays >= 4
          ? `Running tired ${tiredDays} of the last 7 days`
          : tiredDays > 0
            ? `${tiredDays} easier-day read${tiredDays === 1 ? '' : 's'} this week, from ${sharedDays} shared`
            : `Steady this week: ${sharedDays} read${sharedDays === 1 ? '' : 's'} shared, none suggesting an easier day`,
    });
  }
  if (b.fuel) {
    out.push({
      key: 'fuel',
      flag: b.fuel !== 'none',
      text: b.fuel === 'talk_to_someone' ? 'Fuel check flagged: worth a conversation' : b.fuel === 'watch' ? 'Fuel check: one to watch' : 'Fuel check: nothing flagged',
    });
  }
  if (b.shares.pain) {
    const p = b.pain;
    out.push({
      key: 'pain',
      flag: !!p?.ongoing,
      text: p ? `${where(p).charAt(0).toUpperCase()}${where(p).slice(1)} pain on ${p.days} of the last 14 days` : 'No pain logged in the last 2 weeks',
    });
  }
  if (b.progress) {
    const { lastBest, weeksSinceBest, stalled } = b.progress;
    out.push({
      key: 'progress',
      flag: stalled,
      text: lastBest
        ? `Last best: ${lastBest.text}, ${shortDate(lastBest.date)}${stalled && weeksSinceBest != null ? ` (${weeksSinceBest} weeks ago)` : ''}`
        : weeksSinceBest != null
          ? `No new best in ${weeksSinceBest} weeks`
          : 'No new best yet',
    });
  }
  if (b.cyclePhase) out.push({ key: 'cycle', flag: false, text: `Cycle: ${CYCLE_PHASE_LABEL[b.cyclePhase].toLowerCase()} phase` });
  return out;
}

/** At most three questions, for the flagged lines only, in the order a coach would raise them. */
export function whatToAsk(b: BetweenSessions, firstName: string): string[] {
  const out: string[] = [];
  if (b.pain?.ongoing) out.push(`How’s the ${where(b.pain) || 'pain'} today, and is anything in sessions making it worse?`);
  if (b.fuel === 'talk_to_someone') out.push(`How’s eating around training going? If it’s been hard, a doctor or sports dietitian can help, and ${firstName} can bring the fuel check.`);
  else if (b.fuel === 'watch') out.push('Are you getting something to eat within an hour after training?');
  if (b.tired && b.tired.tiredDays >= 4) out.push('What’s been piling up this week: sleep, work, something else? Want an easier week?');
  if (b.progress?.stalled) out.push('Want to chase a different kind of best for a while, like reps at a weight you know?');
  return out.slice(0, 3);
}
