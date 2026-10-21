-- Owner job (docs/jtbd.md, docs/features/retention.md): who to check in with before they leave, a
-- coach asked to check in, and whether the member stayed. Risk rules live in packages/core
-- (signals.ts memberRisk / interventionOutcome); SQL only gathers the raw inputs, so there is one
-- copy of the logic. Coach-facing text never says "churn" or "at risk".

-- ---------- coach check-in requests in triage ----------

-- INTEGRATOR: other branches may redefine this constraint too; the final list is the union.
alter table public.triage_items drop constraint if exists triage_items_reason_code_check;
alter table public.triage_items add constraint triage_items_reason_code_check check (reason_code in (
  'payment_failed', 'parq_flag', 'form_check_waiting', 'check_in_submitted', 'unread_message', 'missed_sessions', 'churn_risk', 'new_client',
  'check_in_request'
));

-- The coach an item is addressed to (null = whoever coaches the client, as before).
alter table public.triage_items add column coach_id uuid references public.profiles (id) on delete cascade;
create index on public.triage_items (tenant_id, coach_id) where coach_id is not null;

-- Same as before for unaddressed items; an addressed item is seen by its coach and the owner only.
drop policy triage_coach on public.triage_items;
create policy triage_coach on public.triage_items for all
  using (public.is_coach(tenant_id) and (public.is_owner(tenant_id) or coach_id = auth.uid() or (coach_id is null and public.can_see_client(tenant_id, client_id))))
  with check (public.is_coach(tenant_id) and (public.is_owner(tenant_id) or coach_id = auth.uid() or (coach_id is null and public.can_see_client(tenant_id, client_id))));

-- ---------- tables ----------

-- Nightly read per member (retention-nightly edge function, service role). Owner-only.
create table public.member_risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  taken_on date not null,
  level text not null check (level in ('high', 'medium', 'low')),
  points int not null check (points >= 0),
  reasons text[] not null default '{}',
  monthly_value_cents int not null default 0 check (monthly_value_cents >= 0),
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, client_id, taken_on)
);
alter table public.member_risk_snapshots enable row level security;
create policy risk_snapshots_owner_read on public.member_risk_snapshots for select using (public.is_owner(tenant_id));

-- The owner asks a coach to check in; the coach says what they did. Written only through the RPCs below.
create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  coach_id uuid not null references public.profiles (id),
  reason text not null check (char_length(reason) between 1 and 200),
  note text check (char_length(note) <= 500),
  requested_at timestamptz not null default now(),
  triage_item_id uuid references public.triage_items (id) on delete set null,
  done_at timestamptz,
  done_by uuid references public.profiles (id),
  action text check (action in ('message', 'call', 'session', 'other')),
  action_note text check (char_length(action_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((done_at is null) = (action is null))
);
create index on public.interventions (tenant_id, requested_at desc);
create unique index interventions_one_open on public.interventions (tenant_id, client_id) where done_at is null;
alter table public.interventions enable row level security;
-- Owner and the addressed coach read; clients never (they're never the coach on a row).
create policy interventions_read on public.interventions for select
  using (public.is_owner(tenant_id) or (coach_id = auth.uid() and public.is_coach(tenant_id)));

-- ---------- raw inputs ----------

-- Easy-day reads come from the athlete daily check (another branch). Until that table exists, or if
-- it doesn't store the read's tone, this returns zeros and the signal stays quiet.
-- INTEGRATOR: adjust the column names here to match daily_checks once it lands.
create or replace function public.ease_reads(t uuid, client uuid, from_day date, to_day date) returns int
language plpgsql stable security invoker set search_path = public as $$
declare
  n int := 0;
begin
  if to_regclass('public.daily_checks') is null then return 0; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'daily_checks' and column_name = 'read_tone') then
    return 0;
  end if;
  execute 'select count(*) from public.daily_checks where tenant_id = $1 and client_id = $2 and date >= $3 and date < $4 and read_tone = ''ease'''
    into n using t, client, from_day, to_day;
  return n;
end $$;

-- Per active client: sessions planned vs done for the last 4 weeks (oldest first), last session, last
-- app open, check-ins missed, easy-day reads, and their current subscription. Owner or service role.
create or replace function public.member_risk_inputs(t uuid, today date default current_date)
returns table (
  client_id uuid,
  full_name text,
  coach_id uuid,
  joined_at timestamptz,
  weeks jsonb,
  last_app_open_at timestamptz,
  last_session_at timestamptz,
  ease_reads_recent int,
  ease_reads_before int,
  check_ins_missed int,
  plan_name text,
  plan_kind text,
  price_cents int,
  discount_cents int,
  duration_weeks int,
  sub_status text,
  started_at timestamptz,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  currency text
)
language plpgsql stable security definer set search_path = public as $$
begin
  -- auth.uid() is null only for the service role (nightly job).
  if auth.uid() is not null and not public.is_owner(t) then
    raise exception 'Only the owner can see this.' using errcode = '42501';
  end if;
  return query
  with members as (
    select m.profile_id, m.assigned_coach_id, m.created_at, m.last_app_open_at, p.full_name
    from memberships m join profiles p on p.id = m.profile_id
    where m.tenant_id = t and m.role = 'client' and m.status = 'active'
  ),
  wk as (select k, (today - 28 + 7 * k) as ws from generate_series(0, 3) k)
  select
    mb.profile_id,
    mb.full_name,
    mb.assigned_coach_id,
    mb.created_at,
    (select jsonb_agg(jsonb_build_object(
        'planned', coalesce((
          select count(*) from assignments a
          join program_weeks pw on pw.program_id = a.program_id and pw.week_index = floor((w.ws - a.start_date) / 7.0)::int
          join program_days pd on pd.week_id = pw.id
          where a.tenant_id = t and a.client_id = mb.profile_id and a.status = 'active' and w.ws >= a.start_date), 0),
        'done', (
          select count(*) from sessions s
          where s.client_id = mb.profile_id and s.tenant_id = t and s.finished_at is not null
            and s.started_at >= w.ws and s.started_at < w.ws + 7)
      ) order by w.k) from wk w),
    mb.last_app_open_at,
    (select max(s.started_at) from sessions s where s.client_id = mb.profile_id and s.tenant_id = t and s.finished_at is not null),
    public.ease_reads(t, mb.profile_id, today - 13, today + 1),
    public.ease_reads(t, mb.profile_id, today - 27, today - 13),
    case when exists (select 1 from check_in_templates ct where ct.tenant_id = t and (ct.client_id is null or ct.client_id = mb.profile_id))
      then greatest(0, least(4, ((today - mb.created_at::date) / 7)) - (
        select count(*)::int from check_ins ci where ci.client_id = mb.profile_id and ci.tenant_id = t and ci.due_date > today - 28 and ci.due_date <= today))
      else 0 end,
    sub.plan_name, sub.plan_kind, sub.price_cents, sub.discount_cents, sub.duration_weeks, sub.status,
    sub.started_at, sub.trial_ends_at, sub.canceled_at, sub.currency
  from members mb
  left join lateral (
    select pl.name as plan_name, s.plan_kind, s.price_cents, s.discount_cents, pl.duration_weeks, s.status,
           s.started_at, s.trial_ends_at, s.canceled_at, s.currency
    from subscriptions s left join plans pl on pl.id = s.plan_id
    where s.tenant_id = t and s.client_id = mb.profile_id
    order by (s.status in ('active', 'trialing', 'past_due', 'unpaid', 'paused')) desc, s.started_at desc
    limit 1
  ) sub on true;
end $$;
revoke execute on function public.member_risk_inputs(uuid, date) from public, anon;
grant execute on function public.member_risk_inputs(uuid, date) to authenticated, service_role;

-- The owner's list: inputs plus any open check-in request. Risk is computed in the app (core/retention.ts).
create or replace function public.members_at_risk(t uuid)
returns table (
  client_id uuid, full_name text, coach_id uuid, joined_at timestamptz, weeks jsonb, last_app_open_at timestamptz,
  last_session_at timestamptz, ease_reads_recent int, ease_reads_before int, check_ins_missed int, plan_name text,
  plan_kind text, price_cents int, discount_cents int, duration_weeks int, sub_status text, started_at timestamptz,
  trial_ends_at timestamptz, canceled_at timestamptz, currency text,
  open_intervention_id uuid, open_coach_id uuid, open_requested_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner(t) then raise exception 'Only the owner can see this.' using errcode = '42501'; end if;
  return query
  select i.*, iv.id, iv.coach_id, iv.requested_at
  from public.member_risk_inputs(t) i
  left join interventions iv on iv.tenant_id = t and iv.client_id = i.client_id and iv.done_at is null;
end $$;
revoke execute on function public.members_at_risk(uuid) from public, anon;
grant execute on function public.members_at_risk(uuid) to authenticated;

-- ---------- hand to a coach ----------

create or replace function public.hand_to_coach(t uuid, client uuid, coach uuid, reason text, note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  owner_first text;
  client_name text;
  line text;
  iv uuid;
  item uuid;
begin
  if not public.is_owner(t) then raise exception 'Only the owner can ask a coach to check in.' using errcode = '42501'; end if;
  if not exists (select 1 from memberships where tenant_id = t and profile_id = coach and role in ('owner', 'assistant') and status = 'active') then
    raise exception 'That coach isn’t on your team.' using errcode = 'P0002';
  end if;
  select p.full_name into client_name from memberships m join profiles p on p.id = m.profile_id
   where m.tenant_id = t and m.profile_id = client and m.role = 'client';
  if not found then raise exception 'That member isn’t in your business.' using errcode = 'P0002'; end if;
  reason := btrim(coalesce(reason, ''));
  if char_length(reason) not between 1 and 200 then raise exception 'Say why in a few words.' using errcode = '22023'; end if;
  -- Coaches see this line; keep it to plain facts.
  if reason ~* '(churn|at[ -]risk)' then raise exception 'Use the plain reason, like “No session in 12 days”.' using errcode = '22023'; end if;
  note := nullif(btrim(coalesce(note, '')), '');

  select split_part(coalesce(nullif(full_name, ''), 'Your owner'), ' ', 1) into owner_first from profiles where id = auth.uid();
  line := coalesce(owner_first, 'Your owner') || ' asked you to check in: ' || lower(left(reason, 1)) || substr(reason, 2);

  -- One open request per member: asking again moves it to the new coach.
  select id, triage_item_id into iv, item from interventions where tenant_id = t and client_id = client and done_at is null;
  if iv is not null then
    update triage_items set handled_at = now(), handled_by = auth.uid() where id = item and handled_at is null;
  end if;
  insert into triage_items (tenant_id, client_id, reason_code, detail, priority, coach_id)
  values (t, client, 'check_in_request', jsonb_build_object('text', line, 'note', note, 'clientName', client_name), 75, coach)
  returning id into item;
  if iv is null then
    insert into interventions (tenant_id, client_id, requested_by, coach_id, reason, note, triage_item_id)
    values (t, client, auth.uid(), coach, reason, note, item) returning id into iv;
  else
    update interventions set coach_id = coach, reason = hand_to_coach.reason, note = hand_to_coach.note, triage_item_id = item,
           requested_at = now(), updated_at = now() where id = iv;
  end if;
  update triage_items set detail = detail || jsonb_build_object('interventionId', iv) where id = item;
  insert into audit_log (tenant_id, actor_id, action, target, reason) values (t, auth.uid(), 'member.check_in_requested', client::text, null);
  return iv;
end $$;
revoke execute on function public.hand_to_coach(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.hand_to_coach(uuid, uuid, uuid, text, text) to authenticated;

-- The coach says what they did; the request leaves their list.
create or replace function public.complete_check_in(intervention uuid, how text, how_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r interventions;
begin
  select * into r from interventions where id = intervention;
  if not found or not (r.coach_id = auth.uid() and public.is_coach(r.tenant_id) or public.is_owner(r.tenant_id)) then
    raise exception 'That check-in isn’t yours.' using errcode = '42501';
  end if;
  if how not in ('message', 'call', 'session', 'other') then raise exception 'Pick what you did.' using errcode = '22023'; end if;
  if r.done_at is not null then return; end if;
  update interventions set done_at = now(), done_by = auth.uid(), action = how,
         action_note = nullif(btrim(coalesce(how_note, '')), ''), updated_at = now()
   where id = intervention;
  update triage_items set handled_at = now(), handled_by = auth.uid() where id = r.triage_item_id and handled_at is null;
end $$;
revoke execute on function public.complete_check_in(uuid, text, text) from public, anon;
grant execute on function public.complete_check_in(uuid, text, text) to authenticated;

-- ---------- kept after a check-in ----------

-- Requests from `yr` with whether the member is still active (a live subscription, or an active
-- membership with no subscription), when they left, and the outcome: kept = still active 60 days
-- after the coach checked in. Values are computed in the app with monthlyRevenueCents.
create or replace function public.kept_summary(t uuid, yr int)
returns table (
  intervention_id uuid, client_id uuid, client_name text, coach_id uuid, coach_name text, reason text, note text,
  requested_at timestamptz, done_at timestamptz, action text, action_note text, still_active boolean, left_on date,
  outcome text, plan_kind text, price_cents int, discount_cents int, duration_weeks int, currency text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner(t) then raise exception 'Only the owner can see this.' using errcode = '42501'; end if;
  return query
  select iv.id, iv.client_id, cp.full_name, iv.coach_id, kp.full_name, iv.reason, iv.note, iv.requested_at, iv.done_at,
         iv.action, iv.action_note, st.active, case when st.active then null else st.left_on end,
         -- Same rule as interventionOutcome (core/signals.ts, KEPT_AFTER_DAYS = 60).
         case when iv.done_at is null then 'waiting'
              when not st.active then 'left'
              when current_date - iv.done_at::date >= 60 then 'kept'
              else 'pending' end,
         sub.plan_kind, sub.price_cents, sub.discount_cents, sub.duration_weeks, sub.currency
  from interventions iv
  join profiles cp on cp.id = iv.client_id
  join profiles kp on kp.id = iv.coach_id
  left join memberships m on m.tenant_id = t and m.profile_id = iv.client_id
  left join lateral (
    select s.plan_kind, s.price_cents, s.discount_cents, pl.duration_weeks, s.currency
    from subscriptions s left join plans pl on pl.id = s.plan_id
    where s.tenant_id = t and s.client_id = iv.client_id
    order by (s.status in ('active', 'trialing', 'past_due')) desc, s.started_at desc limit 1
  ) sub on true
  cross join lateral (
    select
      coalesce(m.status = 'active', false) and (
        not exists (select 1 from subscriptions s where s.tenant_id = t and s.client_id = iv.client_id)
        or exists (select 1 from subscriptions s where s.tenant_id = t and s.client_id = iv.client_id and s.status in ('active', 'trialing', 'past_due'))
      ) as active,
      coalesce(
        (select max(s.canceled_at)::date from subscriptions s where s.tenant_id = t and s.client_id = iv.client_id),
        case when m.status in ('ended', 'paused') then m.updated_at::date end,
        current_date
      ) as left_on
  ) st
  where iv.tenant_id = t and extract(year from coalesce(iv.done_at, iv.requested_at))::int = yr
  order by coalesce(iv.done_at, iv.requested_at) desc;
end $$;
revoke execute on function public.kept_summary(uuid, int) from public, anon;
grant execute on function public.kept_summary(uuid, int) to authenticated;

-- Nightly snapshots. On hosted Supabase with pg_cron + pg_net:
--   select cron.schedule('retention-nightly', '41 3 * * *', $$
--     select net.http_post(url := current_setting('app.functions_url') || '/retention-nightly',
--                          headers := jsonb_build_object('x-cron-secret', current_setting('app.functions_secret')),
--                          body := '{}'::jsonb) $$);
