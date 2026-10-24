-- Multi-sport blocks: a day's blocks reach the client's snapshot; Strategy & Stimulus drafts stay with the coach until
-- approved; block results sync (newer replaces older, never the other way round) and stay within the client's own
-- coach; race goals have one live row per client.
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

-- The owner adds an AMRAP after the strength exercises and publishes.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
update program_days set blocks = $j$[
  {"id":"a0000000-0000-7000-8000-000000000103:strength","kind":"strength","title":null,"note":null,"scoring":"load","timeCapSec":null,"templateId":null,
   "exerciseIds":["a0000000-0000-7000-8000-000000000104","a0000000-0000-7000-8000-000000000105"]},
  {"id":"01900000-0000-7000-8000-000000009401","kind":"amrap","title":"Cindy","note":null,"scoring":"rounds_reps","timeCapSec":null,"templateId":"benchmark.cindy",
   "durationSec":1200,"movements":[{"id":"m1","movementId":"pull-up","name":"Pull-up","reps":5,"repsAlt":null,"loadKg":null,"loadKgAlt":null,"pct1rm":null,
   "calories":null,"caloriesAlt":null,"distanceM":null,"durationSec":null,"note":null,"verify":false}]}
]$j$::jsonb where id = 'a0000000-0000-7000-8000-000000000103';
select pg_temp.check((select jsonb_array_length(blocks) from program_days where id = 'a0000000-0000-7000-8000-000000000103') = 2, 'the coach saves blocks on a day');

-- An AI draft of Strategy & Stimulus, logged like every AI draft.
insert into ai_drafts (id, tenant_id, kind, input_ref, output, model)
values ('01900000-0000-7000-8000-000000009402', 'a0000000-0000-7000-8000-000000000000', 'day_brief', '{"programDayId":"a0000000-0000-7000-8000-000000000103"}', '{}', 'test-model');
insert into day_briefs (program_day_id, stimulus, strategy, source, ai_draft_id)
values ('a0000000-0000-7000-8000-000000000103', 'Steady, sustained work.', 'Start at a pace you could hold.', 'ai', '01900000-0000-7000-8000-000000009402');
select pg_temp.check((select tenant_id from day_briefs where program_day_id = 'a0000000-0000-7000-8000-000000000103') = 'a0000000-0000-7000-8000-000000000000', 'the brief takes its tenant from the day');
select public.publish_program('a0000000-0000-7000-8000-000000000101', current_date);
reset role;

-- The assigned client: blocks in the snapshot, no draft anywhere.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select (public.assigned_day('a0000000-0000-7000-8000-000000000106', current_date) -> 'snapshot' -> 'weeks' -> 0 -> 'days' -> 0 -> 'blocks' -> 1 ->> 'kind')) = 'amrap', 'the client’s snapshot carries the blocks');
select pg_temp.check((public.assigned_day('a0000000-0000-7000-8000-000000000106', current_date) -> 'snapshot' -> 'weeks' -> 0 -> 'days' -> 0 -> 'brief') is null, 'a draft brief is not in the snapshot');
select pg_temp.check((select count(*) from day_briefs) = 0, 'the client can’t read a draft brief');
reset role;

-- Approving needs who and when; then the client reads it.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
do $$ begin
  update day_briefs set status = 'approved' where program_day_id = 'a0000000-0000-7000-8000-000000000103';
  raise exception 'FAILED: approval without approver was accepted';
exception when check_violation then raise notice 'ok - approval must say who approved it';
end $$;
update day_briefs set status = 'approved', approved_by = auth.uid(), approved_at = now() where program_day_id = 'a0000000-0000-7000-8000-000000000103';
select public.publish_program('a0000000-0000-7000-8000-000000000101', current_date);
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from day_briefs) = 1, 'the client reads the approved brief');
select pg_temp.check((public.assigned_day('a0000000-0000-7000-8000-000000000106', current_date) -> 'snapshot' -> 'weeks' -> 0 -> 'days' -> 0 -> 'brief' ->> 'stimulus') = 'Steady, sustained work.', 'the approved brief is in the snapshot');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from day_briefs) = 0, 'a client without the program doesn’t');
reset role;

-- Client A1 logs the session with the AMRAP score; a stale result arriving late changes nothing; a newer one wins.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009410","createdAt":"2026-10-27T18:00:00Z","kind":"session.start",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000094a1","programDayId":"a0000000-0000-7000-8000-000000000103","scheduledDate":"2026-10-27","startedAt":"2026-10-27T18:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000009411","createdAt":"2026-10-27T18:40:00Z","kind":"block.result",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000094a1","blockId":"01900000-0000-7000-8000-000000009401","kind":"amrap","key":"benchmark.cindy","label":"Cindy",
              "scoring":"rounds_reps","score":{"timeSec":null,"rounds":18,"reps":7,"loadKg":null,"distanceM":null,"calories":null,"capped":false,"scaled":false},
              "splits":[],"rpe":9,"loggedAt":"2026-10-27T18:40:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000009412","createdAt":"2026-10-27T18:39:00Z","kind":"block.result",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000094a1","blockId":"01900000-0000-7000-8000-000000009401","kind":"amrap","key":"benchmark.cindy","label":"Cindy",
              "scoring":"rounds_reps","score":{"timeSec":null,"rounds":3,"reps":0,"loadKg":null,"distanceM":null,"calories":null,"capped":false,"scaled":false},
              "splits":[],"rpe":null,"loggedAt":"2026-10-27T18:39:00Z"}}
]$j$::jsonb) -> 'accepted') = 3, 'client syncs a session with a block result');
select pg_temp.check((select (score ->> 'rounds')::int from session_block_results where session_id = '01900000-0000-7000-8000-0000000094a1') = 18, 'an older result arriving late doesn’t replace a newer one');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009413","createdAt":"2026-10-27T18:45:00Z","kind":"block.result",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000094a1","blockId":"01900000-0000-7000-8000-000000009401","kind":"amrap","key":"benchmark.cindy","label":"Cindy",
              "scoring":"rounds_reps","score":{"timeSec":null,"rounds":18,"reps":12,"loadKg":null,"distanceM":null,"calories":null,"capped":false,"scaled":false},
              "splits":[],"rpe":9,"loggedAt":"2026-10-27T18:45:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'a corrected score syncs');
select pg_temp.check((select (score ->> 'reps')::int from session_block_results where session_id = '01900000-0000-7000-8000-0000000094a1') = 12, 'the newer result wins');
select pg_temp.check(jsonb_array_length(public.sync_pull() -> 'session_block_results') = 1, 'sync pull returns the client’s results');
reset role;

-- Their coach (the assistant) sees it; another client doesn't; another tenant can't attach a result to the session.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from session_block_results where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 1, 'the client’s coach sees the result');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from session_block_results) = 0, 'another client sees nothing');
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009414","createdAt":"2026-10-27T19:00:00Z","kind":"block.result",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000094a1","blockId":"x","kind":"amrap","key":"k","label":"L","scoring":"reps",
              "score":{"timeSec":null,"rounds":null,"reps":1,"loadKg":null,"distanceM":null,"calories":null,"capped":false,"scaled":false},
              "splits":[],"rpe":null,"loggedAt":"2026-10-27T19:00:00Z"}}
]$j$::jsonb) -> 'rejected' -> 0 ->> 'reason') = 'not_found', 'someone else’s session is rejected');
reset role;

-- Void, then the session's deletion removes the row.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009415","createdAt":"2026-10-27T19:05:00Z","kind":"block.void",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000094a1","blockId":"01900000-0000-7000-8000-000000009401","voidedAt":"2026-10-27T19:05:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client voids a block result');
select pg_temp.check((select voided_at is not null from session_block_results where session_id = '01900000-0000-7000-8000-0000000094a1'), 'the result is marked void');
reset role;

-- Race goals: one live goal; a new one clears the old; the coach sees it; others don't.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009420","createdAt":"2026-10-27T20:00:00Z","kind":"race.goal.set",
   "payload":{"goalId":"01900000-0000-7000-8000-0000000094c1","event":"Spring race","kind":"race_sim","date":"2027-03-20","targetSec":5100,"division":null,"format":"full","updatedAt":"2026-10-27T20:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000009421","createdAt":"2026-10-27T20:05:00Z","kind":"race.goal.set",
   "payload":{"goalId":"01900000-0000-7000-8000-0000000094c2","event":"Autumn 10 km","kind":"run","date":"2026-12-05","targetSec":2700,"division":null,"format":null,"updatedAt":"2026-10-27T20:05:00Z"}}
]$j$::jsonb) -> 'accepted') = 2, 'client sets a race goal, then another');
select pg_temp.check((select count(*) from race_goals where cleared_at is null) = 1, 'one live race goal');
select pg_temp.check((select event from race_goals where cleared_at is null) = 'Autumn 10 km', 'the newer goal is the live one');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from race_goals where client_id = 'a0000000-0000-7000-8000-0000000000c1' and cleared_at is null) = 1, 'the coach sees the race goal');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from race_goals) = 0, 'another client sees no race goal');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000009422","createdAt":"2026-10-27T20:10:00Z","kind":"race.goal.clear",
   "payload":{"goalId":"01900000-0000-7000-8000-0000000094c2","clearedAt":"2026-10-27T20:10:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client clears the race goal');
select pg_temp.check((select count(*) from race_goals where cleared_at is null) = 0, 'no live race goal');
reset role;

delete from sessions where id = '01900000-0000-7000-8000-0000000094a1';
select pg_temp.check((select count(*) from session_block_results where session_id = '01900000-0000-7000-8000-0000000094a1') = 0, 'results go with their session');
