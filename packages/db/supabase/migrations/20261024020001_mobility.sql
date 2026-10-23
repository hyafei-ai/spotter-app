-- Mobility (docs/features/patterns.md, docs/ux/mobility-capture.md): a quick "Did mobility" log, and stretching /
-- mind-and-body workouts imported from the health app.
--
-- Privacy: mobility_sessions is client-owned training data. Like sessions, the coach reads it (it's part of
-- the program), through is_coach + can_see_client. Owners who aren't coaching the client don't. Deleted with
-- the account.

/* ---------- mobility sessions ---------- */

create table public.mobility_sessions (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  session_date date not null,
  minutes smallint not null check (minutes between 1 and 240),
  kind text not null check (kind in ('routine', 'yoga', 'stretching', 'pilates', 'other')),
  -- The coach's routine it followed (a routine id from the coach's library), when logged from one.
  routine_id text check (char_length(routine_id) <= 80),
  logged_at timestamptz not null,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.mobility_sessions (client_id, session_date desc);
alter table public.mobility_sessions enable row level security;
create trigger touch_updated_at before update on public.mobility_sessions for each row execute function public.touch_updated_at();

create policy mobility_sessions_own_read on public.mobility_sessions for select using (client_id = auth.uid());
create policy mobility_sessions_own_insert on public.mobility_sessions for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy mobility_sessions_own_update on public.mobility_sessions for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy mobility_sessions_own_delete on public.mobility_sessions for delete using (client_id = auth.uid());
-- Training data, shared by default like sessions: the client's coach reads it.
create policy mobility_sessions_coach_read on public.mobility_sessions for select
  using (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));

/* ---------- imported workouts: stretching and mind-and-body ---------- */

-- Appended to the list in 20261023030001_brief.sql (physiology.ts IMPORTED_ACTIVITIES).
alter table public.imported_workouts drop constraint if exists imported_workouts_activity_check;
alter table public.imported_workouts add constraint imported_workouts_activity_check check (activity in (
  'run', 'walk', 'hike', 'ride', 'swim', 'row', 'strength', 'hiit', 'yoga', 'pilates', 'dance', 'class', 'other',
  'flexibility', 'mind_and_body'
));

/* ---------- offline mutations ---------- */

create or replace function public.sync_handle_mobility(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
  owner uuid;
  touched int;
begin
  if kind not in ('mobility.log', 'mobility.delete') then
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
      insert into mobility_sessions (id, tenant_id, client_id, session_date, minutes, kind, routine_id, logged_at, client_mutation_id)
      values ((p ->> 'mobilityId')::uuid, tenant, uid, (p ->> 'date')::date, (p ->> 'minutes')::smallint, p ->> 'kind',
              p ->> 'routineId', (p ->> 'loggedAt')::timestamptz, mid)
      on conflict (id) do update
        set session_date = excluded.session_date, minutes = excluded.minutes, kind = excluded.kind,
            routine_id = excluded.routine_id, logged_at = excluded.logged_at, client_mutation_id = excluded.client_mutation_id
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
  end case;
end $$;
grant execute on function public.sync_handle_mobility(text, jsonb, uuid, uuid, inet) to authenticated;

/* ---------- account deletion ---------- */

-- Same hook as health_forget_on_account_delete (20261023090001_physiology_integration.sql), for this table.
create or replace function public.mobility_forget_on_account_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ended' and current_setting('spotter.deleting_account', true) = new.profile_id::text then
    delete from public.mobility_sessions where client_id = new.profile_id;
  end if;
  return new;
end $$;
create trigger mobility_forget_on_account_delete after update of status on public.memberships
  for each row execute function public.mobility_forget_on_account_delete();
