import JSZip from 'jszip';
import { toCsv } from '@spotter/core';
import { callFunction, isConfigured, saveAndShare, signOut } from '@spotter/ui/platform';
import { tenant } from '../env';
import { useApp } from '../store';

/** "Export my data" (C-10, K-9). Signed in: the server builds the zip and emails a link. Demo: built on the device. */
export async function exportMyData(): Promise<{ emailed: boolean; url: string | null }> {
  if (isConfigured()) {
    return callFunction<{ emailed: boolean; url: string | null }>('export', { body: { scope: 'me', tenantId: tenant.id } });
  }
  // MOCK: demo export of what's stored on this device.
  const s = useApp.getState();
  const zip = new JSZip();
  const sessions = s.completed.map((c) => ({ id: c.sessionId, title: c.title, date: c.date, started_at: c.startedAt, finished_at: c.finishedAt, feel: c.feel, note: c.note }));
  const sets = s.completed.flatMap((c) =>
    c.sets.map((x) => ({ session_id: c.sessionId, exercise: x.exerciseId, set: x.setIndex + 1, weight_kg: x.weightKg, reps: x.reps, rpe: x.rpe, duration_s: x.durationS, distance_m: x.distanceM, logged_at: x.loggedAt })),
  );
  const messages = s.messages.map((m) => ({ from: m.from, sent_at: m.sentAt, kind: m.kind ?? 'text', body: m.body }));
  zip.file('csv/sessions.csv', toCsv(sessions));
  zip.file('csv/logged_sets.csv', toCsv(sets));
  zip.file('csv/messages.csv', toCsv(messages));
  zip.file('json/all.json', JSON.stringify({ intake: s.intake, waiver: s.waiver, sessions, sets, messages }, null, 2));
  zip.file('README.txt', 'Spotter demo export: the data stored on this device. CSV opens in any spreadsheet.\n');
  await saveAndShare(`spotter-export-${new Date().toISOString().slice(0, 10)}.zip`, await zip.generateAsync({ type: 'uint8array' }), 'application/zip');
  return { emailed: false, url: null };
}

/** "Delete account" (required by both stores). Server: DELETE /account, then sign out. Demo: clears this device. */
export async function deleteAccount(): Promise<void> {
  if (isConfigured()) {
    await callFunction('delete-account', { method: 'DELETE' });
    await signOut();
  }
  await useApp.getState().resetDemo();
}
