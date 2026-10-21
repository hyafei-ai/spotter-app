-- Coach memory: follow-ups and private notes stay with the coach; due follow-ups, load spikes and
-- short-sleep streaks reach triage.
\set ON_ERROR_STOP 1

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- ---------- writing ----------
-- The assistant (a2) coaches c1; the owner (a1) coaches c2.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
insert into follow_ups (id, tenant_id, coach_id, client_id, text, due_on) values
  ('a0000000-0000-7000-8000-000000000811', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000a2',
   'a0000000-0000-7000-8000-0000000000c1', 'Ask about knee', current_date + 3);
insert into coach_notes (tenant_id, coach_id, client_id, body) values
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000a2', 'a0000000-0000-7000-8000-0000000000c1', 'Travelling 3–10 Nov');
select pg_temp.check((select count(*) from follow_ups where coach_id = 'a0000000-0000-7000-8000-0000000000a2') = 1, 'an assistant can add a follow-up for their client');
do $$ begin
  insert into follow_ups (tenant_id, coach_id, client_id, text, due_on)
  values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000a2', 'a0000000-0000-7000-8000-0000000000c2', 'x', current_date);
  raise exception 'FAILED: assistant wrote a follow-up for a client they don’t coach';
exception when insufficient_privilege then raise notice 'ok - an assistant can’t add follow-ups for clients they don’t coach';
end $$;
do $$ begin
  insert into coach_notes (tenant_id, coach_id, client_id, body)
  values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000a1', 'a0000000-0000-7000-8000-0000000000c1', 'x');
  raise exception 'FAILED: note written under someone else’s name';
exception when insufficient_privilege then raise notice 'ok - a note can’t be written under another coach’s name';
end $$;
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
insert into coach_notes (tenant_id, coach_id, client_id, body) values
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000a1', 'a0000000-0000-7000-8000-0000000000c1', 'Owner note on c1');
select pg_temp.check((select count(*) from follow_ups where id = 'a0000000-0000-7000-8000-000000000811') = 1, 'the owner can read an assistant’s follow-ups');
select pg_temp.check((select count(*) from coach_notes where coach_id = 'a0000000-0000-7000-8000-0000000000a2') = 1, 'the owner can read an assistant’s notes');
reset role;

-- ---------- reading ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check(not exists (select 1 from coach_notes where coach_id = 'a0000000-0000-7000-8000-0000000000a1'), 'an assistant doesn’t see the owner’s notes');
select pg_temp.check((select count(*) from coach_notes) = 1, 'an assistant sees only their own notes on their clients');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from follow_ups) = 0, 'a client can never read follow-ups about them');
select pg_temp.check((select count(*) from coach_notes) = 0, 'a client can never read notes about them');
do $$ begin
  insert into coach_notes (tenant_id, coach_id, client_id, body)
  values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'a0000000-0000-7000-8000-0000000000c1', 'x');
  raise exception 'FAILED: client wrote a coach note';
exception when insufficient_privilege then raise notice 'ok - a client can’t write coach notes';
end $$;
reset role;

select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from follow_ups) = 0 and (select count(*) from coach_notes) = 0, 'another business sees nothing');
reset role;

-- ---------- follow-ups reach triage ----------
select pg_temp.check(not exists (select 1 from triage_items where reason_code = 'follow_up_due'), 'a follow-up isn’t in triage before its date');
select pg_temp.check(public.raise_due_follow_ups(current_date + 3) = 1, 'the nightly job raises a follow-up on its date');
select pg_temp.check(public.raise_due_follow_ups(current_date + 3) = 0, 'and never twice');

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
insert into follow_ups (id, tenant_id, coach_id, client_id, text, due_on) values
  ('a0000000-0000-7000-8000-000000000812', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000a2',
   'a0000000-0000-7000-8000-0000000000c1', 'How was the wedding?', current_date);
select pg_temp.check(
  (select detail ->> 'text' from triage_items where reason_code = 'follow_up_due' and detail ->> 'follow_up_id' = 'a0000000-0000-7000-8000-000000000812') = 'How was the wedding?',
  'a follow-up due today shows up in the coach’s triage with its text');
update triage_items set handled_at = now(), handled_by = 'a0000000-0000-7000-8000-0000000000a2'
 where reason_code = 'follow_up_due' and detail ->> 'follow_up_id' = 'a0000000-0000-7000-8000-000000000812';
select pg_temp.check((select done_at is not null from follow_ups where id = 'a0000000-0000-7000-8000-000000000812'), 'marking it handled completes the follow-up');
update follow_ups set done_at = now() where id = 'a0000000-0000-7000-8000-000000000811';
select pg_temp.check(not exists (select 1 from triage_items where reason_code = 'follow_up_due' and handled_at is null), 'completing a follow-up clears its triage item');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
do $$ begin
  perform public.raise_due_follow_ups(current_date);
  raise exception 'FAILED: a client ran the nightly job';
exception when insufficient_privilege then raise notice 'ok - only the service role runs the nightly job';
end $$;
reset role;

-- ---------- load spikes (far-future window so other tests' sessions don't count) ----------
-- c1: 45 min at feel 3 (RPE 7) twice a week for three weeks, then five sessions in the last week.
insert into sessions (id, tenant_id, client_id, scheduled_date, started_at, finished_at, feel)
select gen_random_uuid(), 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', d,
       d::timestamptz, d::timestamptz + interval '45 minutes', 3
  from unnest(array['2030-01-04', '2030-01-07', '2030-01-11', '2030-01-14', '2030-01-18', '2030-01-21',
                    '2030-01-25', '2030-01-26', '2030-01-27', '2030-01-28', '2030-01-29']::date[]) d;
select pg_temp.check(public.raise_load_spikes('2030-01-31') = 1, 'a jump in training load reaches triage');
select pg_temp.check((select detail ->> 'text' from triage_items where reason_code = 'load_spike' and handled_at is null) like 'Training load this week is %× their recent average',
  'in plain words');
select pg_temp.check(public.raise_load_spikes('2030-01-31') = 0, 'and only once while it’s open');
select pg_temp.check(public.raise_load_spikes('2030-01-20') = 0, 'a steady week isn’t flagged');
select pg_temp.check(public.raise_sleep_streaks(current_date) >= 0, 'the sleep-streak job runs with or without daily checks');
