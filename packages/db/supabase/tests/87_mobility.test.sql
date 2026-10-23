-- Mobility: the client's "Did mobility" logs sync offline, the client's coach reads them (training data, like
-- sessions), other trainers and clients don't, stretching imports are accepted, and account deletion removes them.
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

-- Client A1 (coached by assistant A2) logs two mobility sessions and imports a stretching workout.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000008701","createdAt":"2026-10-22T19:00:00Z","kind":"mobility.log",
   "payload":{"mobilityId":"01900000-0000-7000-8000-0000000087a1","date":"2026-10-22","minutes":10,"kind":"routine","routineId":"mock-hips-ankles","loggedAt":"2026-10-22T19:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000008702","createdAt":"2026-10-23T07:00:00Z","kind":"mobility.log",
   "payload":{"mobilityId":"01900000-0000-7000-8000-0000000087a2","date":"2026-10-23","minutes":20,"kind":"yoga","routineId":null,"loggedAt":"2026-10-23T07:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000008703","createdAt":"2026-10-23T07:01:00Z","kind":"workout.import",
   "payload":{"workouts":[{"externalId":"hk-stretch-1","date":"2026-10-21","startedAt":"2026-10-21T20:00:00Z","durationMin":15,"activity":"flexibility","activeKcal":40,"distanceM":null,"avgHr":null,"maxHr":null,"source":"apple_health","sourceApp":"Workout","shareWithCoach":true}]}}
]$j$::jsonb) -> 'accepted') = 3, 'client syncs mobility logs and a stretching import');
select pg_temp.check((select count(*) from mobility_sessions) = 2, 'client reads their own mobility logs');

-- An edit replaces the log; an older edit arriving late doesn't overwrite a newer one.
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000008704","createdAt":"2026-10-23T08:00:00Z","kind":"mobility.log",
   "payload":{"mobilityId":"01900000-0000-7000-8000-0000000087a2","date":"2026-10-23","minutes":25,"kind":"yoga","routineId":null,"loggedAt":"2026-10-23T08:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000008705","createdAt":"2026-10-23T06:00:00Z","kind":"mobility.log",
   "payload":{"mobilityId":"01900000-0000-7000-8000-0000000087a2","date":"2026-10-23","minutes":5,"kind":"other","routineId":null,"loggedAt":"2026-10-23T06:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 2, 'repeat syncs are accepted');
select pg_temp.check((select minutes from mobility_sessions where id = '01900000-0000-7000-8000-0000000087a2') = 25, 'the newer edit wins');
reset role;

-- Assistant A2 coaches A1 and reads the logs; owner B and client B1 see nothing and can't change them.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from mobility_sessions where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 2, 'the client’s coach reads mobility logs');
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from mobility_sessions) = 0, 'another trainer sees no mobility logs');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from mobility_sessions) = 0, 'another client of the same coach sees none');
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000008706","createdAt":"2026-10-23T09:00:00Z","kind":"mobility.log",
   "payload":{"mobilityId":"01900000-0000-7000-8000-0000000087a1","date":"2026-10-23","minutes":60,"kind":"other","routineId":null,"loggedAt":"2026-10-23T09:00:00Z"}}
]$j$::jsonb) -> 'rejected' -> 0 ->> 'reason') = 'not_found', 'another client can’t overwrite someone else’s log');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000008707","createdAt":"2026-10-23T09:01:00Z","kind":"mobility.delete",
   "payload":{"mobilityId":"01900000-0000-7000-8000-0000000087a1","deletedAt":"2026-10-23T09:01:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'a delete of someone else’s log is a no-op');
reset role;
select pg_temp.check((select minutes from mobility_sessions where id = '01900000-0000-7000-8000-0000000087a1') = 10, 'A1’s log is untouched');

-- The client deletes one of their own.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000008708","createdAt":"2026-10-23T10:00:00Z","kind":"mobility.delete",
   "payload":{"mobilityId":"01900000-0000-7000-8000-0000000087a1","deletedAt":"2026-10-23T10:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client deletes a log');
select pg_temp.check(not exists (select 1 from mobility_sessions where id = '01900000-0000-7000-8000-0000000087a1'), 'it’s gone');
reset role;

-- Account deletion removes mobility logs (rolled back so later tests keep their fixtures).
begin;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select public.delete_my_account();
reset role;
select pg_temp.check(not exists (select 1 from mobility_sessions where client_id = 'a0000000-0000-7000-8000-0000000000c1'), 'deleting the account removes mobility logs');
rollback;
delete from mobility_sessions;
delete from imported_workouts where external_id = 'hk-stretch-1';
