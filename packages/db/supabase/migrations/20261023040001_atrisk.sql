-- Owner retention dashboard: live MRR at risk, a weekly trend, and the engagement inputs a coach's
-- roster needs (docs/features/at-risk.md, docs/physiology.md).
--
-- Privacy boundary: nothing in this file reads a health table (daily_checks, cycle, fuel, pain).
-- Physiology reasons are worked out on the coach's device from what the athlete shared; the owner
-- side here is engagement and money only. Easy-day reads (ease_reads) are left out on purpose, so
-- the owner figure never depends on daily checks.
--
-- The points mirror memberRisk in packages/core/src/signals.ts with easy-day reads at zero, as
-- athleteDropoutRisk (core/atrisk.ts) uses it: ≥ 5 high, 3–4 medium. Tests: tests/86_atrisk.test.sql.

-- ---------- engagement inputs (no health tables) ----------

-- Same shape and rules as member_risk_inputs (20261022030001_retention.sql) minus easy-day reads.
-- Internal: called by the functions below, never by a signed-in user directly.
create or replace function public.engagement_inputs(t uuid, today date default current_date)
returns table (
  client_id uuid,
  full_name text,
  coach_id uuid,
  joined_at timestamptz,
  weeks jsonb,
  last_app_open_at timestamptz,
  last_session_at timestamptz,
  check_ins_missed int,
  plan_kind text,
  price_cents int,
  discount_cents int,
  duration_weeks int,
  sub_status text,
  currency text
)
language sql stable security definer set search_path = public as $$
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
    case when exists (select 1 from check_in_templates ct where ct.tenant_id = t and (ct.client_id is null or ct.client_id = mb.profile_id))
      then greatest(0, least(4, ((today - mb.created_at::date) / 7)) - (
        select count(*)::int from check_ins ci where ci.client_id = mb.profile_id and ci.tenant_id = t and ci.due_date > today - 28 and ci.due_date <= today))
      else 0 end,
    sub.plan_kind, sub.price_cents, sub.discount_cents, sub.duration_weeks, sub.status, sub.currency
  from members mb
  left join lateral (
    select s.plan_kind, s.price_cents, s.discount_cents, pl.duration_weeks, s.status, s.currency
    from subscriptions s left join plans pl on pl.id = s.plan_id
    where s.tenant_id = t and s.client_id = mb.profile_id
    order by (s.status in ('active', 'trialing', 'past_due', 'unpaid', 'paused')) desc, s.started_at desc
    limit 1
  ) sub on true
$$;
revoke execute on function public.engagement_inputs(uuid, date) from public, anon, authenticated;
grant execute on function public.engagement_inputs(uuid, date) to service_role;

-- memberRisk points without easy-day reads. Days are counted from noon UTC on `today`, as toSignals does.
create or replace function public.engagement_points(
  weeks jsonb, last_open timestamptz, last_session timestamptz, missed int, payment_issue boolean, joined timestamptz, today date
) returns int
language plpgsql immutable set search_path = public as $$
declare
  noon timestamptz := (today + time '12:00') at time zone 'UTC';
  early numeric[] := '{}';
  late numeric[] := '{}';
  e numeric;
  l numeric;
  k int;
  w jsonb;
  pts int := 0;
  days_open int := case when last_open is null then null else greatest(0, floor(extract(epoch from noon - last_open) / 86400))::int end;
  days_session int := case when last_session is null then null else greatest(0, floor(extract(epoch from noon - last_session) / 86400))::int end;
  tenure int := greatest(0, floor(extract(epoch from noon - joined) / 86400))::int;
begin
  for k in 0..3 loop
    w := weeks -> k;
    if w is not null and (w ->> 'planned')::int > 0 then
      if k < 2 then early := early || ((w ->> 'done')::numeric / (w ->> 'planned')::numeric);
      else late := late || ((w ->> 'done')::numeric / (w ->> 'planned')::numeric); end if;
    end if;
  end loop;
  if cardinality(early) > 0 and cardinality(late) > 0 then
    select avg(x) into e from unnest(early) x;
    select avg(x) into l from unnest(late) x;
    if e >= 0.5 and l <= e / 2 then pts := pts + 3; end if;
  end if;
  if days_session is not null and days_session >= 10 then pts := pts + 2; end if;
  if days_open is not null and days_open >= 7 then pts := pts + 2; end if;
  if coalesce(missed, 0) >= 2 then pts := pts + 1; end if;
  if payment_issue then pts := pts + 2; end if;
  if tenure < 60 and pts > 0 then pts := pts + 1; end if;
  return pts;
end $$;
revoke execute on function public.engagement_points(jsonb, timestamptz, timestamptz, int, boolean, timestamptz, date) from public, anon, authenticated;
grant execute on function public.engagement_points(jsonb, timestamptz, timestamptz, int, boolean, timestamptz, date) to service_role;

-- monthlyRevenueCents (core/grow.ts): weekly × 52/12, pay-in-full spread over its weeks, packs 0.
create or replace function public.monthly_value_cents(plan_kind text, price_cents int, discount_cents int, duration_weeks int)
returns int
language sql immutable set search_path = public as $$
  select case plan_kind
    when 'monthly' then greatest(0, coalesce(price_cents, 0) - coalesce(discount_cents, 0))
    when 'weekly' then round(greatest(0, coalesce(price_cents, 0) - coalesce(discount_cents, 0)) * 52.0 / 12)::int
    when 'pay_in_full' then case when coalesce(duration_weeks, 0) > 0
      then round(greatest(0, coalesce(price_cents, 0) - coalesce(discount_cents, 0))::numeric / duration_weeks * 52.0 / 12)::int else 0 end
    else 0 end
$$;

-- Per currency, from current engagement: live members (not paused or cancelled) with two weeks of
-- history, high (≥ 5) and medium (3–4). Members without a subscription count under the tenant's
-- plan currency with no value. Internal; mrr_at_risk and snapshot_mrr_at_risk wrap it.
create or replace function public.mrr_at_risk_for(t uuid, today date default current_date)
returns table (currency text, high_cents bigint, medium_cents bigint, total_cents bigint, members int, high_members int, medium_members int)
language sql stable security definer set search_path = public as $$
  with scored as (
    select
      coalesce(i.currency, (select pl.currency from plans pl where pl.tenant_id = t order by pl.created_at limit 1), 'usd') as cur,
      public.monthly_value_cents(i.plan_kind, i.price_cents, i.discount_cents, i.duration_weeks) as value,
      public.engagement_points(i.weeks, i.last_app_open_at, i.last_session_at, i.check_ins_missed,
                               coalesce(i.sub_status in ('past_due', 'unpaid'), false), i.joined_at, today) as pts
    from public.engagement_inputs(t, today) i
    where (i.sub_status is null or i.sub_status not in ('canceled', 'paused'))
      and ((today + time '12:00') at time zone 'UTC') - i.joined_at >= interval '14 days'
  )
  select cur,
         coalesce(sum(value) filter (where pts >= 5), 0)::bigint,
         coalesce(sum(value) filter (where pts between 3 and 4), 0)::bigint,
         coalesce(sum(value), 0)::bigint,
         count(*)::int,
         (count(*) filter (where pts >= 5))::int,
         (count(*) filter (where pts between 3 and 4))::int
  from scored
  where pts >= 3
  group by cur
  order by 4 desc, 1
$$;
revoke execute on function public.mrr_at_risk_for(uuid, date) from public, anon, authenticated;
grant execute on function public.mrr_at_risk_for(uuid, date) to service_role;

-- ---------- owner: live MRR at risk ----------

create or replace function public.mrr_at_risk(tenant uuid)
returns table (currency text, high_cents bigint, medium_cents bigint, total_cents bigint, members int, high_members int, medium_members int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner(tenant) then raise exception 'Only the owner can see this.' using errcode = '42501'; end if;
  return query select * from public.mrr_at_risk_for(tenant, current_date);
end $$;
revoke execute on function public.mrr_at_risk(uuid) from public, anon;
grant execute on function public.mrr_at_risk(uuid) to authenticated;

-- ---------- weekly snapshots ----------

create table public.mrr_at_risk_snapshots (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Monday of the week (riskWeekStart in core/atrisk.ts).
  week_start date not null check (extract(isodow from week_start) = 1),
  currency text not null check (currency in ('usd', 'gbp', 'eur', 'cad', 'aud')),
  high_cents bigint not null default 0 check (high_cents >= 0),
  medium_cents bigint not null default 0 check (medium_cents >= 0),
  members int not null default 0 check (members >= 0),
  created_at timestamptz not null default now(),
  primary key (tenant_id, week_start, currency)
);
alter table public.mrr_at_risk_snapshots enable row level security;
-- Owner reads; nobody signed in writes (no insert/update/delete policy). The weekly job uses the service role.
create policy mrr_snapshots_owner_read on public.mrr_at_risk_snapshots for select using (public.is_owner(tenant_id));

-- Weekly job: one row per tenant and currency for the week `on_day` falls in. Re-running the same
-- week replaces it. Returns rows written. Service role only. Not scheduled yet; on hosted Supabase:
--   select cron.schedule('mrr-at-risk-weekly', '17 4 * * 1', $$ select public.snapshot_mrr_at_risk(current_date) $$);
create or replace function public.snapshot_mrr_at_risk(on_day date default current_date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  ws date := date_trunc('week', on_day)::date;
  n int := 0;
  k int;
  r record;
begin
  for r in select t.id from tenants t loop
    insert into mrr_at_risk_snapshots (tenant_id, week_start, currency, high_cents, medium_cents, members)
    select r.id, ws, m.currency, m.high_cents, m.medium_cents, m.members from public.mrr_at_risk_for(r.id, on_day) m
    where m.currency in ('usd', 'gbp', 'eur', 'cad', 'aud')
    on conflict (tenant_id, week_start, currency) do update
      set high_cents = excluded.high_cents, medium_cents = excluded.medium_cents, members = excluded.members, created_at = now();
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;
revoke execute on function public.snapshot_mrr_at_risk(date) from public, anon, authenticated;
grant execute on function public.snapshot_mrr_at_risk(date) to service_role;

-- ---------- coach: engagement inputs for their own roster ----------

-- The engagement side of a coach's "Needs attention" list: the clients they can see (owner: all;
-- assistant: assigned), with no money and no health data. Physiology is added on the device from
-- what each athlete shared.
create or replace function public.client_engagement_inputs(t uuid)
returns table (
  client_id uuid, full_name text, coach_id uuid, joined_at timestamptz, weeks jsonb,
  last_app_open_at timestamptz, last_session_at timestamptz, check_ins_missed int, sub_status text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_coach(t) then raise exception 'Only coaches can see this.' using errcode = '42501'; end if;
  return query
  select i.client_id, i.full_name, i.coach_id, i.joined_at, i.weeks, i.last_app_open_at, i.last_session_at, i.check_ins_missed, i.sub_status
  from public.engagement_inputs(t, current_date) i
  where public.can_see_client(t, i.client_id);
end $$;
revoke execute on function public.client_engagement_inputs(uuid) from public, anon;
grant execute on function public.client_engagement_inputs(uuid) to authenticated;
