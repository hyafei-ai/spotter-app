// POST /export (K-9): builds a zip of the caller's data (scope "me") or, for an owner, the whole business
// (scope "tenant"): CSV + JSON per table and the signed waiver PDFs. Uploads it to the private "exports"
// bucket and emails a signed link that works for 24 hours.
import { z } from 'zod';
import JSZip from 'jszip';
import { toCsv } from '../_shared/platform.ts';
import { cors, json, sendEmail, serviceClient, userClientFromRequest } from '../_shared/http.ts';

const Body = z.object({ scope: z.enum(['me', 'tenant']), tenantId: z.string().uuid() });

const ME_TABLES = ['profiles', 'memberships', 'intake_responses', 'waiver_signatures', 'sessions', 'logged_sets', 'personal_records', 'messages', 'consents'];
const TENANT_TABLES = [...ME_TABLES, 'programs', 'program_weeks', 'program_days', 'program_exercises', 'prescribed_sets', 'progression_rules', 'assignments', 'threads', 'intake_forms', 'coach_assignments', 'triage_items'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const db = userClientFromRequest(req);
  if (!db) return json(401, { error: 'Sign in again to export.' });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Invalid body' });
  const { scope, tenantId } = parsed.data;
  const { data: me } = await db.auth.getUser();
  if (!me.user) return json(401, { error: 'Sign in again to export.' });

  if (scope === 'tenant') {
    const { data: owner } = await db.rpc('is_owner', { t: tenantId });
    if (!owner) return json(403, { error: 'Only the owner can export the whole business.' });
  }

  // Reads go through the caller's RLS, so "me" can only ever contain the caller's own rows.
  const zip = new JSZip();
  const counts: Record<string, number> = {};
  for (const table of scope === 'me' ? ME_TABLES : TENANT_TABLES) {
    let q = db.from(table).select('*');
    if (table !== 'profiles') q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) return json(500, { error: `Couldn’t read ${table}: ${error.message}` });
    counts[table] = data.length;
    zip.file(`csv/${table}.csv`, toCsv(data));
    zip.file(`json/${table}.json`, JSON.stringify(data, null, 2));
  }

  // Signed waiver PDFs (rendered by POST /waivers/sign) live in the private "waivers" bucket.
  const admin = serviceClient();
  const { data: waivers } = await db.from('waiver_signatures').select('id, pdf_url').eq('tenant_id', tenantId).not('pdf_url', 'is', null);
  for (const w of waivers ?? []) {
    const { data: file } = await admin.storage.from('waivers').download(w.pdf_url as string);
    if (file) zip.file(`waivers/${w.id}.pdf`, new Uint8Array(await file.arrayBuffer()));
  }
  zip.file('README.txt', `Spotter export (${scope}) created ${new Date().toISOString()}.\nCSV opens in any spreadsheet; JSON keeps every field.\n`);

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const path = `${me.user.id}/${scope}-${Date.now()}.zip`;
  const { error: upErr } = await admin.storage.from('exports').upload(path, bytes, { contentType: 'application/zip' });
  if (upErr) return json(500, { error: `Couldn’t store the export: ${upErr.message}` });
  const { data: signed } = await admin.storage.from('exports').createSignedUrl(path, 24 * 60 * 60);
  const url = signed?.signedUrl ?? null;

  await admin.from('audit_log').insert({ tenant_id: tenantId, actor_id: me.user.id, action: `export.${scope}`, target: path });
  const emailed = url && me.user.email
    ? await sendEmail(me.user.email, 'Your Spotter export is ready', `Download your data here (link works for 24 hours):\n${url}`)
    : false;
  return json(200, { url, emailed, counts });
});
