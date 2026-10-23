'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  COACH_LEVEL_TEXT,
  INTERVENTION_DONE_LABEL,
  KEPT_AFTER_DAYS,
  KEPT_CAVEAT,
  OWNER_NEUTRAL_REASON,
  RISK_POINTS_TABLE,
  SPOTTER_PRICE_MONTHLY_CENTS,
  approxMoney,
  checkInCoach,
  checkInRequestText,
  keptSummary,
  monthlyValueText,
  yearlyValueCents,
  type AtRiskMember,
  type Intervention,
  type KeptRow,
  type MrrTrend,
} from '@spotter/core';
import { loadDemoRetention, loadLiveRetention, saveDemoInterventions, type RetentionData } from '../../../src/retention';
import { demoCoaches } from '../../../src/platformDemo';

/*
 * "Keeping clients": the coach's business view (docs/jtbd.md). Income at risk this month, the last 12
 * weeks, who could use a check-in with their reasons, and who stayed after one. Replaces the separate
 * "Members to talk to" page (/dashboard/members now redirects here).
 * - Reasons are full for the coach's own clients. Teams only: for a client an assistant coaches, what
 *   they shared stays with that coach, shown as one neutral line, with "Ask {coach} to check in".
 * - Check-ins are logged on the client's page in the coach app.
 * MOCK DATA in the demo, recomputed on every load (src/retention.ts).
 */

const DAY = 86_400_000;
const first = (name: string) => name.split(' ')[0]!;
const weekLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function RetentionPage() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData((await loadLiveRetention()) ?? loadDemoRetention());
    } catch {
      setError('Couldn’t load your numbers. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    // Recomputed from current data on every visit ("live"), after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const coaches = data?.source === 'live' ? [] : demoCoaches.filter((c) => c.status === 'active');
  const solo = coaches.length <= 1;
  const kept = useMemo(() => (data ? keptSummary(data.interventions, data.status, data.year, data.today) : null), [data]);
  const openByClient = useMemo(() => new Map((data?.interventions ?? []).filter((i) => !i.doneOn).map((i) => [i.clientId, i])), [data]);
  const n = data?.atRisk.reduce((s, r) => s + r.count, 0) ?? 0;

  const ask = (m: AtRiskMember, coach: { id: string; name: string }, reason: string, note: string | null) => {
    if (!data) return;
    const existing = openByClient.get(m.clientId);
    const row: Intervention = {
      id: existing?.id ?? `demo-${data.interventions.length + 1}-${m.clientId.slice(-6)}`,
      clientId: m.clientId,
      clientName: m.name,
      coachId: coach.id,
      coachName: coach.name,
      reason,
      note,
      requestedOn: data.today,
      doneOn: null,
      action: null,
      actionNote: null,
      monthlyCents: m.monthlyCents,
    };
    const interventions = [...data.interventions.filter((i) => i.id !== row.id), row];
    saveDemoInterventions(interventions);
    setData({ ...data, interventions });
    setNotice(`Asked ${first(coach.name)} to check in with ${first(m.name)}.`);
  };

  return (
    <div style={{ display: 'grid', gap: 32, minWidth: 0 }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <h2>Keeping clients</h2>
        <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
          Monthly income from clients whose training, app use or what they shared with you says a check-in would help, and who stayed after one.
        </p>
        {data?.source !== 'live' ? (
          <p className="label" style={{ margin: 0 }}>
            Sample clients (MOCK). This week is worked out from them on load; earlier weeks are sample figures.
          </p>
        ) : null}
      </header>

      {notice ? (
        <p role="status" style={{ margin: 0, background: 'var(--surface)', borderLeft: '3px solid var(--success)', padding: '8px 12px' }}>
          {notice}
        </p>
      ) : null}

      {error ? (
        <p role="alert" style={{ margin: 0 }}>
          {error}{' '}
          <button className="btn btn-secondary" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : !data || !kept ? (
        <p className="muted" aria-busy="true">
          Working out this week…
        </p>
      ) : (
        <>
          <section aria-labelledby="mrr" style={{ display: 'grid', gap: 12 }}>
            <h3 id="mrr" className="label">
              At risk this month
            </h3>
            {data.atRisk.length === 0 ? (
              <p style={{ margin: 0 }}>Nothing at risk this week. Everyone’s training and checking in as usual.</p>
            ) : (
              data.atRisk.map((r) => (
                <div key={r.currency} style={{ display: 'grid', gap: 4 }}>
                  <p className="figure" style={{ margin: 0 }}>
                    {approxMoney(r.totalCents, r.currency)} <span style={{ fontSize: 20, fontWeight: 600 }}>a month</span>
                  </p>
                  <p className="muted" style={{ margin: 0 }}>
                    {r.count} client{r.count === 1 ? '' : 's'} · needs a check-in soon {approxMoney(r.highCents, r.currency)} ({r.highCount}) · worth watching{' '}
                    {approxMoney(r.mediumCents, r.currency)} ({r.mediumCount})
                    {data.atRisk.length > 1 ? ` · ${r.currency.toUpperCase()}` : ''}
                  </p>
                </div>
              ))
            )}
            {data.atRisk.length > 1 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Each currency is shown on its own; amounts are never added across currencies.
              </p>
            ) : null}
            {n ? (
              <p style={{ margin: 0 }}>
                <a className="btn btn-primary" href="#clients">
                  See who needs a check-in ({n})
                </a>
              </p>
            ) : null}
          </section>

          <section id="clients" aria-labelledby="who" style={{ display: 'grid', gap: 8, scrollMarginTop: 72 }}>
            <h3 id="who" className="label">
              Who could use a check-in
            </h3>
            {data.clients.length === 0 ? (
              <p style={{ margin: 0 }}>Nobody needs a check-in right now.</p>
            ) : (
              <div>
                {data.clients.map((m) => (
                  <ClientRow
                    key={m.clientId}
                    m={m}
                    viewerId={data.viewerId}
                    coaches={solo ? [] : coaches}
                    asked={openByClient.get(m.clientId) ?? null}
                    ownerFirst={first(demoCoaches.find((c) => c.role === 'owner')?.name ?? 'Your head coach')}
                    onAsk={ask}
                  />
                ))}
              </div>
            )}
            <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: 620 }}>
              Log a check-in from the client’s page in the coach app (Clients → Check in). Plan values are monthly.
            </p>
          </section>

          {data.trend.map((t) => (
            <Trend key={t.currency} trend={t} />
          ))}

          <Kept data={data} kept={kept} />

          <section aria-labelledby="how" style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            <h3 id="how" className="label">
              How it’s worked out
            </h3>
            <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
              Each signal adds points. 5 or more is “{COACH_LEVEL_TEXT.high}”, 3 to 4 “{COACH_LEVEL_TEXT.medium}”. Clients show up after two weeks with
              you; paused and cancelled clients don’t count. Income is their plan per month (weekly × 52 ÷ 12, packages spread over their weeks, session
              packs 0).
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Signal</th>
                    <th scope="col" style={{ whiteSpace: 'nowrap' }}>
                      Points
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RISK_POINTS_TABLE.map((r) => (
                    <tr key={r.signal}>
                      <td>{r.signal}</td>
                      <td>{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ margin: 0, maxWidth: 620, fontSize: 13 }}>
              Signals marked “shared” count only when the client shares them with you. Health details (sleep, cycle, fuelling, pain) stay between the client
              and their coach.
              {solo ? '' : ` For clients an assistant coaches, you see “${OWNER_NEUTRAL_REASON}” instead.`}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function ClientRow({
  m,
  viewerId,
  coaches,
  asked,
  ownerFirst,
  onAsk,
}: {
  m: AtRiskMember;
  viewerId: string;
  coaches: { id: string; name: string; status?: string }[];
  asked: Intervention | null;
  ownerFirst: string;
  onAsk: (m: AtRiskMember, coach: { id: string; name: string }, reason: string, note: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  // Teams only: someone else coaches this client. Solo coaches never see this.
  const coach = checkInCoach(viewerId, m, coaches);
  const reason = m.risk.factors.find((f) => f.kind === 'engagement')?.text ?? 'Worth a check-in this week';
  return (
    <div style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="row" style={{ borderBottom: 0, justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'grid', gap: 2, flex: '1 1 auto', minWidth: 0 }}>
          <strong>{m.name}</strong>
          <span style={{ color: 'var(--brand)' }}>{COACH_LEVEL_TEXT[m.risk.level]}</span>
          <span className="muted">{m.risk.reasons.join(' · ')}</span>
          {coach ? <span className="muted">Coached by {first(coach.name)}</span> : null}
          {asked ? <span className="muted">Asked {first(asked.coachName)} on {shortDate(asked.requestedOn)} · not checked in yet</span> : null}
          {coach && !(asked && asked.coachId === coach.id) ? (
            <span style={{ marginTop: 8 }}>
              <button className="btn btn-secondary" aria-expanded={open} aria-controls={`ask-${m.clientId}`} onClick={() => setOpen(!open)}>
                Ask {first(coach.name)} to check in
              </button>
            </span>
          ) : null}
        </div>
        <span className="muted" style={{ flex: 'none', whiteSpace: 'nowrap' }}>
          {m.monthlyCents > 0 && m.currency ? monthlyValueText(m.monthlyCents, m.currency) : 'Pay as you go'}
        </span>
      </div>
      {open && coach ? (
        <div id={`ask-${m.clientId}`} style={{ display: 'grid', gap: 12, maxWidth: 480, padding: '0 0 16px' }}>
          <label className="field">
            <span className="label">Note for {first(coach.name)} (optional)</span>
            <textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
          </label>
          <span className="muted" style={{ fontSize: 13 }}>
            {first(coach.name)} will see: “{checkInRequestText(ownerFirst, reason)}”
          </span>
          <button
            className="btn btn-primary"
            onClick={() => {
              onAsk(m, coach, reason, note.trim() || null);
              setOpen(false);
              setNote('');
            }}
          >
            Ask {first(coach.name)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Kept after a check-in: the headline per currency, the caveat, and each check-in this year. */
function Kept({ data, kept }: { data: RetentionData; kept: ReturnType<typeof keptSummary> }) {
  const rows = [...kept.kept, ...kept.pending, ...kept.waiting, ...kept.left];
  const ownerName = demoCoaches.find((c) => c.role === 'owner')?.name;
  const who = (r: KeptRow) => (r.coachId === data.viewerId || r.coachName === ownerName ? 'You' : first(r.coachName));
  const how = (r: KeptRow) => (r.action ? INTERVENTION_DONE_LABEL[r.action] : 'checked in');
  const line = (r: KeptRow) => {
    const by = `${who(r)} ${how(r)} on ${shortDate(r.doneOn ?? r.requestedOn)}`;
    if (r.outcome === 'kept') return `${by} · still with you`;
    if (r.outcome === 'left') return `${by} · left`;
    if (r.outcome === 'pending') return `${by} · you’ll know on ${shortDate(new Date(Date.parse(`${r.doneOn}T12:00:00Z`) + KEPT_AFTER_DAYS * DAY).toISOString())}`;
    return `Asked ${first(r.coachName)} on ${shortDate(r.requestedOn)} · not checked in yet`;
  };
  const tag = { kept: 'Kept', left: 'Left', pending: 'Pending', waiting: 'Asked' } as const;
  return (
    <section aria-labelledby="kept" style={{ display: 'grid', gap: 8 }}>
      <h3 id="kept" className="label">
        Kept after a check-in, {data.year}
      </h3>
      {data.kept.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No one yet this year. Clients count once they’re still with you 60 days after a check-in.
        </p>
      ) : (
        data.kept.map((k) => (
          <p key={k.currency} style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600 }}>
            {approxMoney(k.monthlyCents, k.currency)} a month · {k.count} client{k.count === 1 ? '' : 's'}
            <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>
              {' '}
              ({approxMoney(yearlyValueCents(k.monthlyCents), k.currency)} a year)
            </span>
          </p>
        ))
      )}
      <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
        {KEPT_CAVEAT}
      </p>
      {SPOTTER_PRICE_MONTHLY_CENTS != null && data.kept.length ? (
        <p className="muted" style={{ margin: 0 }}>
          Spotter costs {approxMoney(yearlyValueCents(SPOTTER_PRICE_MONTHLY_CENTS), data.currency)} a year.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="muted">When you check in with someone, you’ll see here whether they stayed.</p>
      ) : (
        <div>
          {rows.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <strong>{r.clientName}</strong>
                <div className="muted">{line(r)}</div>
              </div>
              <span
                className="label"
                style={{
                  color: r.outcome === 'kept' ? 'var(--success)' : r.outcome === 'waiting' ? 'var(--brand)' : 'var(--ink2)',
                  border: '1px solid currentColor',
                  borderRadius: 999,
                  padding: '2px 10px',
                  flex: 'none',
                }}
              >
                {tag[r.outcome]}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Weekly bars with a text summary and the same numbers as a table. */
function Trend({ trend }: { trend: MrrTrend }) {
  const W = 360;
  const H = 96;
  const gap = 4;
  const n = trend.points.length;
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, ...trend.points.map((p) => p.totalCents ?? 0));
  const known = trend.points.filter((p) => p.totalCents != null);
  const last = trend.points[n - 1]!;
  const money = (c: number | null) => (c == null ? 'No data' : approxMoney(c, trend.currency));
  const summary =
    trend.changeCents == null
      ? 'Not enough weeks yet to show a change.'
      : trend.changeCents === 0
        ? `Level with the week of ${weekLabel(known[0]!.weekStart)}.`
        : `${trend.changeCents > 0 ? 'Up' : 'Down'} ${approxMoney(Math.abs(trend.changeCents), trend.currency)} since the week of ${weekLabel(known[0]!.weekStart)}.`;
  const id = `trend-${trend.currency}`;
  return (
    <section aria-labelledby={id} style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <h3 id={id} className="label">
        Last 12 weeks{trend.currency !== 'usd' ? ` (${trend.currency.toUpperCase()})` : ''}
      </h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 480, height: 'auto', display: 'block' }} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <title id={`${id}-t`}>Income at risk by week</title>
        <desc id={`${id}-d`}>
          This week {money(last.totalCents)}. {summary}
        </desc>
        {trend.points.map((p, i) => {
          const h = p.totalCents == null ? 2 : Math.max(2, (p.totalCents / max) * (H - 4));
          return (
            <rect
              key={p.weekStart}
              x={i * (bw + gap)}
              y={H - h}
              width={bw}
              height={h}
              rx={2}
              fill={p.totalCents == null ? 'var(--line)' : i === n - 1 ? 'var(--brand)' : 'var(--ink2)'}
            >
              <title>{`Week of ${weekLabel(p.weekStart)}: ${money(p.totalCents)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 480, fontSize: 13 }}>
        <span>{weekLabel(trend.points[0]!.weekStart)}</span>
        <span>This week</span>
      </div>
      <p style={{ margin: 0 }}>{summary}</p>
      <details>
        <summary>Show as a table</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Week of</th>
                <th scope="col">At risk</th>
                <th scope="col">Soon</th>
                <th scope="col">Watching</th>
                <th scope="col">Clients</th>
              </tr>
            </thead>
            <tbody>
              {trend.points.map((p) => (
                <tr key={p.weekStart}>
                  <td>{weekLabel(p.weekStart)}</td>
                  <td>{money(p.totalCents)}</td>
                  <td>{money(p.highCents)}</td>
                  <td>{money(p.mediumCents)}</td>
                  <td>{p.members ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
