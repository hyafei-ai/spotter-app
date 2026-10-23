import { useMemo } from 'react';
import {
  HEALTH_WIN_KINDS,
  actToday,
  buildTriage,
  checkInMessage,
  viewerSeesHealth,
  winMessage,
  type ActItem,
  type AtRiskMember,
  type MastersWin,
  type TriageReason,
} from '@spotter/core';
import { isSampleClient, type DemoClient } from '@spotter/core/demo';
import { useCoach } from '../store';
import { useNeedsAttention, useViewerLens } from '../atrisk/AtRiskList';
import { usePhysiologyMap } from '../atrisk/inputs';
import { whatToAskAboutTraining } from '../atrisk/summary';
import { triageForViewer } from '../retention/store';
import { clientDays, clientWins, useLighterWords, usePlannedToday, useRoster } from './data';
import { todayKey, useTodayDone } from './store';

/*
 * The coach's Today (docs/ux/coach-experience.md): three groups, most important first.
 * 1. Act today: today's planned session meets a strain signal (coachToday.ts actToday).
 * 2. Check in: the Check in list (athleteDropoutRisk), minus anyone already in Act today.
 * 3. Celebrate: the top win to mention per client (masters.ts winsToMention).
 * Health-derived lines only for clients whose health this viewer sees (viewerSeesHealth).
 */

export type TodayAction =
  | { type: 'easier'; item: ActItem }
  | { type: 'message'; draft: string; checkIn?: { reason: string } }
  | { type: 'win'; draft: string; win: MastersWin }
  | { type: 'open' };

export interface TodayRow {
  key: string;
  client: DemoClient;
  first: string;
  line: string;
  /** The one button. */
  label: string;
  action: TodayAction;
  sample: boolean;
}

export interface TodayGroups {
  act: TodayRow[];
  checkIn: TodayRow[];
  celebrate: TodayRow[];
  done: { key: string; client: DemoClient; what: string }[];
  /** Waiting-on-you counts (Clients → Needs you), in words: "2 messages", "1 form check". */
  waiting: string[];
  checkInStatus: 'loading' | 'ready' | 'error';
  retry: () => void;
  firstRun: boolean;
  clientCount: number;
}

/** Waiting-on-you reasons: to-dos the coach ticks off. Body and engagement reasons live in Act today and Check in. */
export const WAITING_REASONS: TriageReason[] = [
  'payment_failed',
  'parq_flag',
  'form_check_waiting',
  'check_in_submitted',
  'unread_message',
  'new_client',
  'follow_up_due',
  'check_in_request',
];
export const isWaiting = (r: TriageReason) => WAITING_REASONS.includes(r);

const WAITING_WORDS: Partial<Record<TriageReason, [string, string]>> = {
  unread_message: ['message', 'messages'],
  form_check_waiting: ['form check', 'form checks'],
  payment_failed: ['payment', 'payments'],
  parq_flag: ['PAR-Q flag', 'PAR-Q flags'],
  check_in_submitted: ['weekly check-in', 'weekly check-ins'],
  new_client: ['new client', 'new clients'],
  follow_up_due: ['follow-up', 'follow-ups'],
  check_in_request: ['check-in request', 'check-in requests'],
};

/** The question to ask for a client on the Check in list, from their top reasons. */
export function checkInQuestion(m: AtRiskMember): string | null {
  const physio = m.risk.factors.filter((f) => f.kind === 'physiology').map((f) => f.text);
  const out: string[] = [];
  for (const r of physio) {
    if (r.startsWith('Running tired'))
      out.push(
        'What’s been piling up this week: sleep, work, something else? Want an easier week?',
      );
    else if (r.startsWith('Fuel check')) out.push('How’s eating around training going lately?');
    else if (/ pain /.test(r) || r.startsWith('Pain'))
      out.push('How’s the pain today, and is anything in sessions making it worse?');
    else if (r.startsWith('No new best'))
      out.push(
        'Want to chase a different kind of best for a while, like reps at a weight you know?',
      );
  }
  out.push(
    ...whatToAskAboutTraining(
      m.risk.factors.filter((f) => f.kind === 'engagement').map((f) => f.text),
    ),
  );
  return out[0] ?? null;
}

const first = (c: DemoClient) => c.name.split(' ')[0]!;

export function useToday(): TodayGroups {
  const { clients, firstRun } = useRoster();
  const ids = useMemo(() => clients.map((c) => c.id), [clients]);
  const realIds = useMemo(() => ids.filter((id) => !isSampleClient(id)), [ids]);
  const lens = useViewerLens();
  const { status, roster, retry } = useNeedsAttention(realIds);
  const { physio } = usePhysiologyMap(realIds);
  const planned = usePlannedToday(ids);
  const lighter = useLighterWords();
  const done = useTodayDone((s) => s.done);
  const triage = useCoach((s) => s.triage);

  return useMemo(() => {
    const byId = new Map(clients.map((c) => [c.id, c]));
    const sees = (id: string) =>
      isSampleClient(id) ||
      viewerSeesHealth(lens.viewerId, { coachId: lens.coachOf[id] ?? null }, { solo: lens.solo });

    // 1. Act today
    const acts: { row: TodayRow; weight: number }[] = [];
    for (const c of clients) {
      const health = sees(c.id);
      const days = health ? clientDays(c.id, 1) : [];
      const p = physio[c.id];
      const item = actToday({
        firstName: first(c),
        day: days[days.length - 1] ?? null,
        planned: planned[c.id] ?? null,
        pain: health && p?.painOngoing ? (p.pain ?? null) : null,
        fuelLevel: health ? (p?.fuelLevel ?? null) : null,
        lighterWords: lighter(c.id),
      });
      if (!item) continue;
      acts.push({
        weight: item.weight,
        row: {
          key: todayKey.act(c.id),
          client: c,
          first: first(c),
          line: item.line,
          label:
            item.action === 'offer_easier' ? 'Offer the easier version' : `Message ${first(c)}`,
          action:
            item.action === 'offer_easier'
              ? { type: 'easier', item }
              : { type: 'message', draft: item.draft },
          sample: isSampleClient(c.id),
        },
      });
    }
    const act = acts.sort((a, b) => b.weight - a.weight).map((a) => a.row);
    const acting = new Set(act.map((r) => r.client.id));

    // 2. Check in (already ordered most urgent first)
    const checkIn: TodayRow[] = roster
      .filter((m) => byId.has(m.clientId) && !acting.has(m.clientId))
      .map((m) => {
        const c = byId.get(m.clientId)!;
        const health = sees(c.id);
        // A failed payment is already under "Also waiting on you": don't say it twice.
        const reasons = m.risk.reasons.filter((r) => !r.startsWith('Payment failed'));
        const forQuestion = health
          ? m
          : {
              ...m,
              risk: { ...m.risk, factors: m.risk.factors.filter((f) => f.kind === 'engagement') },
            };
        // Teams: a head coach doesn't see an assistant's client's health, so the action opens the client page,
        // where "Ask {coach} to check in" lives.
        const theirCoach = !health
          ? lens.coaches.find((x) => x.id === lens.coachOf[c.id])
          : undefined;
        return {
          key: todayKey.checkIn(c.id),
          client: c,
          first: first(c),
          line: [
            ...(reasons.length ? reasons : m.risk.reasons).slice(0, 2),
            ...(theirCoach ? [`${theirCoach.name.split(' ')[0]} coaches them`] : []),
          ].join(' · '),
          label: theirCoach ? `Open ${first(c)}` : `Message ${first(c)}`,
          action: theirCoach
            ? { type: 'open' as const }
            : {
                type: 'message' as const,
                draft: checkInMessage(first(c), checkInQuestion(forQuestion)),
                checkIn: { reason: m.risk.reasons[0] ?? 'Worth a check-in this week' },
              },
          sample: false,
        } satisfies TodayRow;
      });

    // 3. Celebrate: one win per client, the most meaningful first.
    const wins: { row: TodayRow; weight: number }[] = [];
    for (const c of clients) {
      const health = sees(c.id);
      const w = clientWins(c.id).find((x) => health || !HEALTH_WIN_KINDS.includes(x.kind));
      if (!w) continue;
      wins.push({
        weight: w.weight,
        row: {
          key: todayKey.win(c.id),
          client: c,
          first: first(c),
          line: w.coachText,
          label: `Send to ${first(c)}`,
          action: { type: 'win', draft: winMessage(first(c), w), win: w },
          sample: isSampleClient(c.id),
        },
      });
    }
    const celebrate = wins.sort((a, b) => b.weight - a.weight).map((w) => w.row);

    const all = [...act, ...checkIn, ...celebrate];
    const doneRows = all
      .filter((r) => done[r.key])
      .map((r) => ({ key: r.key, client: r.client, what: done[r.key]! }));
    const open = (rows: TodayRow[]) => rows.filter((r) => !done[r.key]);

    // Waiting on you: open to-dos only, for the clients this viewer sees.
    const counts = new Map<TriageReason, number>();
    if (!firstRun) {
      for (const row of buildTriage(
        triageForViewer(triage, lens.viewerId).filter(
          (t) => byId.has(t.clientId) && isWaiting(t.reason),
        ),
      )) {
        for (const t of row.items)
          if (isWaiting(t.reason))
            counts.set(
              t.reason,
              (counts.get(t.reason) ?? 0) + (t.reason === 'unread_message' ? (t.count ?? 1) : 1),
            );
      }
    }
    const waiting = WAITING_REASONS.filter((r) => counts.get(r)).map((r) => {
      const n = counts.get(r)!;
      const [one, many] = WAITING_WORDS[r]!;
      return `${n} ${n === 1 ? one : many}`;
    });

    return {
      act: open(act),
      checkIn: open(checkIn),
      celebrate: open(celebrate),
      done: doneRows,
      waiting,
      checkInStatus: realIds.length === 0 ? 'ready' : status,
      retry,
      firstRun,
      clientCount: clients.length,
    };
  }, [
    clients,
    roster,
    physio,
    planned,
    lighter,
    done,
    triage,
    lens,
    status,
    retry,
    firstRun,
    realIds.length,
  ]);
}
