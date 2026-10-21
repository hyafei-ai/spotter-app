'use client';

import { useMemo, useState } from 'react';
import {
  Assignment,
  LOAD_TYPE_LABEL,
  Program,
  STARTER_LIBRARY,
  WEEKDAY_SHORT,
  copyWeek,
  newDay,
  newExercise,
  newProgram,
  programProblems,
  programSummary,
  progressAcrossWeeks,
  publish,
  updateDay,
  updateExercise,
  type LoadType,
  type ProgramExerciseDef,
  type ProgramSet,
} from '@spotter/core';
import { demoPrograms } from '@spotter/core/demo';
import { z } from 'zod';

/*
 * MOCK: the web dashboard keeps programs in this browser's localStorage under the same key the
 * coach app uses (spotter.programs.<tenant>). Real builds read and write the programs tables and
 * call publish_program() — see packages/db/supabase/migrations/20261021010001_programs.sql.
 */
const KEY = 'spotter.programs.maya-reyes-strength';
const Bundle = z.object({ programs: z.array(Program), assignments: z.array(Assignment) });
type Bundle = z.infer<typeof Bundle>;

function load(): Bundle {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? Bundle.safeParse(JSON.parse(raw)) : null;
    if (parsed?.success) return parsed.data;
  } catch {
    // fall through to the seed
  }
  return demoPrograms();
}

const LOAD_TYPES: LoadType[] = ['absolute', 'pct_1rm', 'rpe', 'bodyweight'];
const num = (v: string) => (v.trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** The value shared by every set, or null when sets differ (shown as "varies"). */
function common<T>(sets: ProgramSet[], pick: (s: ProgramSet) => T): T | null | 'varies' {
  if (sets.length === 0) return null;
  const first = pick(sets[0]!);
  return sets.every((s) => pick(s) === first) ? first : 'varies';
}

export function ProgramTable() {
  // Rendered client-only (see ProgramsClient.tsx), so localStorage is available on first render.
  const [bundle, setBundle] = useState<Bundle>(load);
  const [programId, setProgramId] = useState<string | null>(() => bundle.programs[0]?.id ?? null);
  const [draft, setDraft] = useState<Program | null>(() => bundle.programs[0] ?? null);
  const [week, setWeek] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ exerciseId: string; stepKg: string; stepPct: string }>({ exerciseId: '', stepKg: '2.5', stepPct: '2.5' });

  const exerciseIds = useMemo(
    () => [...new Map((draft?.weeks ?? []).flatMap((w) => w.days.flatMap((d) => d.exercises.map((e) => [e.exerciseId, e.name] as const)))).entries()],
    [draft],
  );

  const saved = bundle.programs.find((p) => p.id === programId) ?? null;
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
  const persist = (b: Bundle) => {
    setBundle(b);
    try {
      localStorage.setItem(KEY, JSON.stringify(b));
    } catch {
      setMessage('Couldn’t save in this browser. Check that storage isn’t blocked.');
    }
  };

  const select = (id: string) => {
    if (dirty && !window.confirm('Discard unsaved changes to this program?')) return;
    setProgramId(id);
    setDraft(bundle.programs.find((p) => p.id === id) ?? null);
    setWeek(0);
    setProblems([]);
  };

  const create = () => {
    const p = newProgram('New program');
    persist({ ...bundle, programs: [p, ...bundle.programs] });
    setProgramId(p.id);
    setDraft(p);
    setWeek(0);
  };

  const save = (publishIt: boolean) => {
    if (!draft) return;
    const live = publishIt || draft.status === 'published';
    const found = live ? programProblems(draft).map((p) => p.message) : [];
    setProblems(found);
    if (found.length) return;
    const next = live ? publish(draft) : draft;
    persist({ ...bundle, programs: bundle.programs.map((p) => (p.id === next.id ? next : p)) });
    setDraft(next);
    setMessage(publishIt ? 'Published.' : live ? 'Saved. Assigned clients get the changes from their next session.' : 'Draft saved.');
  };

  const setEx = (peId: string, fn: (e: ProgramExerciseDef) => ProgramExerciseDef) => draft && setDraft(updateExercise(draft, peId, fn));
  const setAllSets = (peId: string, patch: Partial<ProgramSet>) => setEx(peId, (e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, ...patch })) }));
  const w = draft?.weeks[week];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <span className="label">Programs</span>
          <h2>Program builder</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Edit a whole week at once. Changes to a live program reach clients from their next session.
          </p>
        </div>
        <label className="field" style={{ minWidth: 220 }}>
          <span className="label">Program</span>
          <select value={programId ?? ''} onChange={(e) => select(e.target.value)} aria-label="Program">
            {bundle.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || 'Untitled'} {p.status === 'draft' ? '(draft)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary" onClick={create}>
          New program
        </button>
      </header>

      {message ? (
        <p role="status" className="row" style={{ border: 0, minHeight: 0 }}>
          {message}
        </p>
      ) : null}

      {!draft ? (
        <p className="muted">No programs yet. Create one to start.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: 1, minWidth: 240 }}>
              <span className="label">Name</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <span className="muted">
              {programSummary(draft)} · {draft.status === 'draft' ? 'Draft' : `Live, v${draft.version}`}
            </span>
          </div>

          {problems.length ? (
            <div role="alert" style={{ borderLeft: '3px solid var(--error)', background: 'var(--surface)', padding: 12, borderRadius: 6 }}>
              <strong>Fix these first</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <nav aria-label="Weeks" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {draft.weeks.map((x, i) => (
              <button key={x.id} className={`btn ${i === week ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={i === week} onClick={() => setWeek(i)}>
                Week {i + 1}
              </button>
            ))}
            {w ? (
              <button className="btn btn-secondary" onClick={() => setDraft(copyWeek(draft, w.id))}>
                Copy week {week + 1} to a new week
              </button>
            ) : null}
            <button className="btn btn-secondary" onClick={() => setDraft({ ...draft, weeks: [...draft.weeks, { id: crypto.randomUUID(), days: [] }] })}>
              Add empty week
            </button>
          </nav>

          {w ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 880 }}>
                <thead>
                  <tr>
                    {['Day', 'Exercise', 'Sets', 'Reps / amount', 'Load', 'Value', 'RPE', 'Rest (s)', 'Tempo', 'Note'].map((h) => (
                      <th key={h} className="label" style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--line)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {w.days.map((d) =>
                    (d.exercises.length ? d.exercises : [null]).map((e, ei) => {
                      const cell = { padding: '6px', borderBottom: '1px solid var(--line)', verticalAlign: 'top' as const };
                      // "8-10", or "10" when the range is a single number.
                      const reps = e ? common(e.sets, (s) => (s.repsMin === s.repsMax ? `${s.repsMax ?? ''}` : `${s.repsMin ?? ''}-${s.repsMax ?? ''}`)) : null;
                      const amount = e?.metric === 'time' ? common(e.sets, (s) => s.durationS) : e?.metric === 'distance' ? common(e.sets, (s) => s.distanceM) : null;
                      const lt = e ? common(e.sets, (s) => s.loadType) : null;
                      const lv = e ? common(e.sets, (s) => s.loadValue) : null;
                      const rpe = e ? common(e.sets, (s) => s.rpe) : null;
                      return (
                        <tr key={e?.id ?? d.id}>
                          {ei === 0 ? (
                            <td style={cell} rowSpan={Math.max(1, d.exercises.length)}>
                              <input
                                aria-label={`Session name, ${WEEKDAY_SHORT[d.weekday - 1]}`}
                                value={d.title}
                                onChange={(ev) => setDraft(updateDay(draft, d.id, (x) => ({ ...x, title: ev.target.value })))}
                                style={{ width: 120 }}
                              />
                              <div className="muted" style={{ fontSize: 13 }}>
                                {WEEKDAY_SHORT[d.weekday - 1]}
                              </div>
                            </td>
                          ) : null}
                          {e ? (
                            <>
                              <td style={cell}>
                                {e.name}
                                {e.supersetGroup ? <span className="muted"> · superset {e.supersetGroup}</span> : null}
                              </td>
                              <td style={cell}>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  aria-label={`${e.name} sets`}
                                  value={e.sets.length}
                                  style={{ width: 56 }}
                                  onChange={(ev) => {
                                    const n = Math.max(1, Math.min(10, Number(ev.target.value) || 1));
                                    setEx(e.id, (x) => ({ ...x, sets: Array.from({ length: n }, (_, i) => x.sets[i] ?? { ...x.sets[x.sets.length - 1]! }) }));
                                  }}
                                />
                              </td>
                              <td style={cell}>
                                {e.metric === 'time' || e.metric === 'distance' ? (
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <input
                                      type="number"
                                      min={0}
                                      aria-label={`${e.name} ${e.metric === 'time' ? 'seconds' : 'metres'}`}
                                      value={amount === 'varies' || amount == null ? '' : amount}
                                      placeholder={amount === 'varies' ? 'varies' : ''}
                                      style={{ width: 56 }}
                                      onChange={(ev) =>
                                        setAllSets(e.id, e.metric === 'time' ? { durationS: num(ev.target.value) } : { distanceM: num(ev.target.value) })
                                      }
                                    />
                                    <span className="muted">{e.metric === 'time' ? 's' : 'm'}</span>
                                  </label>
                                ) : (
                                  <input
                                    aria-label={`${e.name} reps, e.g. 8-10`}
                                    value={reps === 'varies' ? '' : (reps ?? '').replace(/-$/, '')}
                                    placeholder={reps === 'varies' ? 'varies' : '8-10'}
                                    style={{ width: 72 }}
                                    onChange={(ev) => {
                                      const [a, b] = ev.target.value.split(/[-–]/);
                                      const min = num(a ?? '');
                                      const max = b === undefined ? min : num(b);
                                      setAllSets(e.id, { repsMin: min, repsMax: max });
                                    }}
                                  />
                                )}
                              </td>
                              <td style={cell}>
                                <select
                                  aria-label={`${e.name} load type`}
                                  value={lt === 'varies' || lt == null ? '' : lt}
                                  onChange={(ev) => setAllSets(e.id, { loadType: ev.target.value as LoadType, loadValue: null })}
                                >
                                  {lt === 'varies' ? <option value="">varies</option> : null}
                                  {LOAD_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                      {t === 'absolute' ? 'kg' : LOAD_TYPE_LABEL[t]}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td style={cell}>
                                {lt === 'absolute' || lt === 'pct_1rm' ? (
                                  <input
                                    type="number"
                                    step={lt === 'pct_1rm' ? 1 : 0.5}
                                    aria-label={`${e.name} ${lt === 'pct_1rm' ? '% of 1RM' : 'weight in kg'}`}
                                    value={lv === 'varies' || lv == null ? '' : lt === 'pct_1rm' ? Math.round(lv * 1000) / 10 : lv}
                                    placeholder={lv === 'varies' ? 'varies' : ''}
                                    style={{ width: 72 }}
                                    onChange={(ev) => {
                                      const v = num(ev.target.value);
                                      setAllSets(e.id, { loadValue: v == null ? null : lt === 'pct_1rm' ? v / 100 : v });
                                    }}
                                  />
                                ) : (
                                  <span className="muted">—</span>
                                )}
                              </td>
                              <td style={cell}>
                                <input
                                  type="number"
                                  step={0.5}
                                  min={1}
                                  max={10}
                                  aria-label={`${e.name} target RPE`}
                                  value={rpe === 'varies' || rpe == null ? '' : rpe}
                                  placeholder={rpe === 'varies' ? 'varies' : ''}
                                  style={{ width: 56 }}
                                  onChange={(ev) => setAllSets(e.id, { rpe: num(ev.target.value) })}
                                />
                              </td>
                              <td style={cell}>
                                <input
                                  type="number"
                                  min={0}
                                  step={15}
                                  aria-label={`${e.name} rest in seconds`}
                                  value={e.restS}
                                  style={{ width: 64 }}
                                  onChange={(ev) => setEx(e.id, (x) => ({ ...x, restS: Math.max(0, Number(ev.target.value) || 0) }))}
                                />
                              </td>
                              <td style={cell}>
                                <input
                                  aria-label={`${e.name} tempo`}
                                  value={e.tempo ?? ''}
                                  style={{ width: 64 }}
                                  onChange={(ev) => setEx(e.id, (x) => ({ ...x, tempo: ev.target.value.trim() ? ev.target.value.slice(0, 12) : null }))}
                                />
                              </td>
                              <td style={cell}>
                                <input
                                  aria-label={`${e.name} note`}
                                  value={e.note ?? ''}
                                  style={{ width: 160 }}
                                  onChange={(ev) => setEx(e.id, (x) => ({ ...x, note: ev.target.value || null }))}
                                />
                              </td>
                            </>
                          ) : (
                            <td style={cell} colSpan={9} className="muted">
                              No exercises yet.
                            </td>
                          )}
                        </tr>
                      );
                    }),
                  )}
                  {w.days.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="muted" style={{ padding: 12 }}>
                        No sessions in week {week + 1}.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {w ? <AddRow week={w} onAddDay={(weekday, title) => setDraft({ ...draft, weeks: draft.weeks.map((x, i) => (i === week ? { ...x, days: [...x.days, newDay(weekday, title)].sort((a, b) => a.weekday - b.weekday) } : x)) })} onAddExercise={(dayId, exId) => {
            const ex = STARTER_LIBRARY.find((x) => x.id === exId);
            if (ex) setDraft(updateDay(draft, dayId, (d) => ({ ...d, exercises: [...d.exercises, newExercise(ex)] })));
          }} /> : null}

          <section aria-label="Progress loads across weeks" style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <div style={{ flexBasis: '100%' }}>
              <h3>Progress loads across weeks</h3>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                From week {week + 1}, each later week goes up by the step. Fixed weights use kg; % of 1RM uses percentage points.
              </p>
            </div>
            <label className="field">
              <span className="label">Exercise</span>
              <select aria-label="Exercise to progress" value={progress.exerciseId} onChange={(e) => setProgress({ ...progress, exerciseId: e.target.value })}>
                <option value="">Choose…</option>
                {exerciseIds.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">kg per week</span>
              <input type="number" step={0.5} value={progress.stepKg} onChange={(e) => setProgress({ ...progress, stepKg: e.target.value })} style={{ width: 96 }} />
            </label>
            <label className="field">
              <span className="label">% per week</span>
              <input type="number" step={0.5} value={progress.stepPct} onChange={(e) => setProgress({ ...progress, stepPct: e.target.value })} style={{ width: 96 }} />
            </label>
            <button
              className="btn btn-secondary"
              disabled={!progress.exerciseId}
              onClick={() => setDraft(progressAcrossWeeks(draft, progress.exerciseId, week, Number(progress.stepKg) || 0, (Number(progress.stepPct) || 0) / 100))}
            >
              Apply to later weeks
            </button>
          </section>

          <footer style={{ display: 'flex', gap: 12, position: 'sticky', bottom: 0, background: 'var(--paper)', padding: '12px 0', borderTop: '1px solid var(--line)' }}>
            {draft.status === 'draft' ? (
              <>
                <button className="btn btn-secondary" disabled={!dirty} onClick={() => save(false)}>
                  Save draft
                </button>
                <button className="btn btn-primary" onClick={() => save(true)}>
                  Publish
                </button>
              </>
            ) : (
              <button className="btn btn-primary" disabled={!dirty} onClick={() => save(false)}>
                Save changes
              </button>
            )}
            {dirty ? (
              <button className="btn btn-secondary" onClick={() => setDraft(saved)}>
                Discard changes
              </button>
            ) : null}
          </footer>
        </>
      )}
    </div>
  );
}

function AddRow({
  week,
  onAddDay,
  onAddExercise,
}: {
  week: Program['weeks'][number];
  onAddDay: (weekday: number, title: string) => void;
  onAddExercise: (dayId: string, exerciseId: string) => void;
}) {
  const free = [1, 2, 3, 4, 5, 6, 7].filter((d) => !week.days.some((x) => x.weekday === d));
  const [weekday, setWeekday] = useState<number>(free[0] ?? 1);
  const [dayId, setDayId] = useState('');
  const [exId, setExId] = useState('');
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'end' }}>
      {free.length ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <label className="field">
            <span className="label">Add a session on</span>
            <select aria-label="Day for the new session" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {free.map((d) => (
                <option key={d} value={d}>
                  {WEEKDAY_SHORT[d - 1]}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary" onClick={() => onAddDay(weekday, `Day ${week.days.length + 1}`)}>
            Add session
          </button>
        </div>
      ) : null}
      {week.days.length ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <label className="field">
            <span className="label">Add exercise to</span>
            <select aria-label="Session to add the exercise to" value={dayId} onChange={(e) => setDayId(e.target.value)}>
              <option value="">Choose a session…</option>
              {week.days.map((d) => (
                <option key={d.id} value={d.id}>
                  {WEEKDAY_SHORT[d.weekday - 1]} · {d.title || 'Untitled'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Exercise</span>
            <select aria-label="Exercise to add" value={exId} onChange={(e) => setExId(e.target.value)}>
              <option value="">Choose…</option>
              {[...STARTER_LIBRARY].sort((a, b) => a.name.localeCompare(b.name)).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary" disabled={!dayId || !exId} onClick={() => onAddExercise(dayId, exId)}>
            Add exercise
          </button>
        </div>
      ) : null}
    </div>
  );
}
