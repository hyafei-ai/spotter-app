-- Cycle tracking: the client owns every row; the assigned coach sees today's phase and the calibration summary
-- through cycle_shared_for_coach, only when shared. Nobody else sees anything.
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

-- Client A1 (coached by assistant A2) sets up tracking, privately, from the offline queue.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000901","createdAt":"2026-10-23T07:00:00Z","kind":"cycle.profile.set",
   "payload":{"mode":"natural","birthYear":1985,"shareWithCoach":false,"todayPhase":"luteal","todayPhaseOn":"2026-10-23",
     "calibrationSummary":{"method":"personal-baseline-v1","ready":true,"summary":"After 5 cycles of your own data: …","appliedPctToday":-3.5},
     "updatedAt":"2026-10-23T07:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000902","createdAt":"2026-10-23T07:00:01Z","kind":"cycle.period.upsert",
   "payload":{"periodId":"01900000-0000-7000-8000-0000000009a1","start":"2026-09-03","end":"2026-09-07","source":"manual","updatedAt":"2026-10-23T07:00:01Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000903","createdAt":"2026-10-23T07:00:02Z","kind":"cycle.period.upsert",
   "payload":{"periodId":"01900000-0000-7000-8000-0000000009a2","start":"2026-10-02","end":null,"source":"health","updatedAt":"2026-10-23T07:00:02Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000904","createdAt":"2026-10-23T07:00:03Z","kind":"cycle.period.upsert",
   "payload":{"periodId":"01900000-0000-7000-8000-0000000009a3","start":"2026-08-05","end":null,"source":"manual","updatedAt":"2026-10-23T07:00:03Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000905","createdAt":"2026-10-23T07:00:04Z","kind":"cycle.period.delete",
   "payload":{"periodId":"01900000-0000-7000-8000-0000000009a3","deletedAt":"2026-10-23T07:00:04Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000906","createdAt":"2026-10-23T07:00:05Z","kind":"cycle.symptoms.log",
   "payload":{"date":"2026-10-23","scores":{"poor_sleep":2,"joint_aches":1},"loggedAt":"2026-10-23T07:00:05Z"}}
]$j$::jsonb) -> 'accepted') = 6, 'client sends cycle changes from the offline queue');
select pg_temp.check((select count(*) from period_logs) = 2, 'a deleted period is gone, the others are kept');
select pg_temp.check((select source from period_logs where start_on = '2026-10-02') = 'health', 'imported periods keep their source');
select pg_temp.check((select (scores ->> 'poor_sleep')::int from symptom_logs where log_date = '2026-10-23') = 2, 'client reads their own symptoms');
select pg_temp.check((select not share_with_coach from cycle_profiles), 'private by default');
select pg_temp.check(not exists (select 1 from public.cycle_shared_for_coach('a0000000-0000-7000-8000-0000000000c1')), 'the client gets nothing from the coach RPC');

-- An older edit of the profile, sent late, never overwrites a newer one.
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000907","createdAt":"2026-10-22T07:00:00Z","kind":"cycle.profile.set",
   "payload":{"mode":"hormonal","birthYear":1985,"shareWithCoach":true,"todayPhase":null,"todayPhaseOn":null,"calibrationSummary":null,
     "updatedAt":"2026-10-22T07:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'an older profile edit is accepted');
select pg_temp.check((select mode = 'natural' and not share_with_coach from cycle_profiles), 'but it doesn’t overwrite the newer profile');
reset role;

-- Assistant A2 coaches A1: no access to the tables, and nothing from the RPC while A1 keeps it private.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from cycle_profiles) = 0, 'a coach can’t select cycle profiles');
select pg_temp.check((select count(*) from period_logs) = 0, 'a coach can’t select period logs');
select pg_temp.check((select count(*) from symptom_logs) = 0, 'a coach can’t select symptoms');
select pg_temp.check(not exists (select 1 from public.cycle_shared_for_coach('a0000000-0000-7000-8000-0000000000c1')), 'the coach sees nothing while it’s private');
reset role;

-- A1 turns sharing on.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000908","createdAt":"2026-10-23T08:00:00Z","kind":"cycle.profile.set",
   "payload":{"mode":"natural","birthYear":1985,"shareWithCoach":true,"todayPhase":"luteal","todayPhaseOn":"2026-10-23",
     "calibrationSummary":{"method":"personal-baseline-v1","ready":true,"summary":"After 5 cycles of your own data: …","appliedPctToday":-3.5},
     "updatedAt":"2026-10-23T08:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client turns on sharing');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check(
  (select phase = 'luteal' and (calibration_summary ->> 'appliedPctToday')::numeric = -3.5 from public.cycle_shared_for_coach('a0000000-0000-7000-8000-0000000000c1')),
  'the assigned coach sees today’s phase and the calibration summary once shared');
select pg_temp.check((select count(*) from cycle_profiles) = 0 and (select count(*) from period_logs) = 0, 'and still can’t select the tables');
reset role;

-- Owner A1 runs the business but doesn't coach this client: no cycle data.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check(not exists (select 1 from public.cycle_shared_for_coach('a0000000-0000-7000-8000-0000000000c1')), 'the owner doesn’t see a client coached by an assistant');
select pg_temp.check((select count(*) from cycle_profiles) = 0, 'the owner can’t select cycle profiles');
reset role;

-- Another tenant sees nothing; another client can't touch A1's periods.
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check(not exists (select 1 from public.cycle_shared_for_coach('a0000000-0000-7000-8000-0000000000c1')), 'another trainer sees nothing');
select pg_temp.check((select count(*) from period_logs) = 0, 'another trainer sees no periods');
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000c1');
select public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000909","createdAt":"2026-10-23T09:00:00Z","kind":"cycle.period.delete",
   "payload":{"periodId":"01900000-0000-7000-8000-0000000009a1","deletedAt":"2026-10-23T09:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000910","createdAt":"2026-10-23T09:00:01Z","kind":"cycle.period.upsert",
   "payload":{"periodId":"01900000-0000-7000-8000-0000000009a1","start":"2026-01-01","end":null,"source":"manual","updatedAt":"2026-10-23T09:00:01Z"}}
]$j$::jsonb);
reset role;
select pg_temp.check((select start_on from period_logs where id = '01900000-0000-7000-8000-0000000009a1') = '2026-09-03', 'another client can’t delete or change someone else’s period');

-- Deleting the account removes every cycle row (rolled back so later tests keep A1).
begin;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select public.delete_my_account();
reset role;
select pg_temp.check(
  not exists (select 1 from cycle_profiles where client_id = 'a0000000-0000-7000-8000-0000000000c1')
  and not exists (select 1 from period_logs where client_id = 'a0000000-0000-7000-8000-0000000000c1')
  and not exists (select 1 from symptom_logs where client_id = 'a0000000-0000-7000-8000-0000000000c1'),
  'deleting an account removes cycle data');
rollback;
select pg_temp.check((select count(*) from period_logs) = 2, 'test cleanup: account deletion rolled back');
