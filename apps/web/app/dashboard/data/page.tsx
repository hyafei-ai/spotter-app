'use client';

import { useMemo, useState } from 'react';
import {
  CLIENT_IMPORT_TEMPLATE,
  PROGRAM_IMPORT_TEMPLATE,
  parseCsv,
  toCsv,
  validateClientImport,
  validateProgramImport,
} from '@spotter/core';
import { demoClients, download } from '../../../src/platformDemo';

type Kind = 'clients' | 'programs';

/** K-9 on the web dashboard: CSV import with template, per-row validation and preview; full export. */
export default function DataPage() {
  const [kind, setKind] = useState<Kind>('clients');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    const rows = parseCsv(text);
    if (kind === 'clients') {
      const v = validateClientImport(rows);
      return { count: v.valid.length, issues: v.issues, names: v.valid.map((r) => `${r.name} <${r.email}>`) };
    }
    const v = validateProgramImport(rows);
    return { count: v.programs.length, issues: v.issues, names: v.programs.map((p) => `${p.name}: ${p.weeks.length} week${p.weeks.length === 1 ? '' : 's'}`) };
  }, [text, kind]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setFileName(f.name);
    setDone(null);
  };

  const doImport = () => {
    // MOCK: connected dashboards send each client an invite (POST /invites) and insert programs as templates.
    setDone(`${preview!.count} ${kind === 'clients' ? 'client' : 'program'}${preview!.count === 1 ? '' : 's'} imported (demo, nothing was sent).`);
    setText('');
    setFileName(null);
  };

  const noun = kind === 'clients' ? 'client' : 'program';
  return (
    <div style={{ display: 'grid', gap: 32, maxWidth: 820 }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <h2>Import and export</h2>
        <p className="muted" style={{ margin: 0 }}>
          Move clients and programs in from another tool, or take everything with you.
        </p>
      </header>

      <section aria-labelledby="import" style={{ display: 'grid', gap: 12 }}>
        <h3 id="import" className="label">
          Import
        </h3>
        <div role="radiogroup" aria-label="What to import" style={{ display: 'flex', gap: 8 }}>
          {(['clients', 'programs'] as Kind[]).map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={kind === k}
              className={`btn ${kind === k ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setKind(k);
                setText('');
                setFileName(null);
                setDone(null);
              }}
            >
              {k === 'clients' ? 'Clients' : 'Programs'}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {kind === 'clients' ? 'Each client gets an invite email and appears under New once they accept.' : 'Programs are added to your templates, ready to assign.'}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => download(`spotter-${kind}-template.csv`, kind === 'clients' ? CLIENT_IMPORT_TEMPLATE : PROGRAM_IMPORT_TEMPLATE, 'text/csv')}>
            Get the template
          </button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            Choose CSV file
            <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
          </label>
        </div>
        <label className="field">
          <span className="label">{fileName ? `From ${fileName}` : 'Or paste CSV here'}</span>
          <textarea rows={6} value={text} onChange={(e) => { setText(e.target.value); setFileName(null); setDone(null); }} spellCheck={false} />
        </label>
        {done ? (
          <p role="status" style={{ background: 'var(--surface)', borderLeft: '3px solid var(--success)', padding: '8px 12px', margin: 0 }}>
            {done}
          </p>
        ) : null}
        {preview ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <strong>
              {preview.count} {noun}
              {preview.count === 1 ? '' : 's'} ready to import
            </strong>
            {preview.names.length ? <div className="muted">{preview.names.slice(0, 5).join(' · ')}{preview.names.length > 5 ? ` · and ${preview.names.length - 5} more` : ''}</div> : null}
            {preview.issues.length ? (
              <table style={{ borderCollapse: 'collapse' }} aria-label="Problems found">
                <thead>
                  <tr className="label" style={{ textAlign: 'left' }}>
                    <th style={{ padding: '6px 12px 6px 0' }}>Row</th>
                    <th>Column</th>
                    <th>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.issues.slice(0, 50).map((i, n) => (
                    <tr key={n} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 12px 6px 0' }}>{i.row}</td>
                      <td className="muted">{i.column ?? '—'}</td>
                      <td style={{ color: 'var(--error)' }}>{i.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span className="muted">No problems found.</span>
            )}
            <button className="btn btn-primary" disabled={preview.count === 0} onClick={doImport} style={{ justifySelf: 'start' }}>
              Import {preview.count} {noun}
              {preview.count === 1 ? '' : 's'}
            </button>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="export" style={{ display: 'grid', gap: 12 }}>
        <h3 id="export" className="label">
          Export
        </h3>
        <p className="muted" style={{ margin: 0 }}>
          Clients, logs, programs, check-ins and signed waivers as CSV, JSON and PDFs. Connected accounts get an emailed download link.
        </p>
        <button
          className="btn btn-secondary"
          style={{ justifySelf: 'start' }}
          onClick={() => download('clients.csv', toCsv(demoClients.map((c) => ({ id: c.id, name: c.name, plan: c.plan, coach: c.coachId }))), 'text/csv')}
        >
          Download clients (demo)
        </button>
      </section>
    </div>
  );
}
