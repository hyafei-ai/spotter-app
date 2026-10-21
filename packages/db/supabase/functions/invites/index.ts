// POST /invites: a coach creates an invite link (and QR payload) for a client or, for owners, an assistant.
// The token is only ever returned once; the database stores its SHA-256.
import { z } from 'zod';
import { buildInviteUrl } from '../_shared/platform.ts';
import { cors, json, randomToken, sendEmail, sha256Hex, userClientFromRequest } from '../_shared/http.ts';

const Body = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().max(120).optional(),
  role: z.enum(['client', 'assistant']).default('client'),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const db = userClientFromRequest(req);
  if (!db) return json(401, { error: 'Sign in again to send invites.' });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Check the email address and try again.', issues: parsed.error.issues });
  const { tenantId, email, fullName, role } = parsed.data;

  const { data: user } = await db.auth.getUser();
  if (!user.user) return json(401, { error: 'Sign in again to send invites.' });
  const { data: tenant, error: tErr } = await db.from('tenants').select('slug, app_name').eq('id', tenantId).single();
  if (tErr || !tenant) return json(403, { error: 'You’re not a coach in this business.' });

  const token = randomToken();
  const { data: invite, error } = await db
    .from('invites')
    .insert({ tenant_id: tenantId, email: email.toLowerCase(), full_name: fullName ?? null, role, token_hash: await sha256Hex(token), invited_by: user.user.id })
    .select('id, expires_at')
    .single();
  if (error) return json(error.code === '42501' ? 403 : 400, { error: role === 'assistant' ? 'Only the owner can invite coaches.' : error.message });

  const base = (Deno.env.get('INVITE_BASE_URL') ?? 'https://{slug}.spotter.app').replace('{slug}', tenant.slug);
  const url = buildInviteUrl(base, { token, tenant: tenant.slug, email, role });
  const emailed = await sendEmail(
    email,
    `${tenant.app_name}: your invite`,
    `You’ve been invited to ${tenant.app_name}.\n\nOpen this link on your phone to get started:\n${url}\n\nThe link works for 14 days.`,
  );
  return json(200, { inviteId: invite.id, url, expiresAt: invite.expires_at, emailed });
});
