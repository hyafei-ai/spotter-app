'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  INTERVENTION_DONE_LABEL,
  KEPT_AFTER_DAYS,
  KEPT_CAVEAT,
  SPOTTER_PRICE_MONTHLY_CENTS,
  approxMoney,
  checkInRequestText,
  keptSummary,
  memberStatus,
  membersToTalkTo,
  yearlyAssumption,
  yearlyValueCents,
  type Intervention,
  type KeptRow,
  type MemberActivity,
  type MemberAssessment,
} from '@spotter/core';
import { DEMO_PLANS, demoInterventions, demoMemberActivity, demoRetentionSubscriptions } from '@spotter/core/demo';
import { demoClients, demoCoaches, demoTenant } from '../../../src/platformDemo';

/*
 * Owner job on the web dashboard: members to talk to, ask a coach to check in, and who stayed.
 * MOCK DATA: the same demo activity and check-ins as the coach app, run through the same functions.
 * Check-ins asked here are kept in localStorage (spotter.retention.<slug>), like the coach app's demo.
 * Connected dashboards call members_at_risk and kept_summary (owner-only RPCs).
 */

const KEY = `spotter.retention.${demoTenant.slug}`;
const DAY = 86_400_000;
const first = (name: string) => name.split(' ')[0]!;
const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const todayIso = () => new Date().toISOString().slice(0, 10);

interface Data {
  activity: MemberActivity[];
  interventions: Intervention[];
}

function loadDemo(): Data {
  const now = Date.now();
  let saved: Intervention[] | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    saved = raw ? (JSON.parse(raw) as Intervention[]) : null;
  } catch {
    saved = null;
  }
  const coachOf = Object.fromEntries(demoClients.map((c) => [c.id, c.coachId]));
  return { activity: demoMemberActivity(now, coachOf), interventions: saved ?? demoInterventions(now) };
}

export default function MembersPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    try {
      setData(loadDemo());
      setError(null);
    } catch {
      setError('Couldn’t load your members. Refresh the page to try again.');
    }
  }, []);

  useEffect(() => {
    // Demo data lives in localStorage, which only exists after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [load]);

  const today = todayIso();
  const currency = DEMO_PLANS[0]?.currency ?? 'usd';
  const talk = useMemo(() => (data ? membersToTalkTo(data.activity, today) : null), [data, today]);
  const kept = useMemo(
    () => (data ? keptSummary(data.interventions, memberStatus(demoRetentionSubscriptions()), Number(today.slice(0, 4)), today) : null),
    [data, today],
  );
  const openByClient = useMemo(() => new Map((data?.interventions ?? []).filter((i) => !i.doneOn).map((i) => [i.clientId, i])), [data]);

  const owner = demoCoaches.find((c) => c.role === 'owner')!;
  const coaches = demoCoaches.filter((c) => c.status === 'active');
  const coachName = (id: string) => coaches.find((c) => c.id === id)?.name ?? 'Coach';

  const toggle = (m: MemberAssessment) => {
    if (openId === m.clientId) return setOpenId(null);
    setOpenId(m.clientId);
    setCoachId(openByClient.get(m.clientId)?.coachId ?? m.coachId ?? owner.id);
    setNote('');
  };

  const ask = (m: MemberAssessment) => {
    if (!data) return;
    const existing = openByClient.get(m.clientId);
    const row: Intervention = {
      id: existing?.id ?? `demo-${data.interventions.length + 1}-${m.clientId.slice(-6)}`,
      clientId: m.clientId,
      clientName: m.name,
      coachId,
      coachName: coachName(coachId),
      reason: m.risk.reasons[0] ?? 'Hasn’t trained lately',
      note: note.trim() || null,
      requestedOn: today,
      doneOn: null,
      action: null,
      actionNote: null,
      monthlyCents: m.monthlyCents,
    };
    const interventions = [...data.interventions.filter((i) => i.id !== row.id), row];
    try {
      localStorage.setItem(KEY, JSON.stringify(interventions));
    } catch {
      // storage unavailable: kept for this visit only
    }
    setData({ ...data, interventions });
    setOpenId(null);
    setStatus(coachId === owner.id ? `${m.name} is on your Clients list in the coach app.` : `Asked ${coachName(coachId)} to check in with ${first(m.name)}.`);
  };

  const notEnough = talk ? talk.considered === 0 || talk.considered === talk.tooNew : false;

  const memberRow = (m: MemberAssessment) => {
    const asked = openByClient.get(m.clientId);
    const isOpen = openId === m.clientId;
    return (
      <div key={m.clientId} style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="row" style={{ borderBottom: 0, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gap: 2, flex: '1 1 320px' }}>
            <strong>{m.name}</strong>
            <span style={{ color: 'var(--brand)' }}>{m.risk.reasons[0]}</span>
            {m.risk.reasons.length > 1 ? <span className="muted">{m.risk.reasons.slice(1).join(' · ')}</span> : null}
            <span className="muted">
              {m.planName ?? 'No plan'} · {m.yearlyCents != null ? `${approxMoney(m.yearlyCents, currency)} a year` : 'Pay as you go'}
              {asked ? ` · Asked ${first(asked.coachName)} on ${shortDate(asked.requestedOn)}` : ''}
            </span>
          </div>
          <button className="btn btn-secondary" aria-expanded={isOpen} aria-controls={`ask-${m.clientId}`} onClick={() => toggle(m)}>
            {asked ? 'Change who checks in' : 'Ask a coach'}
          </button>
        </div>
        {isOpen ? (
          <div id={`ask-${m.clientId}`} style={{ display: 'grid', gap: 12, maxWidth: 480, padding: '0 0 16px' }}>
            <p className="muted" style={{ margin: 0 }}>
              {m.yearlyCents != null ? `${approxMoney(m.yearlyCents, currency)} a year: ${yearlyAssumption(m.monthlyCents, currency)}.` : 'Pay as you go, so there’s no yearly figure.'}
            </p>
            <label className="field">
              <span className="label">Who should check in</span>
              <select value={coachId} onChange={(e) => setCoachId(e.target.value)}>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id === owner.id ? `${c.name} (you)` : c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Note for the coach (optional)</span>
              <textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
            </label>
            {coachId !== owner.id ? (
              <span className="muted" style={{ fontSize: 13 }}>
                {first(coachName(coachId))} will see: “{checkInRequestText(first(owner.name), m.risk.reasons[0] ?? '')}”
              </span>
            ) : null}
            <button className="btn btn-primary" onClick={() => ask(m)}>
              {coachId === owner.id ? 'Add to my Clients list' : `Ask ${first(coachName(coachId))} to check in`}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const high = talk?.members.filter((m) => m.risk.level === 'high') ?? [];
  const medium = talk?.members.filter((m) => m.risk.level === 'medium') ?? [];

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <h2>Members to talk to</h2>
        <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
          Training or app use has dropped off for these members. A coach checking in this week gives them a reason to stay.
        </p>
        <p className="label" style={{ margin: 0 }}>
          Sample members (MOCK). Numbers are worked out the same way as live data.
        </p>
      </header>

      {!online ? (
        <p role="status" style={{ margin: 0, background: 'var(--surface)', borderLeft: '3px solid var(--line)', padding: '8px 12px' }}>
          You’re offline. This list is from when the page loaded.
        </p>
      ) : null}
      {status ? (
        <p role="status" style={{ margin: 0, background: 'var(--surface)', borderLeft: '3px solid var(--success)', padding: '8px 12px' }}>
          {status}
        </p>
      ) : null}

      {error ? (
        <p role="alert" style={{ margin: 0 }}>
          {error}{' '}
          <button className="btn btn-secondary" onClick={load}>
            Try again
          </button>
        </p>
      ) : !talk || !kept ? (
        <p className="muted" aria-busy="true">
          Loading members…
        </p>
      ) : (
        <>
          <section aria-labelledby="talk" style={{ display: 'grid', gap: 8 }}>
            {notEnough ? (
              <p className="muted">Not enough data yet. Members show up here after two weeks of training with you.</p>
            ) : talk.members.length === 0 ? (
              <p>Nobody needs a nudge this week.</p>
            ) : (
              <>
                {high.length ? (
                  <h3 id="talk" className="label">
                    Talk to this week
                  </h3>
                ) : null}
                <div>{high.map(memberRow)}</div>
                {medium.length ? (
                  <h3 id={high.length ? undefined : 'talk'} className="label" style={{ marginTop: 16 }}>
                    Worth a check-in
                  </h3>
                ) : null}
                <div>{medium.map(memberRow)}</div>
                <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                  Yearly value is their monthly plan × 12. Pay-as-you-go packs don’t get one.
                  {talk.tooNew ? ` ${talk.tooNew} newer member${talk.tooNew === 1 ? ' isn’t' : 's aren’t'} listed until they’ve trained for two weeks.` : ''}
                </p>
              </>
            )}
          </section>

          <Kept kept={kept} currency={currency} />
        </>
      )}
    </div>
  );
}

function Kept({ kept, currency }: { kept: ReturnType<typeof keptSummary>; currency: string }) {
  const n = kept.kept.length;
  const rows = [...kept.kept, ...kept.pending, ...kept.waiting, ...kept.left];
  const how = (r: KeptRow) => (r.action ? INTERVENTION_DONE_LABEL[r.action] : 'checked in');
  const line = (r: KeptRow) => {
    const by = `${first(r.coachName)} · ${how(r)} on ${shortDate(r.doneOn ?? r.requestedOn)}`;
    if (r.outcome === 'kept') return `${by} · still with you`;
    if (r.outcome === 'left') return `${by} · left`;
    if (r.outcome === 'pending') return `${by} · we’ll know on ${shortDate(new Date(Date.parse(`${r.doneOn}T12:00:00Z`) + KEPT_AFTER_DAYS * DAY).toISOString())}`;
    return `Asked ${first(r.coachName)} on ${shortDate(r.requestedOn)} · not checked in yet`;
  };
  const tag = { kept: 'Kept', left: 'Left', pending: 'Pending', waiting: 'Asked' } as const;
  return (
    <section aria-labelledby="kept" style={{ display: 'grid', gap: 8 }}>
      <h3 id="kept" className="label">
        Kept after a check-in
      </h3>
      <p style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600 }}>
        Kept this year: {n} member{n === 1 ? '' : 's'}
        {n ? ` · ${approxMoney(kept.keptYearlyCents, currency)} a year` : ''}
      </p>
      <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
        {KEPT_CAVEAT}
      </p>
      {SPOTTER_PRICE_MONTHLY_CENTS != null && n ? (
        <p className="muted" style={{ margin: 0 }}>
          Spotter costs {approxMoney(yearlyValueCents(SPOTTER_PRICE_MONTHLY_CENTS), currency)} a year.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="muted">When a coach checks in with someone on this list, you’ll see here whether they stayed.</p>
      ) : (
        <div>
          {rows.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
              <div>
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
