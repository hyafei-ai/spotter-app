-- Retention (owner job): members to talk to, hand to a coach, kept after a check-in.
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

-- Fixtures: client A7 (coached by the owner) with a past-due monthly subscription, and a check-in template.
insert into profiles (id, full_name) values ('a0000000-0000-7000-8000-0000000000c7', 'Client A7');
insert into memberships (tenant_id, profile_id, role, assigned_coach_id)
values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c7', 'client', 'a0000000-0000-7000-8000-0000000000a1');
insert into subscriptions (tenant_id, client_id, plan_kind, price_cents, currency, status, stripe_subscription_id, started_at)
values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c7', 'monthly', 16000, 'usd', 'past_due', 'sub_ret_c2', now() - interval '200 days');
insert into check_in_templates (tenant_id, fields) values ('a0000000-0000-7000-8000-000000000000', '{"weight": true}')
on conflict do nothing;
update memberships set created_at = now() - interval '200 days', last_app_open_at = now() - interval '9 days'
 where tenant_id = 'a0000000-0000-7000-8000-000000000000' and role = 'client';

-- ---------- who can read the inputs ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check((select count(*) from public.members_at_risk('a0000000-0000-7000-8000-000000000000')) >= 1, 'the owner gets a row per active member');
select pg_temp.check(
  (select sub_status = 'past_due' and price_cents = 16000 and jsonb_array_length(weeks) = 4 and check_ins_missed = 4
     and ease_reads_recent = 0
   from public.members_at_risk('a0000000-0000-7000-8000-000000000000') where client_id = 'a0000000-0000-7000-8000-0000000000c7'),
  'inputs carry 4 weeks, payment status, missed check-ins, and zero easy-day reads without daily checks');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
do $$ begin
  perform public.members_at_risk('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: assistant read members to talk to';
exception when insufficient_privilege then raise notice 'ok - an assistant can’t call members_at_risk';
end $$;
do $$ begin
  perform public.kept_summary('a0000000-0000-7000-8000-000000000000', extract(year from now())::int);
  raise exception 'FAILED: assistant read kept summary';
exception when insufficient_privilege then raise notice 'ok - an assistant can’t call kept_summary';
end $$;
do $$ begin
  perform public.member_risk_inputs('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: assistant read risk inputs';
exception when insufficient_privilege then raise notice 'ok - an assistant can’t read risk inputs';
end $$;
do $$ begin
  perform public.hand_to_coach('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'a0000000-0000-7000-8000-0000000000a2', 'No session in 12 days');
  raise exception 'FAILED: assistant asked for a check-in';
exception when insufficient_privilege then raise notice 'ok - only the owner can ask a coach to check in';
end $$;
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c7');
do $$ begin
  perform public.members_at_risk('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: client read members to talk to';
exception when insufficient_privilege then raise notice 'ok - a client can’t call members_at_risk';
end $$;
do $$ begin
  perform public.kept_summary('a0000000-0000-7000-8000-000000000000', 2026);
  raise exception 'FAILED: client read kept summary';
exception when insufficient_privilege then raise notice 'ok - a client can’t call kept_summary';
end $$;
reset role;

-- Snapshots are owner-only.
insert into member_risk_snapshots (tenant_id, client_id, taken_on, level, points, reasons)
values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c7', current_date, 'medium', 3, '{"Payment failed"}');
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from member_risk_snapshots) = 0, 'an assistant can’t read risk snapshots');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c7');
select pg_temp.check((select count(*) from member_risk_snapshots) = 0, 'a client can’t read their own risk snapshot');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check((select count(*) from member_risk_snapshots) = 1, 'the owner reads risk snapshots');
reset role;

-- ---------- hand to a coach ----------
-- Client A2 is the owner's own client; ask the assistant (not their coach) to check in.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
do $$ begin
  perform public.hand_to_coach('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c7', 'a0000000-0000-7000-8000-0000000000a2', 'At risk of churning');
  raise exception 'FAILED: risk wording accepted';
exception when invalid_parameter_value then raise notice 'ok - risk wording is refused for the coach-facing line';
end $$;
create temp table iv_id as select public.hand_to_coach('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c7',
  'a0000000-0000-7000-8000-0000000000a2', 'Payment failed', 'Be gentle, new baby') as id;
grant select on iv_id to authenticated;
select pg_temp.check(
  (select detail ->> 'text' from triage_items where reason_code = 'check_in_request') = 'Owner asked you to check in: payment failed',
  'handing off creates a coach triage item worded as a request');
select pg_temp.check(
  not exists (select 1 from triage_items where reason_code = 'check_in_request' and (detail::text ~* 'churn|risk')),
  'the coach-facing item never mentions churn or risk');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check(
  (select count(*) from triage_items where reason_code = 'check_in_request' and client_id = 'a0000000-0000-7000-8000-0000000000c7') = 1,
  'the addressed coach sees the request even for a client they don’t coach');
select pg_temp.check((select count(*) from interventions) = 1, 'the addressed coach can read the intervention');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c7');
select pg_temp.check((select count(*) from interventions) = 0, 'a client never sees interventions');
select pg_temp.check((select count(*) from triage_items) = 0, 'a client never sees triage items');
do $$ begin
  perform public.complete_check_in((select id from iv_id), 'call');
  raise exception 'FAILED: client completed a check-in';
exception when insufficient_privilege then raise notice 'ok - a client can’t complete a check-in';
end $$;
reset role;

-- The coach marks it handled with what they did.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select public.complete_check_in((select id from iv_id), 'call', 'Card expired, sent the billing link');
reset role;
select pg_temp.check(
  (select action = 'call' and done_at is not null and done_by = 'a0000000-0000-7000-8000-0000000000a2' from interventions),
  'handling records the date and the action');
select pg_temp.check(
  (select handled_at is not null from triage_items where reason_code = 'check_in_request'),
  'the request leaves the coach’s list');

-- ---------- kept after 60 days ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check(
  (select outcome = 'pending' and still_active from public.kept_summary('a0000000-0000-7000-8000-000000000000', extract(year from now())::int)),
  'a member still paying is pending before day 60');
reset role;
update interventions set done_at = now() - interval '59 days', requested_at = now() - interval '60 days';
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check(
  (select outcome = 'pending' from public.kept_summary('a0000000-0000-7000-8000-000000000000', extract(year from now() - interval '59 days')::int)),
  'still pending on day 59');
reset role;
update interventions set done_at = now() - interval '60 days';
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check(
  (select outcome = 'kept' and left_on is null from public.kept_summary('a0000000-0000-7000-8000-000000000000', extract(year from now() - interval '60 days')::int)),
  'kept once still active 60 days after the check-in');
reset role;
update subscriptions set status = 'canceled', canceled_at = now() - interval '5 days' where stripe_subscription_id = 'sub_ret_c2';
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check(
  (select outcome = 'left' and left_on = (now() - interval '5 days')::date
   from public.kept_summary('a0000000-0000-7000-8000-000000000000', extract(year from now() - interval '60 days')::int)),
  'left when the subscription ended, with the date');
reset role;

rollback;
