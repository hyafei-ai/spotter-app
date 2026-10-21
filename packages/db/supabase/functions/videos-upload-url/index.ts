// POST /videos-upload-url
//   {action: "start", videoId, kind, contentType, sizeBytes, durationMs}
//     → records the video (RLS: the caller owns it) and returns where to send the tus upload.
//   {action: "complete", videoId}
//     → the upload finished: create a Mux asset from a short-lived signed URL of the stored file.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, MUX_TOKEN_ID, MUX_TOKEN_SECRET.
import { SIGNED_URL_MAX_S, VideoUploadBody } from '../_shared/schemas.ts';
import { callerId, cors, env, json, serviceClient, userClient } from '../_shared/http.ts';

const BUCKET = 'form-checks';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const authorization = req.headers.get('authorization');
  if (!authorization) return json(401, { error: 'Sign in again to upload.' });

  const parsed = VideoUploadBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Invalid request', issues: parsed.error.issues.slice(0, 5) });
  const body = parsed.data;
  const supabase = userClient(authorization);
  const uid = await callerId(supabase);
  if (!uid) return json(401, { error: 'Sign in again to upload.' });

  if (body.action === 'start') {
    // The caller's tenant: the client membership for form checks, the coach's for voice-overs and demos.
    const { data: membership } = await supabase
      .from('memberships')
      .select('tenant_id, role')
      .eq('profile_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!membership) return json(403, { error: 'You’re not part of a coaching business on Spotter.' });

    const ext = body.contentType.includes('quicktime') ? 'mov' : body.contentType.includes('webm') ? 'webm' : body.contentType.startsWith('audio/') ? 'm4a' : 'mp4';
    const objectName = `${membership.tenant_id}/${uid}/${body.videoId}.${ext}`;
    const { error } = await supabase.from('videos').upsert(
      {
        id: body.videoId,
        tenant_id: membership.tenant_id,
        owner_id: uid,
        kind: body.kind,
        storage_path: objectName,
        content_type: body.contentType,
        size_bytes: body.sizeBytes,
        duration_ms: body.durationMs,
        status: 'uploading',
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) return json(error.code === '42501' ? 403 : 400, { error: error.message });
    return json(200, { endpoint: `${env('SUPABASE_URL')}/storage/v1/upload/resumable`, bucket: BUCKET, objectName });
  }

  // complete: the caller must be able to see the video (RLS), then the service role signs a URL for Mux.
  const { data: video } = await supabase.from('videos').select('id, storage_path, status').eq('id', body.videoId).maybeSingle();
  if (!video) return json(404, { error: 'Video not found.' });
  if (video.status !== 'uploading') return json(200, { status: video.status });

  const admin = serviceClient();
  const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(video.storage_path, Math.min(SIGNED_URL_MAX_S, 3600));
  if (signError || !signed) return json(500, { error: 'Could not read the uploaded file.' });

  const res = await fetch('https://api.mux.com/video/v1/assets', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Basic ${btoa(`${env('MUX_TOKEN_ID')}:${env('MUX_TOKEN_SECRET')}`)}`,
    },
    body: JSON.stringify({
      input: [{ url: signed.signedUrl }],
      playback_policy: ['signed'],
      passthrough: video.id,
      video_quality: 'basic',
    }),
  });
  if (!res.ok) return json(502, { error: `Mux returned ${res.status}` });
  const asset = (await res.json()) as { data: { id: string } };
  await admin.from('videos').update({ status: 'processing', mux_asset_id: asset.data.id }).eq('id', video.id);
  return json(200, { status: 'processing' });
});
