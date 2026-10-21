// DELETE /account (C-10, required by both app stores): deletes or anonymises the caller's personal data
// via public.delete_my_account (signed waivers are kept as a legal record), then removes the auth user.
import { cors, json, serviceClient, userClientFromRequest } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'DELETE') return json(405, { error: 'Use DELETE' });
  const db = userClientFromRequest(req);
  if (!db) return json(401, { error: 'Sign in again to delete your account.' });
  const { data: me } = await db.auth.getUser();
  if (!me.user) return json(401, { error: 'Sign in again to delete your account.' });

  const { error } = await db.rpc('delete_my_account');
  if (error) return json(500, { error: `Couldn’t delete your data: ${error.message}` });
  const { error: authErr } = await serviceClient().auth.admin.deleteUser(me.user.id);
  if (authErr) return json(500, { error: `Your data was deleted, but sign-in removal failed: ${authErr.message}` });
  return json(200, { deleted: true });
});
