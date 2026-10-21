-- Lets each feature area handle its own offline mutation kinds without re-creating sync_apply.
-- A handler is any function named public.sync_handle_<area>(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
-- returning the tenant id it wrote to, or null when the kind isn't its own. Handlers are SECURITY INVOKER
-- (RLS applies) and raise exceptions exactly like sync_apply's built-in branches (P0002 not found, 42501 forbidden).

create or replace function public.sync_dispatch(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  fn text;
  tenant uuid;
begin
  for fn in
    select pr.proname from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
     where ns.nspname = 'public' and pr.proname like 'sync\_handle\_%' order by pr.proname
  loop
    execute format('select public.%I($1, $2, $3, $4, $5)', fn) into tenant using kind, p, uid, mid, client_ip;
    if tenant is not null then return tenant; end if;
  end loop;
  raise exception 'Unknown change type %', kind using errcode = '22023';
end $$;
