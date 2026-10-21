// POST /webhooks-mux — Mux asset events. Verifies the Mux-Signature header (HMAC-SHA256 over
// "<timestamp>.<raw body>", 5-minute tolerance) before touching anything.
// video.asset.ready → videos.status = ready (+ playback id, duration); the form check's triage item
// already exists from the insert trigger. video.asset.errored → status errored with Mux's message.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MUX_WEBHOOK_SECRET.
import { z } from 'zod';
import { env, json, serviceClient } from '../_shared/http.ts';
import { verifyMuxSignature } from '../_shared/mux.ts';

const MuxEvent = z.object({
  type: z.string(),
  data: z.object({
    id: z.string(),
    passthrough: z.string().uuid().optional(),
    duration: z.number().optional(),
    playback_ids: z.array(z.object({ id: z.string(), policy: z.string() })).optional(),
    errors: z.object({ messages: z.array(z.string()).optional() }).optional(),
  }),
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const raw = await req.text();
  if (!(await verifyMuxSignature(req.headers.get('mux-signature'), raw, env('MUX_WEBHOOK_SECRET')))) {
    return json(401, { error: 'Bad signature' });
  }
  const parsed = MuxEvent.safeParse(JSON.parse(raw));
  if (!parsed.success) return json(200, { ignored: true });
  const { type, data } = parsed.data;
  const admin = serviceClient();
  const match = data.passthrough ? { id: data.passthrough } : { mux_asset_id: data.id };

  if (type === 'video.asset.ready') {
    const playback = data.playback_ids?.find((p) => p.policy === 'signed') ?? data.playback_ids?.[0];
    await admin
      .from('videos')
      .update({ status: 'ready', mux_asset_id: data.id, mux_playback_id: playback?.id ?? null, duration_ms: data.duration ? Math.round(data.duration * 1000) : null })
      .match(match);
  } else if (type === 'video.asset.errored') {
    await admin.from('videos').update({ status: 'errored', error: data.errors?.messages?.join('; ') ?? 'Processing failed' }).match(match);
  }
  // Acknowledge everything else so Mux doesn't retry events we don't use.
  return json(200, { ok: true });
});
