-- Cycle tracking and cycle-phase calibration (docs/features/cycle.md, docs/physiology.md).
-- Everything here is the client's own. There is no coach policy on any of these tables: a coach reads
-- only cycle_shared_for_coach, which returns today's estimated phase and the calibration summary, and only
-- when the client turned sharing on. Period dates, symptoms, mode and birth year never leave the client's rows.
--
-- Who counts as "the coach": the coach actually assigned to the client (assigned_coach_id), or the owner
-- only when the client has no assigned coach (a solo trainer coaching directly). An owner of a business
-- whose clients are coached by assistants doesn't see their cycle data, even though can_see_client lets
-- owners see everything else. The owner's retention views never read these tables.

create table public.cycle_profiles (
  client_id uuid primary key references public.profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  mode text not null default 'not_tracking'
    check (mode in ('natural', 'hormonal', 'irregular', 'perimenopause', 'postmenopause', 'not_tracking', 'pregnant_postpartum')),
  birth_year smallint check (birth_year between 1900 and 2100),
  share_with_coach boolean not null default false,
  -- Computed on the phone (packages/core cycle.ts, calibration.ts) and stored so the coach RPC can return it.
  today_phase text check (today_phase in ('menstrual', 'follicular', 'ovulation', 'luteal')),
  today_phase_on date,
  -- { method, ready, summary, appliedPctToday }
  calibration_summary jsonb,
  client_mutation_id uuid,
  updated_at timestamptz not null default now()
);

create table public.period_logs (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  start_on date not null,
  end_on date,
  source text not null default 'manual' check (source in ('manual', 'health')),
  client_mutation_id uuid,
  updated_at timestamptz not null default now(),
  check (end_on is null or (end_on >= start_on and end_on - start_on <= 20))
);
create index period_logs_client on public.period_logs (client_id, start_on);

create table public.symptom_logs (
  client_id uuid not null references public.profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  log_date date not null,
  -- { hot_flashes: 0..3, ... }
  scores jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object'),
  logged_at timestamptz not null,
  client_mutation_id uuid,
  primary key (client_id, log_date)
);

alter table public.cycle_profiles enable row level security;
alter table public.period_logs enable row level security;
alter table public.symptom_logs enable row level security;
-- updated_at is the phone's edit time (not touched on update), so an older queued edit never overwrites a newer one.

-- Own rows only. No coach policy on purpose (same as daily_checks).
create policy cycle_profiles_own_read on public.cycle_profiles for select using (client_id = auth.uid());
create policy cycle_profiles_own_insert on public.cycle_profiles for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy cycle_profiles_own_update on public.cycle_profiles for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy cycle_profiles_own_delete on public.cycle_profiles for delete using (client_id = auth.uid());
create policy period_logs_own_read on public.period_logs for select using (client_id = auth.uid());
create policy period_logs_own_insert on public.period_logs for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy period_logs_own_update on public.period_logs for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy period_logs_own_delete on public.period_logs for delete using (client_id = auth.uid());
create policy symptom_logs_own_read on public.symptom_logs for select using (client_id = auth.uid());
create policy symptom_logs_own_insert on public.symptom_logs for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy symptom_logs_own_update on public.symptom_logs for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy symptom_logs_own_delete on public.symptom_logs for delete using (client_id = auth.uid());

-- The coach's view: today's phase and the calibration summary, only when the client shares it.
-- No row at all when not shared, so the caller can't tell a private profile from no profile.
create or replace function public.cycle_shared_for_coach(client uuid)
returns table (phase text, phase_on date, calibration_summary jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.today_phase, c.today_phase_on, c.calibration_summary, c.updated_at
    from cycle_profiles c
   where c.client_id = client
     and c.share_with_coach
     and c.mode <> 'not_tracking'
     and c.client_id <> auth.uid()
     and public.is_coach(c.tenant_id)
     and public.can_see_client(c.tenant_id, c.client_id)
     and exists (
       select 1 from memberships m
        where m.tenant_id = c.tenant_id and m.profile_id = c.client_id and m.role = 'client'
          and m.status in ('active', 'paused')
          and (m.assigned_coach_id = auth.uid() or (m.assigned_coach_id is null and public.is_owner(c.tenant_id)))
     )
$$;
revoke all on function public.cycle_shared_for_coach(uuid) from public;
grant execute on function public.cycle_shared_for_coach(uuid) to authenticated;

-- Offline mutations from the client app (see 20261021000001_sync_dispatch.sql).
create or replace function public.sync_handle_cycle(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
begin
  if kind not in ('cycle.profile.set', 'cycle.period.upsert', 'cycle.period.delete', 'cycle.symptoms.log') then
    return null;
  end if;
  select m.tenant_id into tenant from memberships m
   where m.profile_id = uid and m.role = 'client' and m.status in ('active', 'paused')
   order by m.created_at desc limit 1;
  if tenant is null then
    raise exception 'You’re not a client of a coach on Spotter.' using errcode = '42501';
  end if;

  case kind
    when 'cycle.profile.set' then
      insert into cycle_profiles (client_id, tenant_id, mode, birth_year, share_with_coach, today_phase, today_phase_on,
                                  calibration_summary, client_mutation_id, updated_at)
      values (uid, tenant, p ->> 'mode', (p ->> 'birthYear')::smallint, coalesce((p ->> 'shareWithCoach')::boolean, false),
              p ->> 'todayPhase', (p ->> 'todayPhaseOn')::date, nullif(p -> 'calibrationSummary', 'null'::jsonb), mid,
              (p ->> 'updatedAt')::timestamptz)
      on conflict (client_id) do update
        set tenant_id = excluded.tenant_id, mode = excluded.mode, birth_year = excluded.birth_year,
            share_with_coach = excluded.share_with_coach, today_phase = excluded.today_phase,
            today_phase_on = excluded.today_phase_on, calibration_summary = excluded.calibration_summary,
            client_mutation_id = excluded.client_mutation_id
        where cycle_profiles.updated_at <= excluded.updated_at;

    when 'cycle.period.upsert' then
      insert into period_logs (id, tenant_id, client_id, start_on, end_on, source, client_mutation_id, updated_at)
      values ((p ->> 'periodId')::uuid, tenant, uid, (p ->> 'start')::date, (p ->> 'end')::date,
              coalesce(p ->> 'source', 'manual'), mid, (p ->> 'updatedAt')::timestamptz)
      on conflict (id) do update
        set start_on = excluded.start_on, end_on = excluded.end_on, source = excluded.source,
            client_mutation_id = excluded.client_mutation_id
        where period_logs.client_id = uid and period_logs.updated_at <= excluded.updated_at;

    when 'cycle.period.delete' then
      -- Deleting something already gone (or never synced) is fine: the outcome is the same.
      delete from period_logs where id = (p ->> 'periodId')::uuid and client_id = uid;

    when 'cycle.symptoms.log' then
      insert into symptom_logs (client_id, tenant_id, log_date, scores, logged_at, client_mutation_id)
      values (uid, tenant, (p ->> 'date')::date, coalesce(p -> 'scores', '{}'::jsonb), (p ->> 'loggedAt')::timestamptz, mid)
      on conflict (client_id, log_date) do update
        set scores = excluded.scores, logged_at = excluded.logged_at, client_mutation_id = excluded.client_mutation_id
        where symptom_logs.logged_at <= excluded.logged_at;
  end case;
  return tenant;
end $$;

-- Account deletion: delete_my_account anonymises the profile rather than deleting it, so the foreign-key
-- cascades don't fire. This trigger removes all cycle data when the account-deletion flag is set for the
-- member being ended (see 20261021080001_integration_fixes.sql), so later rewrites of delete_my_account
-- keep covering these tables without having to list them.
create or replace function public.cycle_forget_on_account_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ended' and current_setting('spotter.deleting_account', true) = new.profile_id::text then
    delete from cycle_profiles where client_id = new.profile_id;
    delete from period_logs where client_id = new.profile_id;
    delete from symptom_logs where client_id = new.profile_id;
  end if;
  return new;
end $$;
create trigger cycle_forget_on_account_delete after update of status on public.memberships
  for each row execute function public.cycle_forget_on_account_delete();
