import JSZip from 'jszip';
import Papa from 'papaparse';
import {
  toCsv,
  uuidv7,
  validateClientImport,
  validateProgramImport,
  type ClientImportRow,
  type CsvRow,
  type ImportedProgram,
} from '@spotter/core';
import { callFunction, isConfigured, saveAndShare, supabase } from '@spotter/ui/platform';
import type { DemoClient } from '@spotter/core/demo';
import { tenant } from '../env';
import { useCoach } from '../store';
import { createInvite } from './invite';
import { useTeam } from './team';

/* Import and export (K-9). */

export function parseCsv(text: string): { rows: CsvRow[]; error: string | null } {
  const out = Papa.parse<CsvRow>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy' });
  const fatal = out.errors.find((e) => e.type === 'Delimiter' || e.code === 'TooFewFields' || e.code === 'TooManyFields');
  return { rows: out.data, error: fatal ? `Row ${(fatal.row ?? 0) + 2}: ${fatal.message}` : null };
}

export function previewClients(text: string) {
  const { rows, error } = parseCsv(text);
  const existing = useCoach.getState().clients.map((c) => (c as DemoClient & { email?: string }).email ?? '').filter(Boolean);
  const v = validateClientImport(rows, existing);
  return { ...v, parseError: error, total: rows.length };
}

export function previewPrograms(text: string) {
  const { rows, error } = parseCsv(text);
  return { ...validateProgramImport(rows), parseError: error, total: rows.length };
}

/** Imports valid client rows. Connected: sends each an invite (they join when they accept). Demo: adds them to the list. */
export async function importClients(rows: ClientImportRow[], onProgress?: (done: number) => void): Promise<{ invited: number; failed: { email: string; message: string }[] }> {
  const failed: { email: string; message: string }[] = [];
  let invited = 0;
  for (const [i, r] of rows.entries()) {
    try {
      if (isConfigured()) await createInvite({ email: r.email, name: r.name, role: 'client' });
      else {
        // MOCK: imported clients appear as new clients waiting to accept their invite.
        const id = `import-${r.email}`;
        useCoach.setState({
          clients: [
            ...useCoach.getState().clients,
            { id, name: r.name, plan: r.plan ?? 'Imported', startDate: r.startDate ?? new Date().toISOString().slice(0, 10), status: 'new', flags: [], thisWeek: { planned: 0, done: 0 }, lastSession: null },
          ],
        });
        useTeam.setState({ coachOf: { ...useTeam.getState().coachOf, [id]: useTeam.getState().viewerId } });
      }
      invited++;
    } catch (e) {
      failed.push({ email: r.email, message: e instanceof Error ? e.message : 'Invite failed' });
    }
    onProgress?.(i + 1);
  }
  return { invited, failed };
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Imports programs as templates. Connected: inserts the program tree; demo: keeps them on this device. */
export async function importPrograms(programs: ImportedProgram[]): Promise<number> {
  if (!isConfigured() || !supabase) {
    // MOCK: stored for the program library (builder A's Programs tab reads templates from its own store).
    const key = 'spotter.importedPrograms';
    const prev = typeof localStorage === 'undefined' ? [] : (JSON.parse(localStorage.getItem(key) ?? '[]') as ImportedProgram[]);
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify([...prev, ...programs]));
    return programs.length;
  }
  const db = supabase;
  const uuid = () => uuidv7();
  for (const p of programs) {
    const programId = uuid();
    const { error } = await db.from('programs').insert({ id: programId, tenant_id: tenant.id, name: p.name, is_template: true });
    if (error) throw new Error(`Couldn’t save ${p.name}: ${error.message}`);
    for (const w of p.weeks) {
      const weekId = uuid();
      await db.from('program_weeks').insert({ id: weekId, tenant_id: tenant.id, program_id: programId, week_index: w.index - 1 });
      for (const d of w.days) {
        const dayId = uuid();
        await db.from('program_days').insert({ id: dayId, tenant_id: tenant.id, program_id: programId, week_id: weekId, day_index: d.index - 1, title: d.title });
        for (const [pos, e] of d.exercises.entries()) {
          const exerciseId = `${tenant.slug}/${slug(e.name)}`;
          await db.from('exercises').upsert({ id: exerciseId, tenant_id: tenant.id, name: e.name, is_custom: true }, { onConflict: 'id', ignoreDuplicates: true });
          const peId = uuid();
          await db.from('program_exercises').insert({ id: peId, tenant_id: tenant.id, program_id: programId, program_day_id: dayId, exercise_id: exerciseId, position: pos, metric: e.loadKg == null && e.repsMin != null ? 'bodyweight_reps' : 'weight_reps', rest_s: e.restS ?? 90, note: e.notes });
          await db.from('prescribed_sets').insert(
            Array.from({ length: e.sets }, (_, i) => ({ id: uuid(), tenant_id: tenant.id, program_id: programId, program_exercise_id: peId, set_index: i, reps_min: e.repsMin, reps_max: e.repsMax, load_type: e.loadKg == null ? 'bodyweight' : 'absolute', load_value: e.loadKg })),
          );
        }
      }
    }
  }
  return programs.length;
}

/** Export everything (K-9). Connected: the server zips it and emails a link. Demo: zips the sample data on this device. */
export async function exportBusiness(): Promise<{ emailed: boolean }> {
  if (isConfigured()) return callFunction<{ emailed: boolean }>('export', { body: { scope: 'tenant', tenantId: tenant.id } });
  const { clients, triage, notes } = useCoach.getState();
  const { coaches, history } = useTeam.getState();
  const zip = new JSZip();
  zip.file('csv/clients.csv', toCsv(clients.map((c) => ({ id: c.id, name: c.name, plan: c.plan, start_date: c.startDate, status: c.status, flags: c.flags.join(' '), notes: notes[c.id] ?? '' }))));
  zip.file('csv/coaches.csv', toCsv(coaches.map((c) => ({ name: c.name, email: c.email, role: c.role, revenue_split: c.split, status: c.status }))));
  zip.file('csv/coach_history.csv', toCsv(Object.entries(history).flatMap(([clientId, h]) => h.map((x) => ({ client_id: clientId, coach_id: x.coachId, from: x.from, to: x.to ?? '', note: x.note ?? '' })))));
  zip.file('csv/triage.csv', toCsv(triage.map((t) => ({ client_id: t.clientId, reason: t.reason, since: t.since, handled_at: t.handledAt ?? '' }))));
  zip.file('README.txt', 'Spotter demo export (sample data). A connected export also includes logs, programs, check-ins and signed waiver PDFs.\n');
  await saveAndShare(`${tenant.slug}-export-${new Date().toISOString().slice(0, 10)}.zip`, await zip.generateAsync({ type: 'uint8array' }), 'application/zip');
  return { emailed: false };
}
