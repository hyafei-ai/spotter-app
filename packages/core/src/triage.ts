import type { TriageReason } from './schemas';

/** Coach "needs you" ordering (K-1). Higher = more urgent. */
export const TRIAGE_PRIORITY: Record<TriageReason, number> = {
  payment_failed: 90,
  parq_flag: 80,
  form_check_waiting: 70,
  check_in_submitted: 60,
  unread_message: 55,
  missed_sessions: 50,
  churn_risk: 40,
  new_client: 30,
  follow_up_due: 65,
  sleep_short_streak: 45,
  load_spike: 42,
  check_in_request: 75,
  pain_ongoing: 68,
};

export interface TriageItem {
  id: string;
  clientId: string;
  reason: TriageReason;
  /** Count for "Missed 2 sessions", or similar. */
  count?: number;
  /** Words for reasons that carry their own text: a follow-up ("Ask about knee") or an owner's
   *  check-in request ("Maya asked you to check in: no session in 12 days"). */
  detail?: string;
  since: string;
  snoozedUntil: string | null;
  handledAt: string | null;
  /** Check-in requests: the coach it's addressed to, and the intervention to complete. */
  coachId?: string | null;
  interventionId?: string;
}

const DAY = 86_400_000;

function ago(since: string, now: number): string {
  const days = Math.floor((now - Date.parse(since)) / DAY);
  if (days <= 0) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}

export function reasonText(item: TriageItem, now: number = Date.now()): string {
  switch (item.reason) {
    case 'payment_failed':
      return 'Payment failed';
    case 'parq_flag':
      return 'PAR-Q flag';
    case 'form_check_waiting':
      return `Form check waiting ${ago(item.since, now)}`;
    case 'check_in_submitted':
      return 'Check-in submitted';
    case 'unread_message':
      return item.count && item.count > 1 ? `${item.count} unread messages` : 'Unread message';
    case 'missed_sessions':
      return `Missed ${item.count ?? 1} session${(item.count ?? 1) === 1 ? '' : 's'}`;
    case 'churn_risk':
      // Coach-facing wording: about checking in, never churn (docs/jtbd.md).
      return 'Quiet for a week: worth a check-in';
    case 'new_client':
      return 'New client';
    case 'follow_up_due':
      return `Follow-up: ${item.detail ?? 'see your notes'}`;
    case 'sleep_short_streak':
      return item.detail ?? `Short sleep ${item.count ?? 3} nights`;
    case 'load_spike':
      return item.detail ?? 'Training load jumped this week';
    case 'check_in_request':
      return item.detail ?? 'Asked you to check in';
    case 'pain_ongoing':
      // e.g. "Pain logged 3 days running: knee"
      return item.detail ?? `Pain logged ${item.count ?? 3} days running`;
  }
}

export interface ClientTriage {
  clientId: string;
  items: TriageItem[];
  top: TriageItem;
  priority: number;
}

/** Groups open items by client and orders clients by their most urgent reason, oldest first on ties. */
export function buildTriage(items: TriageItem[], now: number = Date.now()): ClientTriage[] {
  const open = items.filter(
    (i) => !i.handledAt && (!i.snoozedUntil || Date.parse(i.snoozedUntil) <= now),
  );
  const byClient = new Map<string, TriageItem[]>();
  for (const i of open) byClient.set(i.clientId, [...(byClient.get(i.clientId) ?? []), i]);
  const rows: ClientTriage[] = [...byClient.entries()].map(([clientId, list]) => {
    const sorted = [...list].sort(
      (a, b) => TRIAGE_PRIORITY[b.reason] - TRIAGE_PRIORITY[a.reason] || Date.parse(a.since) - Date.parse(b.since),
    );
    const top = sorted[0]!;
    return { clientId, items: sorted, top, priority: TRIAGE_PRIORITY[top.reason] };
  });
  return rows.sort((a, b) => b.priority - a.priority || Date.parse(a.top.since) - Date.parse(b.top.since));
}
