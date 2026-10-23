-- Cross-build checks for the physiology layer (docs/physiology.md).
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

-- Deleting an account removes the athlete's daily checks and fuel rows (rolled back afterwards).
begin;
insert into daily_checks (id, tenant_id, client_id, check_date, sleep_hours, share_with_coach, shared_read, submitted_at) values
  ('01900000-0000-7000-8000-00000000e101', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', date '2031-01-01', 7, false, null, now())
  on conflict (client_id, check_date) do nothing;
insert into fuel_settings (client_id, tenant_id) values ('a0000000-0000-7000-8000-0000000000c1', 'a0000000-0000-7000-8000-000000000000')
  on conflict (client_id) do nothing;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select public.delete_my_account();
reset role;
select pg_temp.check(
  not exists (select 1 from daily_checks where client_id = 'a0000000-0000-7000-8000-0000000000c1')
  and not exists (select 1 from fuel_settings where client_id = 'a0000000-0000-7000-8000-0000000000c1'),
  'deleting an account removes daily checks and fuel settings');
rollback;
