// POST /media-signed-url {kind: "video" | "progress_photo", id}
// Returns a link to private media the caller is allowed to see (checked by reading the row under the
// caller's RLS first). Links never outlive an hour (Security and privacy).
//  - progress photos: a Supabase Storage signed URL
//  - videos: a Mux signed playback URL (RS256 JWT) once processed, else a Storage signed URL
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY_PRIVATE (base64 PEM).
import { SIGNED_URL_MAX_S, SignedUrlRequest } from '../_shared/schemas.ts';
import { cors, env, json, serviceClient, userClient } from '../_shared/http.ts';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function muxPlaybackToken(playbackId: string, expiresAt: number): Promise<string> {
  const pem = atob(env('MUX_SIGNING_KEY_PRIVATE'));
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = b64urlJson({ alg: 'RS256', typ: 'JWT', kid: env('MUX_SIGNING_KEY_ID') });
  const body = b64urlJson({ sub: playbackId, aud: 'v', exp: expiresAt, kid: env('MUX_SIGNING_KEY_ID') });
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const authorization = req.headers.get('authorization');
  if (!authorization) return json(401, { error: 'Sign in again.' });
  const parsed = SignedUrlRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Invalid request' });
  const { kind, id } = parsed.data;

  // Visibility is decided by RLS: if the caller can't select the row, they don't get a link.
  const supabase = userClient(authorization);
  const table = kind === 'video' ? 'videos' : 'progress_photos';
  const { data: row } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (!row) return json(404, { error: 'Not found.' });

  const expiresIn = SIGNED_URL_MAX_S;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  if (kind === 'video' && row.status === 'ready' && row.mux_playback_id) {
    const token = await muxPlaybackToken(row.mux_playback_id, expiresAt);
    return json(200, { url: `https://stream.mux.com/${row.mux_playback_id}.m3u8?token=${token}`, expiresAt });
  }
  if (kind === 'video' && row.status === 'errored') return json(409, { error: 'This video couldn’t be processed.' });

  const bucket = kind === 'video' ? 'form-checks' : 'progress-photos';
  const { data: signed, error } = await serviceClient().storage.from(bucket).createSignedUrl(row.storage_path, expiresIn);
  if (error || !signed) return json(500, { error: 'Could not sign the link.' });
  return json(200, { url: signed.signedUrl, expiresAt });
});
