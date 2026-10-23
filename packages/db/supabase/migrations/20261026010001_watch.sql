-- Apple Watch (docs/features/watch.md): the heart-rate summary of a session logged on the client's watch.
-- The session and its sets arrive through the usual session.start / set.log / session.finish mutations; this
-- table adds what only the watch knows: average and peak heart rate, heart-rate recovery after 1 and 2
-- minutes (bpm down from the peak), and interval / station splits. Summary only: raw samples stay in the
-- client's Apple Health.
--
-- Health data is the client's (CLAUDE.md): the coach reads a row only while share_with_coach is on (the
-- client's "Heart rate from watch sessions" switch in Who sees what), and only for clients they can see.
-- Rows go with their session (on delete cascade), so delete_my_account already removes them.

create table public.session_watch_summaries (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  source text not null default 'apple_watch' check (source = 'apple_watch'),
  avg_hr smallint check (avg_hr between 30 and 240),
  max_hr smallint check (max_hr between 30 and 240),
  hrr_peak smallint check (hrr_peak between 30 and 240),
  hrr_60 smallint check (hrr_60 between -60 and 200),
  hrr_120 smallint check (hrr_120 between -60 and 200),
  splits jsonb not null default '[]'::jsonb check (jsonb_typeof(splits) = 'array' and jsonb_array_length(splits) <= 60),
  share_with_coach boolean not null default true,
  recorded_at timestamptz not null,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now()
);
create index on public.session_watch_summaries (client_id, recorded_at desc);

alter table public.session_watch_summaries enable row level security;

create policy session_watch_summaries_client_read on public.session_watch_summaries for select
  using (client_id = auth.uid());
create policy session_watch_summaries_client_write on public.session_watch_summaries for insert
  with check (client_id = auth.uid() and exists (select 1 from public.sessions s where s.id = session_id and s.client_id = auth.uid() and s.tenant_id = session_watch_summaries.tenant_id));
create policy session_watch_summaries_client_update on public.session_watch_summaries for update
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy session_watch_summaries_coach_read on public.session_watch_summaries for select
  using (share_with_coach and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));


create or replace function public.sync_handle_watch(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
begin
  if kind not in ('session.watch', 'watch.share.set') then
    return null;
  end if;

  if kind = 'watch.share.set' then
    select m.tenant_id into tenant from memberships m
     where m.profile_id = uid and m.role = 'client' and m.status in ('active', 'paused')
     order by m.created_at desc limit 1;
    if tenant is null then
      raise exception 'You’re not a client of a coach on Spotter.' using errcode = '42501';
    end if;
    update session_watch_summaries set share_with_coach = (p ->> 'shareWithCoach')::boolean
     where client_id = uid and share_with_coach is distinct from (p ->> 'shareWithCoach')::boolean;
    return tenant;
  end if;

  -- session.watch: only for the caller's own session (synced earlier in the same push, in order).
  select s.tenant_id into tenant from sessions s where s.id = (p ->> 'sessionId')::uuid and s.client_id = uid;
  if tenant is null then
    raise exception 'This session isn’t yours or was removed.' using errcode = 'P0002';
  end if;
  insert into session_watch_summaries (session_id, tenant_id, client_id, avg_hr, max_hr, hrr_peak, hrr_60, hrr_120, splits,
                                       share_with_coach, recorded_at, client_mutation_id)
  values ((p ->> 'sessionId')::uuid, tenant, uid, (p ->> 'avgHr')::smallint, (p ->> 'maxHr')::smallint,
          (p ->> 'hrrPeak')::smallint, (p ->> 'hrr60')::smallint, (p ->> 'hrr120')::smallint,
          coalesce(p -> 'splits', '[]'::jsonb), coalesce((p ->> 'shareWithCoach')::boolean, true),
          (p ->> 'recordedAt')::timestamptz, mid)
  on conflict (session_id) do update
    set avg_hr = excluded.avg_hr, max_hr = excluded.max_hr, hrr_peak = excluded.hrr_peak, hrr_60 = excluded.hrr_60,
        hrr_120 = excluded.hrr_120, splits = excluded.splits, share_with_coach = excluded.share_with_coach,
        recorded_at = excluded.recorded_at, client_mutation_id = excluded.client_mutation_id
    where session_watch_summaries.client_id = uid and session_watch_summaries.recorded_at <= excluded.recorded_at;
  return tenant;
end $$;
grant execute on function public.sync_handle_watch(text, jsonb, uuid, uuid, inet) to authenticated;
