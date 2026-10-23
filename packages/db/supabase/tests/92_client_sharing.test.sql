-- Who sees what: the client's mobility switch hides every mobility log from their coach, new logs follow
-- it, turning it back on shows them again, and no one else can flip it for them.
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

-- Client A1 logs one session (no flag: shared, as before) and one marked private.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009201","createdAt":"2026-10-24T19:00:00Z","kind":"mobility.log",
   "payload":{"mobilityId":"01900000-0000-7000-8000-0000000092a1","date":"2026-10-24","minutes":10,"kind":"stretching","routineId":null,"loggedAt":"2026-10-24T19:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000009202","createdAt":"2026-10-24T20:00:00Z","kind":"mobility.log",
   "payload":{"mobilityId":"01900000-0000-7000-8000-0000000092a2","date":"2026-10-24","minutes":20,"kind":"yoga","routineId":null,"loggedAt":"2026-10-24T20:00:00Z","shareWithCoach":false}}
]$j$::jsonb) -> 'accepted') = 2, 'client syncs a shared and a private mobility log');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from mobility_sessions where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 1, 'the coach sees only the shared log');
reset role;

-- Turning sharing off hides every log.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009203","createdAt":"2026-10-24T21:00:00Z","kind":"mobility.share.set",
   "payload":{"shareWithCoach":false,"updatedAt":"2026-10-24T21:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client turns mobility sharing off');
select pg_temp.check((select count(*) from mobility_sessions) = 2, 'the client still reads both of their own logs');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from mobility_sessions where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 0, 'the coach sees none after "Only you"');
reset role;

-- Another trainer's client's switch doesn't touch A1's rows.
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009204","createdAt":"2026-10-24T21:05:00Z","kind":"mobility.share.set",
   "payload":{"shareWithCoach":true,"updatedAt":"2026-10-24T21:05:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'another client flips their own switch');
reset role;
select pg_temp.check((select count(*) from mobility_sessions where client_id = 'a0000000-0000-7000-8000-0000000000c1' and share_with_coach) = 0, 'A1’s logs stay private');

-- Back on: the coach sees both.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009205","createdAt":"2026-10-24T22:00:00Z","kind":"mobility.share.set",
   "payload":{"shareWithCoach":true,"updatedAt":"2026-10-24T22:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client turns mobility sharing back on');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from mobility_sessions where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 2, 'the coach sees both again');
reset role;

delete from mobility_sessions where id in ('01900000-0000-7000-8000-0000000092a1', '01900000-0000-7000-8000-0000000092a2');
