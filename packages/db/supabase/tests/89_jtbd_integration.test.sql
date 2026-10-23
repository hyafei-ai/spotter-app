-- Cross-build checks for the daily read, coach memory and retention features.
\set ON_ERROR_STOP 1

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- Every feature's triage reasons are accepted.
insert into triage_items (tenant_id, client_id, reason_code, priority) values
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'follow_up_due', 65),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'load_spike', 42),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'check_in_request', 75);
select pg_temp.check(true, 'memory and retention triage reasons are both allowed');

-- Three shared short nights raise one streak item; a private night doesn't count.
delete from triage_items where reason_code = 'sleep_short_streak';
insert into daily_checks (id, tenant_id, client_id, check_date, sleep_hours, share_with_coach, shared_read, submitted_at) values
  ('01900000-0000-7000-8000-00000000d101', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', date '2030-01-01', 5.5, true, '{"tone":"ease"}', now()),
  ('01900000-0000-7000-8000-00000000d102', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', date '2030-01-02', 6.0, true, '{"tone":"ease"}', now()),
  ('01900000-0000-7000-8000-00000000d103', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', date '2030-01-03', 5.8, false, null, now())
  on conflict (client_id, check_date) do nothing;
select pg_temp.check(public.raise_sleep_streaks(date '2030-01-03') = 0, 'a private night breaks the streak');
update daily_checks set share_with_coach = true, shared_read = '{"tone":"watch"}' where id = '01900000-0000-7000-8000-00000000d103';
select pg_temp.check(public.raise_sleep_streaks(date '2030-01-03') = 1, 'three shared short nights raise a streak');

-- Owners never get easy-day reads: they come from health data (20261023090001_physiology_integration.sql).
select pg_temp.check(public.ease_reads('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', date '2030-01-01', date '2030-01-04') = 0,
  'easy-day reads are not counted for owners');
