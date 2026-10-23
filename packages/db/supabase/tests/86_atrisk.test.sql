-- At-risk roster and MRR at risk (owner job; docs/features/at-risk.md).
-- Runs in a transaction and rolls back, so later test files see the fixtures unchanged.
\set ON_ERROR_STOP 1
begin;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- Fixtures: two new tenant-A clients, on their own (earlier test files leave other clients behind, so
-- those are ended inside this transaction, and the check-in template is removed so missed check-ins
-- don't count). Both joined 200 days ago, haven't opened the app in 9 days (+2) and have a failed
-- payment (+2): medium. Client 86c1 (the assistant's) pays weekly in GBP; client 86c2 (the owner's)
-- pays monthly in USD and also had a last session 12 days ago (+2): high.
update memberships set status = 'ended' where tenant_id = 'a0000000-0000-7000-8000-000000000000' and role = 'client';
delete from check_in_templates where tenant_id = 'a0000000-0000-7000-8000-000000000000';
insert into profiles (id, full_name) values
  ('a0000000-0000-7000-8000-0000000086c1', 'Client 86 One'),
  ('a0000000-0000-7000-8000-0000000086c2', 'Client 86 Two');
insert into memberships (tenant_id, profile_id, role, assigned_coach_id, created_at, last_app_open_at) values
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000086c1', 'client', 'a0000000-0000-7000-8000-0000000000a2', now() - interval '200 days', now() - interval '9 days'),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000086c2', 'client', 'a0000000-0000-7000-8000-0000000000a1', now() - interval '200 days', now() - interval '9 days');
insert into subscriptions (tenant_id, client_id, plan_kind, price_cents, currency, status, stripe_subscription_id, started_at) values
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000086c1', 'weekly', 4500, 'gbp', 'past_due', 'sub_atrisk_c1', now() - interval '200 days'),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000086c2', 'monthly', 16000, 'usd', 'unpaid', 'sub_atrisk_c2', now() - interval '200 days');
insert into sessions (id, tenant_id, client_id, started_at, finished_at) values
  ('a0000000-0000-7000-8000-000000000386', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000086c2', now() - interval '12 days', now() - interval '12 days' + interval '1 hour');
-- Health data that must never reach the owner's figures: a week of rough, unshared daily checks.
insert into daily_checks (id, tenant_id, client_id, check_date, sleep_hours, energy, soreness, stress, share_with_coach, submitted_at)
select gen_random_uuid(), 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000086c1', current_date - d, 4, 1, 5, 5, false, now() - d * interval '1 day'
from generate_series(1, 6) d;

-- ---------- the owner's live figure ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check((select count(*) from public.mrr_at_risk('a0000000-0000-7000-8000-000000000000')) = 2, 'one row per currency, never summed across them');
select pg_temp.check(
  (select high_cents = 16000 and medium_cents = 0 and total_cents = 16000 and members = 1 and high_members = 1
   from public.mrr_at_risk('a0000000-0000-7000-8000-000000000000') where currency = 'usd'),
  'USD: the monthly member with a failed payment, no app opens and no recent session is high');
select pg_temp.check(
  (select high_cents = 0 and medium_cents = 19500 and members = 1 and medium_members = 1
   from public.mrr_at_risk('a0000000-0000-7000-8000-000000000000') where currency = 'gbp'),
  'GBP: weekly £45 counts as £195 a month (× 52 ÷ 12), medium');
reset role;

-- Too new to read: under two weeks with the business.
update memberships set created_at = now() - interval '5 days'
 where tenant_id = 'a0000000-0000-7000-8000-000000000000' and profile_id = 'a0000000-0000-7000-8000-0000000086c1';
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check(
  not exists (select 1 from public.mrr_at_risk('a0000000-0000-7000-8000-000000000000') where currency = 'gbp'),
  'members with under two weeks of history are left out');
reset role;
update memberships set created_at = now() - interval '200 days'
 where tenant_id = 'a0000000-0000-7000-8000-000000000000' and profile_id = 'a0000000-0000-7000-8000-0000000086c1';

-- ---------- who can't ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
do $$ begin
  perform public.mrr_at_risk('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: assistant read MRR at risk';
exception when insufficient_privilege then raise notice 'ok - an assistant coach can’t call mrr_at_risk';
end $$;
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000086c1');
do $$ begin
  perform public.mrr_at_risk('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: client read MRR at risk';
exception when insufficient_privilege then raise notice 'ok - a client can’t call mrr_at_risk';
end $$;
reset role;

select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
do $$ begin
  perform public.mrr_at_risk('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: other tenant read MRR at risk';
exception when insufficient_privilege then raise notice 'ok - another tenant’s owner can’t read this tenant';
end $$;
select pg_temp.check((select count(*) from public.mrr_at_risk('b0000000-0000-7000-8000-000000000000')) = 0, 'tenant B’s owner gets only tenant B, which has nothing at risk');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
do $$ begin
  perform * from public.mrr_at_risk_for('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: internal function callable';
exception when insufficient_privilege then raise notice 'ok - the internal per-tenant function isn’t callable when signed in';
end $$;
do $$ begin
  perform * from public.engagement_inputs('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: engagement_inputs callable';
exception when insufficient_privilege then raise notice 'ok - raw engagement inputs aren’t callable when signed in';
end $$;
do $$ begin
  perform public.snapshot_mrr_at_risk(current_date);
  raise exception 'FAILED: authenticated ran the snapshot job';
exception when insufficient_privilege then raise notice 'ok - snapshot_mrr_at_risk isn’t callable by authenticated users, owner included';
end $$;
reset role;

-- ---------- privacy boundary: no health tables on the owner side ----------
select pg_temp.check(
  not exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('mrr_at_risk', 'mrr_at_risk_for', 'engagement_inputs', 'engagement_points', 'snapshot_mrr_at_risk', 'client_engagement_inputs')
      and pg_get_functiondef(p.oid) ~* '(daily_checks|ease_reads|shared_read|cycle|fuel|pain)'),
  'the owner functions never read daily checks, cycle, fuel or pain');

-- ---------- weekly snapshots ----------
set local role service_role;
select pg_temp.check(public.snapshot_mrr_at_risk(current_date) = 2, 'the weekly job writes one row per tenant and currency');
select pg_temp.check(public.snapshot_mrr_at_risk(current_date) = 2, 'running it again in the same week replaces the rows');
reset role;
select pg_temp.check(
  (select count(*) from mrr_at_risk_snapshots where week_start = date_trunc('week', current_date)::date) = 2
  and (select high_cents from mrr_at_risk_snapshots where currency = 'usd') = 16000,
  'snapshots are keyed by the Monday of the week');

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check((select count(*) from mrr_at_risk_snapshots) = 2, 'the owner reads their snapshots');
do $$ begin
  insert into mrr_at_risk_snapshots (tenant_id, week_start, currency, high_cents)
  values ('a0000000-0000-7000-8000-000000000000', date_trunc('week', current_date - 7)::date, 'usd', 1);
  raise exception 'FAILED: owner wrote a snapshot';
exception when insufficient_privilege then raise notice 'ok - nobody signed in writes snapshots';
end $$;
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from mrr_at_risk_snapshots) = 0, 'an assistant coach can’t read snapshots');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000086c1');
select pg_temp.check((select count(*) from mrr_at_risk_snapshots) = 0, 'a client can’t read snapshots');
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from mrr_at_risk_snapshots) = 0, 'another tenant’s owner can’t read them');
reset role;

-- ---------- a coach's own roster inputs ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check(
  (select array_agg(client_id::text) from public.client_engagement_inputs('a0000000-0000-7000-8000-000000000000'))
    = array['a0000000-0000-7000-8000-0000000086c1'],
  'an assistant gets engagement inputs for their assigned clients only');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check((select count(*) from public.client_engagement_inputs('a0000000-0000-7000-8000-000000000000')) = 2, 'the owner gets every client');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000086c1');
do $$ begin
  perform * from public.client_engagement_inputs('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: client read engagement inputs';
exception when insufficient_privilege then raise notice 'ok - a client can’t read roster inputs';
end $$;
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
do $$ begin
  perform * from public.client_engagement_inputs('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: other tenant read engagement inputs';
exception when insufficient_privilege then raise notice 'ok - another tenant’s coach can’t read roster inputs';
end $$;
reset role;

rollback;
