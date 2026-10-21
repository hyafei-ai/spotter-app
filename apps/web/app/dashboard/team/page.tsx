'use client';

import { useMemo, useState } from 'react';
import { buildInviteUrl, encodeQr, qrPath, revenueSplitProblem, uuidv7 } from '@spotter/core';
import { demoClients, demoCoaches, demoTenant, type WebCoach } from '../../../src/platformDemo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** K-8 team on the web dashboard: coaches, revenue splits, client assignment and handoff, invites. */
export default function TeamPage() {
  const [coaches, setCoaches] = useState<WebCoach[]>(demoCoaches);
  const [clients, setClients] = useState(demoClients);
  const [log, setLog] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [split, setSplit] = useState('60');
  const [invite, setInvite] = useState<string | null>(null);

  const active = coaches.filter((c) => c.status === 'active');
  const problem = !name.trim() ? 'Add their name.' : !EMAIL_RE.test(email.trim()) ? 'Add a full email address.' : revenueSplitProblem(Number(split) / 100);
  const qr = useMemo(() => (invite ? encodeQr(invite) : null), [invite]);

  const sendInvite = () => {
    // MOCK: connected dashboards call POST /invites, which emails the link.
    const url = buildInviteUrl(`https://${demoTenant.slug}.spotter.app`, { token: uuidv7().replace(/-/g, '').slice(-20), tenant: demoTenant.slug, email: email.trim(), role: 'assistant' });
    setCoaches([...coaches, { id: email, name: name.trim(), email: email.trim(), role: 'assistant', split: Number(split) / 100, status: 'invited' }]);
    setInvite(url);
  };

  const handOff = (clientId: string, coachId: string) => {
    const c = clients.find((x) => x.id === clientId)!;
    const to = coaches.find((x) => x.id === coachId)!;
    setClients(clients.map((x) => (x.id === clientId ? { ...x, coachId } : x)));
    setLog([`${c.name} handed to ${to.name}. Sessions, messages and programs stay with ${c.name.split(' ')[0]}.`, ...log]);
  };

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <h2>Team</h2>
        <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
          Assistant coaches see only the clients you give them, and never billing, branding or publishing.
        </p>
      </header>

      <section aria-labelledby="coaches">
        <h3 id="coaches" className="label">
          Coaches
        </h3>
        {coaches.map((c) => {
          const n = clients.filter((x) => x.coachId === c.id).length;
          return (
            <div key={c.id} className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div>
                <strong>{c.name}</strong>
                <div className="muted">
                  {c.status === 'invited' ? `Invited · ${c.email}` : `${c.role === 'owner' ? 'Owner' : 'Assistant coach'} · ${n} client${n === 1 ? '' : 's'}`}
                </div>
              </div>
              {c.role === 'assistant' ? (
                <label className="field" style={{ width: 200 }}>
                  <span className="label">Keeps % of client revenue</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(c.split * 100)}
                    onChange={(e) => setCoaches(coaches.map((x) => (x.id === c.id ? { ...x, split: Math.max(0, Math.min(100, Number(e.target.value))) / 100 } : x)))}
                  />
                </label>
              ) : null}
            </div>
          );
        })}
      </section>

      <section aria-labelledby="clients">
        <h3 id="clients" className="label">
          Who coaches whom
        </h3>
        {log.length ? (
          <p role="status" style={{ background: 'var(--surface)', borderLeft: '3px solid var(--success)', padding: '8px 12px' }}>
            {log[0]}
          </p>
        ) : null}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr className="label" style={{ textAlign: 'left' }}>
              <th style={{ padding: '8px 0' }}>Client</th>
              <th>Plan</th>
              <th>Coach</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 0' }}>{c.name}</td>
                <td className="muted">{c.plan}</td>
                <td>
                  <select aria-label={`Coach for ${c.name}`} value={c.coachId} onChange={(e) => handOff(c.id, e.target.value)} style={{ minHeight: 44 }}>
                    {active.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="invite" style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
        <h3 id="invite" className="label">
          Invite a coach
        </h3>
        {invite && qr ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0 }}>Demo: nothing was emailed. They can scan this or open the link.</p>
            <svg width={180} height={180} viewBox={`0 0 ${qr.size + 8} ${qr.size + 8}`} role="img" aria-label="Invite QR code">
              <rect width="100%" height="100%" fill="#fff" />
              <path d={qrPath(qr)} fill="#000" />
            </svg>
            <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{invite}</code>
            <button className="btn btn-secondary" onClick={() => { setInvite(null); setName(''); setEmail(''); }}>
              Invite someone else
            </button>
          </div>
        ) : (
          <>
            <label className="field">
              <span className="label">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label className="field">
              <span className="label">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="field">
              <span className="label">Their share of client revenue (%)</span>
              <input type="number" min={0} max={100} value={split} onChange={(e) => setSplit(e.target.value)} />
            </label>
            <button className="btn btn-primary" disabled={!!problem} onClick={sendInvite} aria-describedby="invite-problem">
              Send invite
            </button>
            {problem ? (
              <span id="invite-problem" className="muted" style={{ fontSize: 13 }}>
                {problem}
              </span>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
