-- Private storage buckets for platform features. Skipped where the storage schema doesn't exist
-- (plain Postgres in local tests). Media is only ever served through signed URLs.
--   message-media/<tenant_id>/<thread_id>/<message_id>.<ext>   voice notes and photos in threads
--   exports/<profile_id>/<scope>-<ts>.zip                         written by the export function (service role)
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return;
  end if;

  insert into storage.buckets (id, name, public) values
    ('message-media', 'message-media', false),
    ('exports', 'exports', false)
  on conflict (id) do nothing;

  -- Thread participants (the client, or a coach who can see them) can upload to and read their thread's folder.
  execute $p$
    create policy message_media_rw on storage.objects for all to authenticated
    using (
      bucket_id = 'message-media' and exists (
        select 1 from public.threads t
         where t.id::text = split_part(name, '/', 2) and t.tenant_id::text = split_part(name, '/', 1)
           and public.can_see_client(t.tenant_id, t.client_id))
    )
    with check (
      bucket_id = 'message-media' and exists (
        select 1 from public.threads t
         where t.id::text = split_part(name, '/', 2) and t.tenant_id::text = split_part(name, '/', 1)
           and public.can_see_client(t.tenant_id, t.client_id))
    )
  $p$;
end $$;
