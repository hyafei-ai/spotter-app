-- POST /sync/push semantics: idempotency, last-write-wins per set, rejections, PRs derived by trigger.
\set ON_ERROR_STOP 1

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-7000-8000-0000000000c1', false);
set role authenticated;

-- An earlier session: 100 kg × 5 on squat, 8 pull-ups.
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000001","createdAt":"2026-10-10T17:00:00Z","kind":"session.start",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000000a1","programDayId":"a0000000-0000-7000-8000-000000000103","scheduledDate":"2026-10-10","startedAt":"2026-10-10T17:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000002","createdAt":"2026-10-10T17:10:00Z","kind":"set.log",
   "payload":{"id":"01900000-0000-7000-8000-0000000000b1","sessionId":"01900000-0000-7000-8000-0000000000a1","programExerciseId":"a0000000-0000-7000-8000-000000000104","exerciseId":"back-squat","setIndex":0,"weightKg":100,"reps":5,"rpe":8,"durationS":null,"distanceM":null,"loggedAt":"2026-10-10T17:10:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000003","createdAt":"2026-10-10T17:20:00Z","kind":"set.log",
   "payload":{"id":"01900000-0000-7000-8000-0000000000b2","sessionId":"01900000-0000-7000-8000-0000000000a1","programExerciseId":"a0000000-0000-7000-8000-000000000105","exerciseId":"pull-up","setIndex":0,"weightKg":null,"reps":8,"rpe":null,"durationS":null,"distanceM":null,"loggedAt":"2026-10-10T17:20:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000004","createdAt":"2026-10-10T18:00:00Z","kind":"session.finish",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000000a1","finishedAt":"2026-10-10T18:00:00Z","feel":4,"note":null}}
]$j$::jsonb) -> 'accepted') = 4, 'first session applies');

select pg_temp.check((select count(*) from personal_records) = 0, 'no PRs without earlier history');

-- Replaying the same batch changes nothing.
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000002","createdAt":"2026-10-10T17:10:00Z","kind":"set.log",
   "payload":{"id":"01900000-0000-7000-8000-0000000000b1","sessionId":"01900000-0000-7000-8000-0000000000a1","programExerciseId":"a0000000-0000-7000-8000-000000000104","exerciseId":"back-squat","setIndex":0,"weightKg":100,"reps":5,"rpe":8,"durationS":null,"distanceM":null,"loggedAt":"2026-10-10T17:10:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'replayed mutation is accepted again');
select pg_temp.check((select count(*) from logged_sets) = 2, 'replay does not duplicate sets');

-- Today: start, log 102.5 × 5, then an edit to 105 × 5, then a stale write (older logged_at) that must lose.
select public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000011","createdAt":"2026-10-17T17:00:00Z","kind":"session.start",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000000a2","programDayId":"a0000000-0000-7000-8000-000000000103","scheduledDate":"2026-10-17","startedAt":"2026-10-17T17:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000012","createdAt":"2026-10-17T17:10:00Z","kind":"set.log",
   "payload":{"id":"01900000-0000-7000-8000-0000000000c1","sessionId":"01900000-0000-7000-8000-0000000000a2","programExerciseId":"a0000000-0000-7000-8000-000000000104","exerciseId":"back-squat","setIndex":0,"weightKg":102.5,"reps":5,"rpe":8,"durationS":null,"distanceM":null,"loggedAt":"2026-10-17T17:10:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000013","createdAt":"2026-10-17T17:12:00Z","kind":"set.log",
   "payload":{"id":"01900000-0000-7000-8000-0000000000c2","sessionId":"01900000-0000-7000-8000-0000000000a2","programExerciseId":"a0000000-0000-7000-8000-000000000104","exerciseId":"back-squat","setIndex":0,"weightKg":105,"reps":5,"rpe":8.5,"durationS":null,"distanceM":null,"loggedAt":"2026-10-17T17:12:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000014","createdAt":"2026-10-17T17:13:00Z","kind":"set.log",
   "payload":{"id":"01900000-0000-7000-8000-0000000000c3","sessionId":"01900000-0000-7000-8000-0000000000a2","programExerciseId":"a0000000-0000-7000-8000-000000000104","exerciseId":"back-squat","setIndex":0,"weightKg":90,"reps":5,"rpe":null,"durationS":null,"distanceM":null,"loggedAt":"2026-10-17T17:05:00Z"}}
]$j$::jsonb);

select pg_temp.check((select weight from logged_sets where session_id = '01900000-0000-7000-8000-0000000000a2' and set_index = 0) = 105, 'newest logged_at wins for the same set');
select pg_temp.check((select count(*) from logged_sets where session_id = '01900000-0000-7000-8000-0000000000a2') = 1, 'one row per (session, exercise, set index)');
select pg_temp.check(exists (select 1 from personal_records where type = 'heaviest' and value = 105 and previous = 100), 'heaviest-weight PR derived from real history');

-- Undo voids the set and removes the PR it produced.
select public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000015","createdAt":"2026-10-17T17:14:00Z","kind":"set.void",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000000a2","programExerciseId":"a0000000-0000-7000-8000-000000000104","setIndex":0,"voidedAt":"2026-10-17T17:14:00Z"}}
]$j$::jsonb);
select pg_temp.check((select voided_at is not null from logged_sets where session_id = '01900000-0000-7000-8000-0000000000a2'), 'undo marks the set voided, keeps the row');
select pg_temp.check((select count(*) from personal_records where session_id = '01900000-0000-7000-8000-0000000000a2') = 0, 'voided set no longer counts as a PR');

-- Rejections: a set for a session that isn't theirs, and an unknown kind. Good mutations in the same batch still apply.
select pg_temp.check((
  with r as (select public.sync_apply($j$[
    {"clientMutationId":"01900000-0000-7000-8000-000000000021","createdAt":"2026-10-17T17:20:00Z","kind":"set.log",
     "payload":{"id":"01900000-0000-7000-8000-0000000000d1","sessionId":"a0000000-0000-7000-8000-000000000301","programExerciseId":"a0000000-0000-7000-8000-000000000104","exerciseId":"back-squat","setIndex":0,"weightKg":60,"reps":5,"rpe":null,"durationS":null,"distanceM":null,"loggedAt":"2026-10-17T17:20:00Z"}},
    {"clientMutationId":"01900000-0000-7000-8000-000000000022","createdAt":"2026-10-17T17:21:00Z","kind":"message.send",
     "payload":{"messageId":"01900000-0000-7000-8000-0000000000e1","threadId":"a0000000-0000-7000-8000-000000000201","body":"Squats felt good","sentAt":"2026-10-17T17:21:00Z"}},
    {"clientMutationId":"01900000-0000-7000-8000-000000000023","createdAt":"2026-10-17T17:22:00Z","kind":"teleport","payload":{}}
  ]$j$::jsonb) as j)
  select jsonb_array_length(j -> 'accepted') = 1
     and jsonb_array_length(j -> 'rejected') = 2
     and (j -> 'rejected' -> 0 ->> 'reason') = 'not_found'
     and (j -> 'rejected' -> 1 ->> 'reason') = 'invalid'
  from r), 'bad mutations are rejected with a reason; good ones in the same batch apply');

-- Waiver: insert-only.
select public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000031","createdAt":"2026-10-17T16:00:00Z","kind":"waiver.sign",
   "payload":{"signatureId":"01900000-0000-7000-8000-0000000000f1","waiverVersion":1,"signedName":"Client A1","signatureSvg":"<svg/>","signedAt":"2026-10-17T16:00:00Z","appVersion":"0.1.0"}}
]$j$::jsonb, '203.0.113.7');
select pg_temp.check((select ip = '203.0.113.7'::inet from waiver_signatures), 'waiver stores the upload IP');
do $$ begin
  update waiver_signatures set signed_name = 'Someone else';
  if found then raise exception 'FAILED: client edited a signed waiver'; end if;
  raise notice 'ok - clients cannot edit a signed waiver';
end $$;
reset role;
do $$ begin
  update waiver_signatures set signed_name = 'Someone else';
  raise exception 'FAILED: signed waiver was edited with elevated rights';
exception when insufficient_privilege then raise notice 'ok - signed waivers are immutable even for admins';
end $$;
set role authenticated;

-- PAR-Q yes raises a triage item for the coach.
select public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000041","createdAt":"2026-10-17T15:00:00Z","kind":"intake.submit",
   "payload":{"responseId":"01900000-0000-7000-8000-0000000000f2","formId":"default-v1","answers":{"goal":"strength"},"parqFlag":true}}
]$j$::jsonb);
reset role;
select pg_temp.check(exists (select 1 from triage_items where reason_code = 'parq_flag' and client_id = 'a0000000-0000-7000-8000-0000000000c1'), 'PAR-Q yes flags the client for the coach');

-- Feature areas can register handlers for new kinds via sync_handle_<area>.
create function public.sync_handle_zz_test(kind text, p jsonb, uid uuid, mid uuid, client_ip inet) returns uuid
language plpgsql as $$ begin
  if kind <> 'test.echo' then return null; end if;
  return 'a0000000-0000-7000-8000-000000000000';
end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-7000-8000-0000000000c1', false);
set role authenticated;
select pg_temp.check((public.sync_apply($j$[{"clientMutationId":"01900000-0000-7000-8000-000000000061","createdAt":"2026-10-21T10:00:00Z","kind":"test.echo","payload":{}}]$j$::jsonb) -> 'accepted') ? '01900000-0000-7000-8000-000000000061', 'new mutation kinds dispatch to a registered handler');
reset role;
drop function public.sync_handle_zz_test(text, jsonb, uuid, uuid, inet);
