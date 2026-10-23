'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { KEPT_CAVEAT, OWNER_NEUTRAL_REASON, RISK_POINTS_TABLE, approxMoney, type MrrTrend } from '@spotter/core';
import { loadDemoRetention, loadLiveRetention, type RetentionData } from '../../../src/retention';

/*
 * Owner job (docs/jtbd.md): live MRR at risk, the last 12 weeks, MRR kept after a check-in, and who to
 * talk to. Engagement and money only. Anything an athlete shared with their coach about their body
 * shows here as one neutral line, "Their coach has flagged something worth a check-in", with no detail.
 * MOCK DATA in the demo, recomputed on every load (src/retention.ts).
 */

const weekLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const LEVEL_TEXT = { high: 'Talk to this week', medium: 'Worth a check-in', low: '' } as const;

export default function RetentionPage() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData((await loadLiveRetention()) ?? loadDemoRetention());
    } catch {
      setError('Couldn’t load retention. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    // Recomputed from current data on every visit ("live"), after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <h2>Retention</h2>
        <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
          Monthly revenue from members whose training or app use has dropped off, or whose coach has flagged something worth a check-in.
        </p>
        {data?.source !== 'live' ? (
          <p className="label" style={{ margin: 0 }}>
            Sample members (MOCK). This week is worked out from them on load; earlier weeks are sample figures.
          </p>
        ) : null}
      </header>

      {error ? (
        <p role="alert" style={{ margin: 0 }}>
          {error}{' '}
          <button className="btn btn-secondary" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : !data ? (
        <p className="muted" aria-busy="true">
          Working out this week…
        </p>
      ) : (
        <>
          <section aria-labelledby="mrr" style={{ display: 'grid', gap: 12 }}>
            <h3 id="mrr" className="label">
              MRR at risk
            </h3>
            {data.atRisk.length === 0 ? (
              <p style={{ margin: 0 }}>Nothing at risk this week.</p>
            ) : (
              data.atRisk.map((r) => (
                <div key={r.currency} style={{ display: 'grid', gap: 4 }}>
                  <p className="figure" style={{ margin: 0 }}>
                    {approxMoney(r.totalCents, r.currency)} <span style={{ fontSize: 20, fontWeight: 600 }}>a month</span>
                  </p>
                  <p className="muted" style={{ margin: 0 }}>
                    {r.count} member{r.count === 1 ? '' : 's'} · high {approxMoney(r.highCents, r.currency)} ({r.highCount}) · medium{' '}
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
          </section>

          {data.trend.map((t) => (
            <Trend key={t.currency} trend={t} />
          ))}

          <section aria-labelledby="kept" style={{ display: 'grid', gap: 8 }}>
            <h3 id="kept" className="label">
              Kept after a check-in, {data.year}
            </h3>
            {data.kept.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No one yet this year. Members count once they’re still with you 60 days after a coach checked in.
              </p>
            ) : (
              data.kept.map((k) => (
                <p key={k.currency} style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600 }}>
                  {approxMoney(k.monthlyCents, k.currency)} a month · {k.count} member{k.count === 1 ? '' : 's'}
                </p>
              ))
            )}
            <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
              {KEPT_CAVEAT}
            </p>
          </section>

          <section aria-labelledby="who" style={{ display: 'grid', gap: 8 }}>
            <h3 id="who" className="label">
              Members to talk to
            </h3>
            {data.members.length === 0 ? (
              <p style={{ margin: 0 }}>Nobody needs a nudge this week.</p>
            ) : (
              <div>
                {data.members.map((m) => (
                  <div key={m.clientId} className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ display: 'grid', gap: 2, flex: '1 1 240px', minWidth: 0 }}>
                      <strong>{m.name}</strong>
                      <span style={{ color: 'var(--brand)' }}>{m.risk.reasons[0]}</span>
                      {m.risk.reasons.length > 1 ? <span className="muted">{m.risk.reasons.slice(1).join(' · ')}</span> : null}
                    </div>
                    <span className="muted" style={{ textAlign: 'right' }}>
                      {LEVEL_TEXT[m.risk.level]}
                      <br />
                      {m.monthlyCents > 0 && m.currency ? `${approxMoney(m.monthlyCents, m.currency)} a month` : 'Pay as you go'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p style={{ margin: 0 }}>
              <Link href="/dashboard/members">Ask a coach to check in →</Link>
            </p>
          </section>

          <section aria-labelledby="how" style={{ display: 'grid', gap: 8 }}>
            <h3 id="how" className="label">
              How risk is worked out
            </h3>
            <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
              Each signal adds points. 5 or more is high, 3 to 4 medium. Members show up after two weeks with you; paused and cancelled members
              don’t count. MRR is their plan per month (weekly × 52 ÷ 12, packages spread over their weeks, session packs 0).
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Signal</th>
                    <th scope="col">Points</th>
                    <th scope="col">What you see</th>
                  </tr>
                </thead>
                <tbody>
                  {RISK_POINTS_TABLE.map((r) => (
                    <tr key={r.signal}>
                      <td>{r.owner === 'neutral' ? 'Something the athlete shared with their coach' : r.signal}</td>
                      <td>{r.points}</td>
                      <td>{r.owner === 'neutral' ? `“${OWNER_NEUTRAL_REASON}”` : 'The reason, in plain words'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ margin: 0, maxWidth: 620, fontSize: 13 }}>
              Health details (sleep, cycle, fuelling, pain) stay between the athlete and their coach, and only when the athlete shares them. They
              never appear here.
            </p>
          </section>
        </>
      )}
    </div>
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
    <section aria-labelledby={id} style={{ display: 'grid', gap: 8 }}>
      <h3 id={id} className="label">
        Last 12 weeks{trend.currency !== 'usd' ? ` (${trend.currency.toUpperCase()})` : ''}
      </h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxWidth: 480, height: 'auto', display: 'block' }}
        role="img"
        aria-labelledby={`${id}-t ${id}-d`}
      >
        <title id={`${id}-t`}>MRR at risk by week</title>
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
                <th scope="col">High</th>
                <th scope="col">Medium</th>
                <th scope="col">Members</th>
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
