// POST /sync/push: applies a batch of offline mutations from the client app's queue.
// Validation uses the shared Zod schemas; writes go through public.sync_apply under the caller's RLS.
import { createClient } from '@supabase/supabase-js';
import { SyncPushRequest, SyncPushResponse } from '../_shared/schemas.ts';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-client-info, apikey',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const authorization = req.headers.get('authorization');
  if (!authorization) return json(401, { error: 'Sign in again to sync.' });

  let parsed;
  try {
    parsed = SyncPushRequest.safeParse(await req.json());
  } catch {
    return json(400, { error: 'Body must be JSON.' });
  }
  if (!parsed.success) {
    // A malformed batch is a client bug: the app keeps the batch queued and shows the failed-sync banner.
    return json(400, { error: 'Invalid batch', issues: parsed.error.issues.slice(0, 10) });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const { data, error } = await supabase.rpc('sync_apply', { mutations: parsed.data.mutations, client_ip: ip });
  if (error) {
    // Transport-level failure: the client keeps everything queued and retries with backoff.
    return json(error.code === '42501' ? 401 : 500, { error: error.message });
  }
  return json(200, SyncPushResponse.parse(data));
});
