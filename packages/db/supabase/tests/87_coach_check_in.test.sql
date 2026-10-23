-- Coach logs a check-in from client detail (log_check_in), and it counts on the business view.
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

-- Fixtures: C11 is coached by the coach who owns the business (a1), C12 by the assistant (a2). Both
-- active with a monthly plan. (Fixture clients may have been deleted by earlier test files.)
insert into profiles (id, full_name) values
  ('a0000000-0000-7000-8000-0000000000cb', 'Client A11'),
  ('a0000000-0000-7000-8000-0000000000cc', 'Client A12');
insert into memberships (tenant_id, profile_id, role, assigned_coach_id) values
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cb', 'client', 'a0000000-0000-7000-8000-0000000000a1'),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cc', 'client', 'a0000000-0000-7000-8000-0000000000a2');
insert into subscriptions (tenant_id, client_id, plan_kind, price_cents, currency, status, stripe_subscription_id, started_at) values
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cb', 'monthly', 16000, 'usd', 'active', 'sub_ci_cb', now() - interval '100 days'),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cc', 'monthly', 16000, 'usd', 'active', 'sub_ci_cc', now() - interval '100 days');

-- The owner (a solo coach's everyday case) logs a check-in on their own client.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
create temp table logged as select public.log_check_in('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cb',
  'No session in 12 days', 'call', 'Busy month at work') as id;
reset role;
select pg_temp.check(
  (select coach_id = 'a0000000-0000-7000-8000-0000000000a1' and requested_by = coach_id and action = 'call' and done_at is not null
     and action_note = 'Busy month at work' from interventions where id = (select id from logged)),
  'the coach logs a done check-in on their own client');

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check(
  (select count(*) = 1 from public.kept_summary('a0000000-0000-7000-8000-000000000000', extract(year from now())::int) where outcome = 'pending' and client_id = 'a0000000-0000-7000-8000-0000000000cb'),
  'a logged check-in shows on the business view as pending');
do $$ begin
  perform public.log_check_in('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cb', 'Client at risk of churning', 'call');
  raise exception 'FAILED: risk wording accepted';
exception when invalid_parameter_value then raise notice 'ok - risk wording is refused';
end $$;
do $$ begin
  perform public.log_check_in('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cb', 'No session in 12 days', 'smoke signal');
  raise exception 'FAILED: unknown action accepted';
exception when invalid_parameter_value then raise notice 'ok - only message, call, session or other';
end $$;
reset role;

-- An assistant logs a check-in on their own client; not on someone else's.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select public.log_check_in('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cc', 'Missed 2 weekly check-ins', 'message');
do $$ begin
  perform public.log_check_in('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cb', 'No session in 12 days', 'call');
  raise exception 'FAILED: assistant logged a check-in on a client they don’t coach';
exception when insufficient_privilege then raise notice 'ok - an assistant can’t log a check-in on a client they don’t coach';
end $$;
reset role;
select pg_temp.check(
  (select count(*) = 1 from interventions where client_id = 'a0000000-0000-7000-8000-0000000000cc' and coach_id = 'a0000000-0000-7000-8000-0000000000a2' and action = 'message'),
  'the assistant’s check-in is recorded under them');

-- A client can't log one.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000cc');
do $$ begin
  perform public.log_check_in('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cc', 'Checked in', 'call');
  raise exception 'FAILED: client logged a check-in';
exception when insufficient_privilege then raise notice 'ok - a client can’t log a check-in';
end $$;
reset role;

-- Teams: the head coach asks the assistant; the assistant's "I checked in" completes that request.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
create temp table asked as select public.hand_to_coach('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cc',
  'a0000000-0000-7000-8000-0000000000a2', 'Payment failed') as id;
grant select on asked to authenticated;
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check(
  public.log_check_in('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000cc', 'Payment failed', 'session') = (select id from asked),
  'logging a check-in completes the open request instead of adding another');
reset role;
select pg_temp.check(
  (select done_at is not null and action = 'session' from interventions where id = (select id from asked))
  and (select handled_at is not null from triage_items where reason_code = 'check_in_request' and client_id = 'a0000000-0000-7000-8000-0000000000cc'),
  'the request is done and leaves the assistant’s list');

select pg_temp.check(
  (select obj_description('public.mrr_at_risk(uuid)'::regprocedure) ~ 'coach who owns the business'),
  'mrr_at_risk is documented as the business owner’s (the coach’s) view');

rollback;
