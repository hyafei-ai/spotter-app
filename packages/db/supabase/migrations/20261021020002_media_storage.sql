-- Private storage buckets for form-check videos and progress photos. Hosted Supabase only: the
-- local SQL test harness has no storage schema, so this is skipped there.
-- Object paths: <tenant_id>/<client_id>/<file>. Files are never public; apps get signed URLs (≤ 1 h)
-- from the media-signed-url Edge Function, and Mux playback uses signed playback tokens.

do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present; skipping bucket policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('form-checks', 'form-checks', false, 524288000, array['video/mp4', 'video/quicktime', 'video/webm', 'audio/mp4', 'audio/m4a', 'audio/webm']),
         ('progress-photos', 'progress-photos', false, 20971520, array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$
    create policy media_read on storage.objects for select to authenticated using (
      bucket_id in ('form-checks', 'progress-photos')
      and public.can_see_client(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)
    )
  $p$;
  execute $p$
    create policy media_upload_own on storage.objects for insert to authenticated with check (
      bucket_id in ('form-checks', 'progress-photos')
      and ((storage.foldername(name))[2])::uuid = auth.uid()
      and public.is_member(((storage.foldername(name))[1])::uuid)
    )
  $p$;
  -- Coaches upload voice-overs into the client's folder of a client they can see.
  execute $p$
    create policy media_upload_voice on storage.objects for insert to authenticated with check (
      bucket_id = 'form-checks'
      and public.is_coach(((storage.foldername(name))[1])::uuid)
      and public.can_see_client(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)
    )
  $p$;
end
$outer$;
