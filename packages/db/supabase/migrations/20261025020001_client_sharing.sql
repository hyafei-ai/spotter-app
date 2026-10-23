-- Who sees what (docs/ux/client-experience.md): one screen in the client app lists every kind of data with
-- "{Coach} sees" / "Only you". Most kinds already had a sharing flag (daily checks, cycle, fuel, pain logs,
-- imported workouts). Mobility logs were always visible to the coach; this adds the client's switch.
--
-- mobility_sessions.share_with_coach defaults to true (training data, shared like sessions). The coach policy
-- now requires it, and the new mutation mobility.share.set turns every log (past and future) on or off.

alter table public.mobility_sessions add column share_with_coach boolean not null default true;

drop policy if exists mobility_sessions_coach_read on public.mobility_sessions;
create policy mobility_sessions_coach_read on public.mobility_sessions for select
  using (share_with_coach and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));

create or replace function public.sync_handle_mobility(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
  owner uuid;
  touched int;
begin
  if kind not in ('mobility.log', 'mobility.delete', 'mobility.share.set') then
    return null;
  end if;
  select m.tenant_id into tenant from memberships m
   where m.profile_id = uid and m.role = 'client' and m.status in ('active', 'paused')
   order by m.created_at desc limit 1;
  if tenant is null then
    raise exception 'You’re not a client of a coach on Spotter.' using errcode = '42501';
  end if;

  case kind
    when 'mobility.log' then
      select client_id into owner from mobility_sessions where id = (p ->> 'mobilityId')::uuid;
      if owner is not null and owner <> uid then
        raise exception 'That mobility log isn’t yours.' using errcode = 'P0002';
      end if;
      insert into mobility_sessions (id, tenant_id, client_id, session_date, minutes, kind, routine_id, logged_at, client_mutation_id, share_with_coach)
      values ((p ->> 'mobilityId')::uuid, tenant, uid, (p ->> 'date')::date, (p ->> 'minutes')::smallint, p ->> 'kind',
              p ->> 'routineId', (p ->> 'loggedAt')::timestamptz, mid, coalesce((p ->> 'shareWithCoach')::boolean, true))
      on conflict (id) do update
        set session_date = excluded.session_date, minutes = excluded.minutes, kind = excluded.kind,
            routine_id = excluded.routine_id, logged_at = excluded.logged_at, client_mutation_id = excluded.client_mutation_id,
            share_with_coach = excluded.share_with_coach
        where mobility_sessions.client_id = uid and mobility_sessions.logged_at <= excluded.logged_at;
      get diagnostics touched = row_count;
      -- Nothing written and not one of the caller's own rows (RLS hides others'): someone else's id.
      if touched = 0 and not exists (select 1 from mobility_sessions where id = (p ->> 'mobilityId')::uuid and client_id = uid) then
        raise exception 'That mobility log isn’t yours.' using errcode = 'P0002';
      end if;
      return tenant;

    when 'mobility.delete' then
      -- Idempotent: deleting a log that's already gone (or never synced) is fine; others' logs are untouched.
      delete from mobility_sessions where id = (p ->> 'mobilityId')::uuid and client_id = uid;
      return tenant;

    when 'mobility.share.set' then
      -- Only the caller's own rows; applies to every log so "Only you" means exactly that.
      update mobility_sessions set share_with_coach = (p ->> 'shareWithCoach')::boolean
       where client_id = uid and share_with_coach is distinct from (p ->> 'shareWithCoach')::boolean;
      return tenant;
  end case;
end $$;
grant execute on function public.sync_handle_mobility(text, jsonb, uuid, uuid, inet) to authenticated;
