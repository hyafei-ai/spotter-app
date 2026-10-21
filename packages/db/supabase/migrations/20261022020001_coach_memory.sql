-- Coach memory (docs/jtbd.md, coach job; docs/features/coach-memory.md).
-- Follow-ups ("remind me") and timestamped private notes, both coach-private: the coach who wrote
-- them and the business owner can read them, never the client. Plus triage reasons for due
-- follow-ups, short-sleep streaks and training-load spikes, raised by functions the nightly job calls.

-- ---------- triage reasons (additive) ----------

alter table public.triage_items drop constraint if exists triage_items_reason_code_check;
alter table public.triage_items add constraint triage_items_reason_code_check check (reason_code in (
  'payment_failed', 'parq_flag', 'form_check_waiting', 'check_in_submitted', 'unread_message', 'missed_sessions', 'churn_risk', 'new_client',
  'follow_up_due', 'sleep_short_streak', 'load_spike'
));

-- ---------- tables ----------

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  due_on date not null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.follow_ups (tenant_id, due_on) where done_at is null;
create index on public.follow_ups (client_id, due_on);

-- No private-notes table existed before this (the coach app kept one note per client on device).
create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.coach_notes (client_id, created_at desc);

create trigger touch_updated_at before update on public.follow_ups for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.coach_notes for each row execute function public.touch_updated_at();

-- ---------- RLS: the writer (while they can still see the client) and the owner; never the client ----------

alter table public.follow_ups enable row level security;
alter table public.coach_notes enable row level security;

create policy follow_ups_read on public.follow_ups for select using (
  public.is_coach(tenant_id) and ((coach_id = auth.uid() and public.can_see_client(tenant_id, client_id)) or public.is_owner(tenant_id))
);
create policy follow_ups_write on public.follow_ups for insert with check (
  coach_id = auth.uid() and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id) and client_id <> auth.uid()
);
create policy follow_ups_update on public.follow_ups for update
  using (coach_id = auth.uid() and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id))
  with check (coach_id = auth.uid() and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));
create policy follow_ups_delete on public.follow_ups for delete using (coach_id = auth.uid() and public.is_coach(tenant_id));

create policy coach_notes_read on public.coach_notes for select using (
  public.is_coach(tenant_id) and ((coach_id = auth.uid() and public.can_see_client(tenant_id, client_id)) or public.is_owner(tenant_id))
);
create policy coach_notes_write on public.coach_notes for insert with check (
  coach_id = auth.uid() and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id) and client_id <> auth.uid()
);
create policy coach_notes_update on public.coach_notes for update
  using (coach_id = auth.uid() and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id))
  with check (coach_id = auth.uid() and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));
create policy coach_notes_delete on public.coach_notes for delete using (coach_id = auth.uid() and public.is_coach(tenant_id));

-- ---------- follow-ups → triage ----------

-- One open triage item per due follow-up, carrying its text ("Follow-up: Ask about knee").
create or replace function public.raise_follow_up(f public.follow_ups, on_day date default current_date) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if f.done_at is not null or f.due_on > on_day then return false; end if;
  if exists (select 1 from triage_items t where t.tenant_id = f.tenant_id and t.reason_code = 'follow_up_due'
             and t.handled_at is null and t.detail ->> 'follow_up_id' = f.id::text) then
    return false;
  end if;
  insert into triage_items (tenant_id, client_id, reason_code, priority, detail, since)
  values (f.tenant_id, f.client_id, 'follow_up_due', 65,
          jsonb_build_object('follow_up_id', f.id, 'text', f.text, 'coach_id', f.coach_id), f.due_on::timestamptz);
  return true;
end $$;

create or replace function public.follow_up_triage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.done_at is not null then
    update triage_items set handled_at = coalesce(handled_at, new.done_at), handled_by = coalesce(handled_by, new.coach_id)
     where tenant_id = new.tenant_id and reason_code = 'follow_up_due' and handled_at is null and detail ->> 'follow_up_id' = new.id::text;
  else
    perform public.raise_follow_up(new);
  end if;
  return new;
end $$;
create trigger follow_up_triage after insert or update of due_on, done_at, text on public.follow_ups
  for each row execute function public.follow_up_triage();

-- Marking the triage item handled completes the follow-up.
create or replace function public.follow_up_handled() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update follow_ups set done_at = new.handled_at
   where id = (new.detail ->> 'follow_up_id')::uuid and done_at is null;
  return new;
end $$;
create trigger follow_up_handled after update of handled_at on public.triage_items
  for each row when (new.reason_code = 'follow_up_due' and new.handled_at is not null and old.handled_at is null)
  execute function public.follow_up_handled();

-- ---------- nightly job ----------
-- The nightly job (service role) runs, for each day:
--   select public.raise_due_follow_ups(current_date);
--   select public.raise_load_spikes(current_date);
--   select public.raise_sleep_streaks(current_date);
-- Each returns how many triage items it opened and never opens a second one while one is still open.

create or replace function public.raise_due_follow_ups(on_day date default current_date) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  f follow_ups;
begin
  for f in select * from follow_ups where done_at is null and due_on <= on_day loop
    if public.raise_follow_up(f, on_day) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Training load as in packages/core/src/signals.ts: session RPE (from "how did it feel") × minutes,
-- last 7 days against the 28-day weekly average, a spike at 1.5× or more, and only once there are
-- 21 days of history.
create or replace function public.raise_load_spikes(on_day date default current_date) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
begin
  for r in
    with s as (
      select tenant_id, client_id, coalesce(scheduled_date, started_at::date) as d,
             greatest(0, round(extract(epoch from (finished_at - started_at)) / 60))
             * case feel when 1 then 9 when 2 then 8 when 3 then 7 when 4 then 6 when 5 then 5 else 7 end as load
        from sessions
       where finished_at is not null and coalesce(scheduled_date, started_at::date) <= on_day
    ), per as (
      select tenant_id, client_id, min(d) as first_day,
             sum(load) filter (where on_day - d < 7) as acute,
             sum(load) filter (where on_day - d < 28) / 4.0 as chronic
        from s group by tenant_id, client_id
    )
    select tenant_id, client_id, round(acute / chronic, 2) as ratio
      from per
     where on_day - first_day >= 21 and chronic > 0 and acute / chronic >= 1.5
  loop
    if not exists (select 1 from triage_items t where t.tenant_id = r.tenant_id and t.client_id = r.client_id
                   and t.reason_code = 'load_spike' and t.handled_at is null) then
      insert into triage_items (tenant_id, client_id, reason_code, priority, detail, since)
      values (r.tenant_id, r.client_id, 'load_spike', 42,
              jsonb_build_object('ratio', r.ratio, 'text', format('Training load this week is %s× their recent average', r.ratio)), on_day::timestamptz);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Short sleep (under 6.5 h, SHORT_SLEEP_HOURS) on each of the last three days, from shared daily
-- checks only. The daily_checks table belongs to the athlete daily-check build; until it exists this
-- returns 0. INTEGRATOR: align the column names (client_id, date, sleep_hours, share_with_coach).
create or replace function public.raise_sleep_streaks(on_day date default current_date) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
begin
  if to_regclass('public.daily_checks') is null then return 0; end if;
  for r in execute $q$
    select tenant_id, client_id, count(*)::int as nights
      from public.daily_checks
     where share_with_coach and sleep_hours < 6.5 and date between $1 - 2 and $1
     group by tenant_id, client_id
    having count(distinct date) = 3
  $q$ using on_day
  loop
    if not exists (select 1 from triage_items t where t.tenant_id = r.tenant_id and t.client_id = r.client_id
                   and t.reason_code = 'sleep_short_streak' and t.handled_at is null) then
      insert into triage_items (tenant_id, client_id, reason_code, priority, detail, since)
      values (r.tenant_id, r.client_id, 'sleep_short_streak', 45,
              jsonb_build_object('count', r.nights, 'text', format('Short sleep %s nights running', r.nights)), on_day::timestamptz);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- The nightly functions run across tenants, so only the service role may call them.
revoke execute on function public.raise_due_follow_ups(date) from public, anon, authenticated;
revoke execute on function public.raise_load_spikes(date) from public, anon, authenticated;
revoke execute on function public.raise_sleep_streaks(date) from public, anon, authenticated;
revoke execute on function public.raise_follow_up(public.follow_ups, date) from public, anon, authenticated;
