// POST /notify (internal): sends an Expo push respecting the person's notification settings and quiet hours.
// Held notifications go to push_outbox and are sent by a scheduled call with {"flush": true}.
// Called by other Edge Functions and database webhooks with the x-internal-secret header.
import { z } from 'zod';
import { DEFAULT_NOTIFICATION_SETTINGS, NotificationCategory, NotificationSettings, deliveryDecision, inQuietHours } from '../_shared/platform.ts';
import { cors, env, json, serviceClient } from '../_shared/http.ts';

const Send = z.object({
  tenantId: z.string().uuid(),
  profileId: z.string().uuid(),
  category: NotificationCategory,
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(240),
  data: z.record(z.string(), z.unknown()).default({}),
});
const Body = z.union([Send, z.object({ flush: z.literal(true) })]);

type Db = ReturnType<typeof serviceClient>;

async function settingsFor(db: Db, tenantId: string, profileId: string): Promise<NotificationSettings> {
  const { data } = await db.from('notification_settings').select('settings').eq('tenant_id', tenantId).eq('profile_id', profileId).maybeSingle();
  const parsed = NotificationSettings.safeParse(data?.settings);
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_SETTINGS;
}

/** First minute after quiet hours end, as a timestamp (checked minute by minute, max 24 h ahead). */
function quietEndsAt(s: NotificationSettings, now: Date): Date {
  const t = new Date(now);
  for (let i = 0; i < 24 * 60 && inQuietHours(s, t); i++) t.setUTCMinutes(t.getUTCMinutes() + 1);
  return t;
}

async function push(db: Db, n: z.infer<typeof Send>): Promise<{ sent: number; error?: string }> {
  const { data: devices } = await db.from('devices').select('id, expo_push_token').eq('profile_id', n.profileId).eq('tenant_id', n.tenantId).is('disabled_at', null);
  if (!devices?.length) return { sent: 0, error: 'No registered devices' };
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}) },
    body: JSON.stringify(devices.map((d) => ({ to: d.expo_push_token, title: n.title, body: n.body, data: { ...n.data, category: n.category }, sound: 'default' }))),
  });
  if (!res.ok) return { sent: 0, error: `Expo push returned ${res.status}` };
  const out = (await res.json()) as { data: { status: string; details?: { error?: string } }[] };
  let sent = 0;
  await Promise.all(
    out.data.map(async (ticket, i) => {
      if (ticket.status === 'ok') sent++;
      else if (ticket.details?.error === 'DeviceNotRegistered') await db.from('devices').update({ disabled_at: new Date().toISOString() }).eq('id', devices[i]!.id);
    }),
  );
  return { sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.headers.get('x-internal-secret') !== env('INTERNAL_FUNCTION_SECRET')) return json(401, { error: 'Internal only' });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Invalid body', issues: parsed.error.issues });
  const db = serviceClient();
  const now = new Date();

  if ('flush' in parsed.data) {
    const { data: due } = await db.from('push_outbox').select('*').is('sent_at', null).lte('send_after', now.toISOString()).limit(500);
    let sent = 0;
    for (const row of due ?? []) {
      const r = await push(db, { tenantId: row.tenant_id, profileId: row.profile_id, category: row.category, title: row.title, body: row.body, data: row.data });
      sent += r.sent;
      await db.from('push_outbox').update({ sent_at: now.toISOString(), error: r.error ?? null }).eq('id', row.id);
    }
    return json(200, { flushed: due?.length ?? 0, sent });
  }

  const n = parsed.data;
  const settings = await settingsFor(db, n.tenantId, n.profileId);
  const decision = deliveryDecision(settings, n.category, now);
  if (decision === 'skip') return json(200, { decision });
  const row = { tenant_id: n.tenantId, profile_id: n.profileId, category: n.category, title: n.title, body: n.body, data: n.data };
  if (decision === 'hold') {
    await db.from('push_outbox').insert({ ...row, send_after: quietEndsAt(settings, now).toISOString() });
    return json(200, { decision });
  }
  const r = await push(db, n);
  await db.from('push_outbox').insert({ ...row, send_after: now.toISOString(), sent_at: now.toISOString(), error: r.error ?? null });
  return json(200, { decision, ...r });
});
