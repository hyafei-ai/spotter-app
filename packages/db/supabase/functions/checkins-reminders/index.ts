// POST /checkins-reminders — run hourly by a scheduled job (pg_cron or Supabase scheduled function).
// For each client whose check-in is due today in their own time zone, whose reminder hour has just
// started locally, and who hasn't submitted yet: send one push via POST /notify (C-7).
// Native apps also schedule a local reminder; this covers clients on other devices or with the app
// not opened that week. Idempotent per client per due date via audit_log.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
import { env, json, serviceClient } from '../_shared/http.ts';

const DEFAULT_CADENCE = { dueWeekday: 0, reminderHour: 8 };

function localParts(timeZone: string, at: Date) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday!);
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday };
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return json(401, { error: 'Unauthorized' });
  const admin = serviceClient();
  const now = new Date();

  const { data: clients, error } = await admin
    .from('memberships')
    .select('tenant_id, profile_id, profiles(timezone)')
    .eq('role', 'client')
    .eq('status', 'active');
  if (error) return json(500, { error: error.message });

  const { data: templates } = await admin.from('check_in_templates').select('tenant_id, client_id, cadence');
  const cadenceFor = (tenant: string, client: string) =>
    (templates?.find((t) => t.tenant_id === tenant && t.client_id === client) ?? templates?.find((t) => t.tenant_id === tenant && t.client_id === null))?.cadence ??
    DEFAULT_CADENCE;

  let sent = 0;
  for (const c of clients ?? []) {
    const tz = (c.profiles as { timezone?: string } | null)?.timezone ?? 'UTC';
    const cadence = cadenceFor(c.tenant_id, c.profile_id) as typeof DEFAULT_CADENCE;
    const local = localParts(tz, now);
    if (local.weekday !== cadence.dueWeekday || local.hour !== cadence.reminderHour) continue;

    const { data: done } = await admin.from('check_ins').select('id').eq('client_id', c.profile_id).eq('due_date', local.date).maybeSingle();
    if (done) continue;
    const target = `checkin-reminder:${c.profile_id}:${local.date}`;
    const { data: already } = await admin.from('audit_log').select('id').eq('action', 'checkin_reminder').eq('target', target).maybeSingle();
    if (already) continue;

    const res = await fetch(`${env('SUPABASE_URL')}/functions/v1/notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        profileId: c.profile_id,
        tenantId: c.tenant_id,
        category: 'check_in_reminder',
        title: 'Weekly check-in today',
        body: 'Your coach uses this to plan your next week.',
        url: `/check-in/${local.date}`,
      }),
    });
    if (res.ok) {
      await admin.from('audit_log').insert({ tenant_id: c.tenant_id, actor_id: null, action: 'checkin_reminder', target });
      sent++;
    }
  }
  return json(200, { sent });
});
