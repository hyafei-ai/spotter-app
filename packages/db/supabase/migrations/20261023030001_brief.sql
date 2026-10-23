-- Daily brief, wearables, injury load and imported workouts (docs/features/brief.md).
--
-- Privacy:
--   pain_logs          client-owned; the coach reads a row only when the client shares it (on by default, per log).
--   wearable_days      client-only. Coaches never read raw HRV, resting HR or sleep from here; the brief's
--                      plain-English text reaches them through daily_checks.shared_read (when the read is shared).
--   imported_workouts  client-owned; coaches get summary columns (type, date, duration, distance, app) of shared
--                      rows through imported_workouts_for_coach, never heart rate or kcal.

/* ---------- pain ---------- */

create table public.pain_logs (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  region text not null check (region in ('neck', 'shoulder', 'elbow', 'wrist', 'upper_back', 'lower_back', 'hip', 'knee', 'ankle', 'foot', 'other')),
  side text check (side in ('left', 'right', 'both')),
  level smallint not null check (level between 0 and 10),
  note text check (char_length(note) <= 300),
  share_with_coach boolean not null default true,
  logged_at timestamptz not null,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.pain_logs (client_id, log_date desc);
alter table public.pain_logs enable row level security;
create trigger touch_updated_at before update on public.pain_logs for each row execute function public.touch_updated_at();

create policy pain_logs_own_read on public.pain_logs for select using (client_id = auth.uid());
create policy pain_logs_own_insert on public.pain_logs for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy pain_logs_own_update on public.pain_logs for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy pain_logs_own_delete on public.pain_logs for delete using (client_id = auth.uid());
-- Coaches see shared logs of clients they can see. The coach needs pain for programming, so sharing is
-- on by default; the client can turn it off per log.
create policy pain_logs_coach_read on public.pain_logs for select
  using (share_with_coach and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));

/* ---------- wearable days (client only) ---------- */

create table public.wearable_days (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  -- HRV is SDNN from Apple Health and RMSSD from Health Connect: never compared across sources.
  source text not null check (source in ('apple_health', 'health_connect', 'manual')),
  sleep_hours numeric check (sleep_hours between 0 and 16),
  hrv_ms numeric check (hrv_ms between 0 and 500),
  resting_hr numeric check (resting_hr between 20 and 250),
  active_kcal numeric check (active_kcal between 0 and 20000),
  updated_at timestamptz not null default now(),
  primary key (client_id, day, source)
);
alter table public.wearable_days enable row level security;
-- Own rows only. No coach policy on purpose.
create policy wearable_days_own_read on public.wearable_days for select using (client_id = auth.uid());
create policy wearable_days_own_insert on public.wearable_days for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy wearable_days_own_update on public.wearable_days for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy wearable_days_own_delete on public.wearable_days for delete using (client_id = auth.uid());

/* ---------- workouts imported from the health app ---------- */

create table public.imported_workouts (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  external_id text not null check (char_length(external_id) between 1 and 200),
  workout_date date not null,
  started_at timestamptz not null,
  duration_min numeric not null check (duration_min between 0 and 1440),
  activity text not null check (activity in ('run', 'walk', 'hike', 'ride', 'swim', 'row', 'strength', 'hiit', 'yoga', 'pilates', 'dance', 'class', 'other')),
  active_kcal numeric check (active_kcal between 0 and 20000),
  distance_m numeric check (distance_m between 0 and 1000000),
  avg_hr numeric check (avg_hr between 20 and 250),
  max_hr numeric check (max_hr between 20 and 250),
  source text not null check (source in ('apple_health', 'health_connect')),
  source_app text check (char_length(source_app) <= 120),
  -- Follows the client's "share my read" default when imported.
  share_with_coach boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (client_id, external_id)
);
create index on public.imported_workouts (client_id, workout_date desc);
alter table public.imported_workouts enable row level security;
create policy imported_workouts_own_read on public.imported_workouts for select using (client_id = auth.uid());
create policy imported_workouts_own_insert on public.imported_workouts for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy imported_workouts_own_update on public.imported_workouts for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy imported_workouts_own_delete on public.imported_workouts for delete using (client_id = auth.uid());

-- The coach's summary of a client's shared imported workouts: no heart rate, no kcal.
create or replace function public.imported_workouts_for_coach(client uuid)
returns table (workout_date date, started_at timestamptz, activity text, duration_min numeric, distance_m numeric, source_app text)
language sql stable security definer set search_path = public as $$
  select w.workout_date, w.started_at, w.activity, w.duration_min, w.distance_m, w.source_app
    from imported_workouts w
   where w.client_id = client
     and w.share_with_coach
     and public.is_coach(w.tenant_id)
     and public.can_see_client(w.tenant_id, w.client_id)
   order by w.started_at desc
   limit 60
$$;
revoke all on function public.imported_workouts_for_coach(uuid) from public;
grant execute on function public.imported_workouts_for_coach(uuid) to authenticated;

/* ---------- the shared brief inside the shared read ---------- */

-- daily_checks.shared_read may now carry `brief` ({tone, feel, why[{source,text}], todo[], suggestLighter}),
-- already filtered on the phone (brief.ts sharedBrief). As with the read's factors, the server also strips
-- cycle reasons when that day's cycle phase wasn't shared. Same signature as 20261022010001.
create or replace function public.shared_reads_for_coach(client uuid)
returns table (check_date date, submitted_at timestamptz, shared boolean, shared_read jsonb, cycle_phase text)
language sql stable security definer set search_path = public as $$
  with base as (
    select d.*,
           case when not d.share_with_coach or d.shared_read is null then null
                when d.share_cycle then d.shared_read
                else jsonb_set(d.shared_read, '{factors}', coalesce((
                       select jsonb_agg(f) from jsonb_array_elements(d.shared_read -> 'factors') f
                        where f ->> 'kind' <> 'cycle_phase'), '[]'::jsonb))
           end as read1
      from daily_checks d
     where d.client_id = client
       and public.is_coach(d.tenant_id)
       and public.can_see_client(d.tenant_id, d.client_id)
  )
  select b.check_date,
         b.submitted_at,
         b.share_with_coach,
         case when b.read1 is null or b.share_cycle or jsonb_typeof(b.read1 -> 'brief' -> 'why') is distinct from 'array' then b.read1
              else jsonb_set(b.read1, '{brief,why}', coalesce((
                     select jsonb_agg(r) from jsonb_array_elements(b.read1 -> 'brief' -> 'why') r
                      where r ->> 'source' <> 'cycle'), '[]'::jsonb))
         end,
         case when b.share_with_coach and b.share_cycle then b.cycle_phase end
    from base b
   order by b.check_date desc
   limit 28
$$;
revoke all on function public.shared_reads_for_coach(uuid) from public;
grant execute on function public.shared_reads_for_coach(uuid) to authenticated;

/* ---------- triage: ongoing pain ---------- */

-- Full list from 20261022090001_jtbd_integration.sql plus 'pain_ongoing' (the integrator reconciles with
-- other builds that add reasons).
alter table public.triage_items drop constraint if exists triage_items_reason_code_check;
alter table public.triage_items add constraint triage_items_reason_code_check check (reason_code in (
  'payment_failed', 'parq_flag', 'form_check_waiting', 'check_in_submitted', 'unread_message', 'missed_sessions', 'churn_risk', 'new_client',
  'follow_up_due', 'sleep_short_streak', 'load_spike',
  'check_in_request',
  'pain_ongoing'
));

-- Nightly: shared pain logged on 3+ of the last 14 days, or at 6/10+, opens one item per client and region
-- ("Pain logged 3 days running: knee"). Private logs never raise anything.
create or replace function public.raise_pain_ongoing(on_day date default current_date) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
  words text;
begin
  for r in
    select tenant_id, client_id, region,
           count(distinct log_date)::int as days,
           count(distinct log_date) filter (where log_date between on_day - 2 and on_day)::int as last3,
           max(level)::int as worst
      from public.pain_logs
     where share_with_coach and level > 0 and log_date between on_day - 13 and on_day
     group by tenant_id, client_id, region
    having count(distinct log_date) >= 3 or max(level) >= 6
  loop
    words := replace(r.region, '_', ' ');
    if not exists (select 1 from triage_items t where t.tenant_id = r.tenant_id and t.client_id = r.client_id
                   and t.reason_code = 'pain_ongoing' and t.handled_at is null and t.detail ->> 'region' = r.region) then
      insert into triage_items (tenant_id, client_id, reason_code, priority, detail, since)
      values (r.tenant_id, r.client_id, 'pain_ongoing', 68,
              jsonb_build_object('count', r.days, 'region', r.region, 'text',
                case when r.last3 = 3 then format('Pain logged 3 days running: %s', words)
                     when r.days >= 3 then format('Pain logged %s of the last 14 days: %s', r.days, words)
                     else format('Pain at %s/10: %s', r.worst, words) end),
              on_day::timestamptz);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.raise_pain_ongoing(date) from public, anon, authenticated;
grant execute on function public.raise_pain_ongoing(date) to service_role;

/* ---------- offline mutations ---------- */

create or replace function public.sync_handle_brief(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
  owner uuid;
  touched int;
begin
  if kind not in ('pain.log', 'pain.delete', 'wearable.days', 'workout.import') then
    return null;
  end if;
  select m.tenant_id into tenant from memberships m
   where m.profile_id = uid and m.role = 'client' and m.status in ('active', 'paused')
   order by m.created_at desc limit 1;
  if tenant is null then
    raise exception 'You’re not a client of a coach on Spotter.' using errcode = '42501';
  end if;

  case kind
    when 'pain.log' then
      select client_id into owner from pain_logs where id = (p ->> 'painId')::uuid;
      if owner is not null and owner <> uid then
        raise exception 'That pain log isn’t yours.' using errcode = 'P0002';
      end if;
      insert into pain_logs (id, tenant_id, client_id, log_date, region, side, level, note, share_with_coach, logged_at, client_mutation_id)
      values ((p ->> 'painId')::uuid, tenant, uid, (p ->> 'date')::date, p ->> 'region', p ->> 'side', (p ->> 'level')::smallint,
              p ->> 'note', coalesce((p ->> 'shareWithCoach')::boolean, true), (p ->> 'loggedAt')::timestamptz, mid)
      on conflict (id) do update
        set log_date = excluded.log_date, region = excluded.region, side = excluded.side, level = excluded.level,
            note = excluded.note, share_with_coach = excluded.share_with_coach, logged_at = excluded.logged_at,
            client_mutation_id = excluded.client_mutation_id
        where pain_logs.client_id = uid and pain_logs.logged_at <= excluded.logged_at;
      get diagnostics touched = row_count;
      -- Nothing written and not one of the caller's own rows (RLS hides others'): someone else's id.
      if touched = 0 and not exists (select 1 from pain_logs where id = (p ->> 'painId')::uuid and client_id = uid) then
        raise exception 'That pain log isn’t yours.' using errcode = 'P0002';
      end if;
      return tenant;

    when 'pain.delete' then
      -- Idempotent: deleting a log that's already gone (or never synced) is fine; others' logs are untouched.
      delete from pain_logs where id = (p ->> 'painId')::uuid and client_id = uid;
      return tenant;

    when 'wearable.days' then
      insert into wearable_days (tenant_id, client_id, day, source, sleep_hours, hrv_ms, resting_hr, active_kcal)
      select tenant, uid, (d ->> 'date')::date, d ->> 'source', (d ->> 'sleepHours')::numeric, (d ->> 'hrvMs')::numeric,
             (d ->> 'restingHr')::numeric, (d ->> 'activeKcal')::numeric
        from jsonb_array_elements(p -> 'days') d
      on conflict (client_id, day, source) do update
        set sleep_hours = excluded.sleep_hours, hrv_ms = excluded.hrv_ms, resting_hr = excluded.resting_hr,
            active_kcal = excluded.active_kcal, updated_at = now();
      return tenant;

    when 'workout.import' then
      insert into imported_workouts (tenant_id, client_id, external_id, workout_date, started_at, duration_min, activity,
                                     active_kcal, distance_m, avg_hr, max_hr, source, source_app, share_with_coach)
      select tenant, uid, w ->> 'externalId', (w ->> 'date')::date, (w ->> 'startedAt')::timestamptz, (w ->> 'durationMin')::numeric,
             w ->> 'activity', (w ->> 'activeKcal')::numeric, (w ->> 'distanceM')::numeric, (w ->> 'avgHr')::numeric,
             (w ->> 'maxHr')::numeric, w ->> 'source', w ->> 'sourceApp', coalesce((w ->> 'shareWithCoach')::boolean, true)
        from jsonb_array_elements(p -> 'workouts') w
      on conflict (client_id, external_id) do update
        set workout_date = excluded.workout_date, started_at = excluded.started_at, duration_min = excluded.duration_min,
            activity = excluded.activity, active_kcal = excluded.active_kcal, distance_m = excluded.distance_m,
            avg_hr = excluded.avg_hr, max_hr = excluded.max_hr, source = excluded.source, source_app = excluded.source_app,
            share_with_coach = excluded.share_with_coach, updated_at = now();
      return tenant;
  end case;
end $$;

/* ---------- account deletion ---------- */

-- Same as 20261021080001_integration_fixes.sql, plus this build's tables (and daily_checks, which the
-- profile cascade never reaches because profiles aren't deleted).
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m record;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  perform set_config('spotter.deleting_account', uid::text, true);
  for m in select tenant_id from memberships where profile_id = uid loop
    insert into audit_log (tenant_id, actor_id, action, target) values (m.tenant_id, uid, 'account.delete', uid::text);
  end loop;
  delete from sessions where client_id = uid;              -- cascades to logged sets and PRs
  delete from intake_responses where client_id = uid;
  delete from devices where profile_id = uid;
  delete from notification_settings where profile_id = uid;
  delete from push_outbox where profile_id = uid;
  delete from daily_checks where client_id = uid;
  delete from pain_logs where client_id = uid;
  delete from wearable_days where client_id = uid;
  delete from imported_workouts where client_id = uid;
  update messages set body = null, media_path = null, link = null where sender_id = uid;
  update memberships set status = 'ended' where profile_id = uid;
  update profiles set full_name = 'Deleted user', avatar_url = null where id = uid;
end $$;
grant execute on function public.delete_my_account() to authenticated;
