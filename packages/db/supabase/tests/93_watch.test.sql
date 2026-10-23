-- Apple Watch: a session logged on the watch syncs its heart-rate summary; the client's own coach sees it while
-- the client shares it, "Only you" hides it (past and future), and no one can attach a summary to someone
-- else's session.
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

-- Client A1 syncs a watch session: start, one set, finish, then the summary, in one push.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009301","createdAt":"2026-10-26T18:00:00Z","kind":"session.start",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000093a1","programDayId":"a0000000-0000-7000-8000-000000000103","scheduledDate":"2026-10-26","startedAt":"2026-10-26T18:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000009302","createdAt":"2026-10-26T18:05:00Z","kind":"set.log",
   "payload":{"id":"01900000-0000-7000-8000-0000000093b1","sessionId":"01900000-0000-7000-8000-0000000093a1","programExerciseId":"a0000000-0000-7000-8000-000000000104","exerciseId":"back-squat","setIndex":0,"weightKg":80,"reps":8,"rpe":8,"durationS":null,"distanceM":null,"loggedAt":"2026-10-26T18:05:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000009303","createdAt":"2026-10-26T18:50:00Z","kind":"session.finish",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000093a1","finishedAt":"2026-10-26T18:50:00Z","feel":null,"note":null}},
  {"clientMutationId":"01900000-0000-7000-8000-000000009304","createdAt":"2026-10-26T18:52:00Z","kind":"session.watch",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000093a1","source":"apple_watch","avgHr":128,"maxHr":164,"hrrPeak":160,"hrr60":29,"hrr120":46,
              "splits":[{"kind":"station","name":"Sled push","rep":0,"sec":74,"distanceM":25,"avgHr":150,"maxHr":164}],"shareWithCoach":true,"recordedAt":"2026-10-26T18:52:00Z"}}
]$j$::jsonb) -> 'accepted') = 4, 'client syncs a watch session with its heart-rate summary');
select pg_temp.check((select hrr_60 from session_watch_summaries where session_id = '01900000-0000-7000-8000-0000000093a1') = 29, 'the client reads their own summary');
reset role;

-- Their coach (the assistant who coaches A1) sees it; a different client doesn't.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from session_watch_summaries where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 1, 'the client’s coach sees the shared summary');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from session_watch_summaries) = 0, 'another client sees nothing');
reset role;

-- A client in another tenant can't attach a summary to A1's session.
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009305","createdAt":"2026-10-26T19:00:00Z","kind":"session.watch",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000093a1","source":"apple_watch","avgHr":90,"maxHr":100,"hrrPeak":100,"hrr60":1,"hrr120":2,
              "splits":[],"shareWithCoach":true,"recordedAt":"2026-10-26T19:00:00Z"}}
]$j$::jsonb) -> 'rejected' -> 0 ->> 'reason') = 'not_found', 'someone else’s session is rejected');
reset role;
select pg_temp.check((select hrr_60 from session_watch_summaries where session_id = '01900000-0000-7000-8000-0000000093a1') = 29, 'A1’s summary is unchanged');

-- "Only you": the coach sees none; the client still reads theirs. Back on: the coach sees it again.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009306","createdAt":"2026-10-26T20:00:00Z","kind":"watch.share.set",
   "payload":{"shareWithCoach":false,"updatedAt":"2026-10-26T20:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client turns watch heart-rate sharing off');
select pg_temp.check((select count(*) from session_watch_summaries) = 1, 'the client still reads their own summary');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from session_watch_summaries where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 0, 'the coach sees none after "Only you"');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009307","createdAt":"2026-10-26T21:00:00Z","kind":"watch.share.set",
   "payload":{"shareWithCoach":true,"updatedAt":"2026-10-26T21:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client turns it back on');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from session_watch_summaries where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 1, 'the coach sees it again');
reset role;

-- Deleting the session removes its summary.
delete from sessions where id = '01900000-0000-7000-8000-0000000093a1';
select pg_temp.check((select count(*) from session_watch_summaries where session_id = '01900000-0000-7000-8000-0000000093a1') = 0, 'the summary goes with its session');
