// GET /sync/pull?since=<cursor>: changes for the caller's offline cache since a cursor.
// The query lives in public.sync_pull (SECURITY INVOKER), so RLS limits it to the caller's own data.
import { cors, json, userClientFromRequest } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'GET') return json(405, { error: 'Use GET' });
  const db = userClientFromRequest(req);
  if (!db) return json(401, { error: 'Sign in again to sync.' });
  const since = new URL(req.url).searchParams.get('since');
  if (since && Number.isNaN(Date.parse(since))) return json(400, { error: 'since must be an ISO timestamp' });
  const { data, error } = await db.rpc('sync_pull', since ? { since } : {});
  if (error) return json(error.code === '42501' ? 401 : 500, { error: error.message });
  return json(200, data);
});
