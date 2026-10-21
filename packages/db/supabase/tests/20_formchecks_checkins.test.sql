-- Form checks and check-ins: privacy, coach-only replies, triage hooks and offline sync.
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

-- ---------- client A1 sends a form check ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
insert into videos (id, tenant_id, owner_id, kind, storage_path, content_type, size_bytes, duration_ms) values
  ('a0000000-0000-7000-8000-000000000a01', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1',
   'form_check', 'a0000000-0000-7000-8000-000000000000/a0000000-0000-7000-8000-0000000000c1/a01.mp4', 'video/mp4', 4000000, 42000);

do $$ begin
  insert into videos (id, tenant_id, owner_id, kind, storage_path, content_type, size_bytes, duration_ms) values
    ('a0000000-0000-7000-8000-000000000a02', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1',
     'form_check', 'x/y/a02.mp4', 'video/mp4', 4000000, 84000);
  raise exception 'FAILED: an 84 s form check was accepted';
exception when check_violation then raise notice 'ok - form checks over 60 s are refused';
end $$;

do $$ begin
  insert into videos (id, tenant_id, owner_id, kind, storage_path, content_type, size_bytes) values
    ('a0000000-0000-7000-8000-000000000a03', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'demo', 'x/y/a03.mp4', 'video/mp4', 10);
  raise exception 'FAILED: a client uploaded a library demo video';
exception when insufficient_privilege then raise notice 'ok - clients can only upload form-check videos';
end $$;

select pg_temp.check((public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000201","createdAt":"2026-10-21T10:00:00Z","kind":"formcheck.create",
   "payload":{"formCheckId":"01900000-0000-7000-8000-0000000002a1","videoId":"a0000000-0000-7000-8000-000000000a01","exerciseId":"back-squat",
              "sessionId":null,"programExerciseId":"a0000000-0000-7000-8000-000000000104","setIndex":2,"durationMs":42000,
              "clientNote":"Knees?","createdAt":"2026-10-21T10:00:00Z"}}
]$j$::jsonb) -> 'accepted') ? '01900000-0000-7000-8000-000000000201', 'form check syncs through the offline queue');

select pg_temp.check((
  with r as (select public.sync_apply($j$[
    {"clientMutationId":"01900000-0000-7000-8000-000000000202","createdAt":"2026-10-21T10:01:00Z","kind":"formcheck.create",
     "payload":{"formCheckId":"01900000-0000-7000-8000-0000000002a2","videoId":"a0000000-0000-7000-8000-000000000999","exerciseId":"back-squat",
                "sessionId":null,"programExerciseId":null,"setIndex":null,"durationMs":1000,"clientNote":null,"createdAt":"2026-10-21T10:01:00Z"}}
  ]$j$::jsonb) as j)
  select (j -> 'rejected' -> 0 ->> 'reason') = 'not_found' from r), 'a form check for a video that isn’t yours is rejected with a reason');

do $$ begin
  update form_checks set status = 'replied', replied_at = now() where id = '01900000-0000-7000-8000-0000000002a1';
  if found then raise exception 'FAILED: client marked their own form check replied'; end if;
  raise notice 'ok - clients cannot mark their own form check replied';
end $$;

do $$ begin
  insert into form_check_annotations (tenant_id, form_check_id, author_id, at_ms, kind, payload)
  values ('a0000000-0000-7000-8000-000000000000', '01900000-0000-7000-8000-0000000002a1', 'a0000000-0000-7000-8000-0000000000c1', 0, 'note', '{"text":"hi"}');
  raise exception 'FAILED: client annotated a form check';
exception when insufficient_privilege then raise notice 'ok - only coaches annotate form checks';
end $$;

reset role;
select pg_temp.check(exists (select 1 from triage_items where client_id = 'a0000000-0000-7000-8000-0000000000c1' and reason_code = 'form_check_waiting' and handled_at is null),
  'a new form check puts the client in the coach’s triage list');

-- ---------- other people ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from form_checks) = 0 and (select count(*) from videos) = 0, 'another client can’t see the form check or its video');
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from form_checks) = 0, 'another trainer can’t see the form check');
reset role;

-- ---------- assistant coach (assigned to A1) replies ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from form_checks) = 1 and (select count(*) from videos) = 1, 'the assigned coach sees the form check and its video');
insert into form_check_annotations (tenant_id, form_check_id, author_id, at_ms, kind, payload) values
  ('a0000000-0000-7000-8000-000000000000', '01900000-0000-7000-8000-0000000002a1', 'a0000000-0000-7000-8000-0000000000a2', 2200, 'angle',
   '{"a":{"x":0.3,"y":0.4},"vertex":{"x":0.5,"y":0.6},"b":{"x":0.7,"y":0.4}}');
update form_checks set status = 'replied', replied_at = now(), replied_by = 'a0000000-0000-7000-8000-0000000000a2', reply_summary = 'Knees track well.'
 where id = '01900000-0000-7000-8000-0000000002a1';
reset role;
select pg_temp.check(not exists (select 1 from triage_items where client_id = 'a0000000-0000-7000-8000-0000000000c1' and reason_code = 'form_check_waiting' and handled_at is null),
  'replying takes the client out of triage');

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from form_check_annotations) = 1 and (select status from form_checks) = 'replied', 'the client sees the coach’s reply and drawings');
reset role;

-- ---------- check-ins ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
insert into check_in_templates (tenant_id, fields, cadence) values
  ('a0000000-0000-7000-8000-000000000000', '{"bodyweight":true,"measurements":["waist"],"photos":true,"sleep":true,"stress":true,"adherence":true,"notes":true}', '{"dueWeekday":0,"reminderHour":8}');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
do $$ begin
  insert into check_in_templates (tenant_id, fields) values ('a0000000-0000-7000-8000-000000000000', '{}');
  raise exception 'FAILED: assistant changed the tenant default check-in';
exception when insufficient_privilege or unique_violation then raise notice 'ok - only the owner sets the default check-in';
end $$;
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from check_in_templates) = 1, 'clients read their trainer’s check-in template');
select pg_temp.check((public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000301","createdAt":"2026-10-18T09:00:00Z","kind":"checkin.submit",
   "payload":{"checkInId":"01900000-0000-7000-8000-0000000003a1","dueDate":"2026-10-18","answers":{"bodyweightKg":81.4,"sleepHours":7},"photoIds":[],"submittedAt":"2026-10-18T09:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000302","createdAt":"2026-10-18T09:05:00Z","kind":"checkin.submit",
   "payload":{"checkInId":"01900000-0000-7000-8000-0000000003a1","dueDate":"2026-10-18","answers":{"bodyweightKg":81.2,"sleepHours":7},"photoIds":[],"submittedAt":"2026-10-18T09:05:00Z"}}
]$j$::jsonb) -> 'accepted') @> '["01900000-0000-7000-8000-000000000301","01900000-0000-7000-8000-000000000302"]', 'check-ins sync, and a resubmission replaces the answers');
select pg_temp.check((select (answers ->> 'bodyweightKg')::numeric from check_ins) = 81.2, 'the latest answers win before the coach reads it');
do $$ begin
  update check_ins set coach_reviewed_at = now();
  raise exception 'FAILED: client marked their own check-in read';
exception when insufficient_privilege then raise notice 'ok - clients cannot mark a check-in read';
end $$;
insert into progress_photos (id, tenant_id, client_id, check_in_id, pose, storage_path) values
  ('01900000-0000-7000-8000-0000000003b1', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', '01900000-0000-7000-8000-0000000003a1', 'front', 'a/c1/front.jpg');
reset role;
select pg_temp.check(exists (select 1 from triage_items where client_id = 'a0000000-0000-7000-8000-0000000000c1' and reason_code = 'check_in_submitted' and handled_at is null),
  'a submitted check-in puts the client in triage');

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from check_ins) = 0 and (select count(*) from progress_photos) = 0, 'progress photos and check-ins are private to the client and their coaches');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
do $$ begin
  update check_ins set answers = '{"bodyweightKg": 70}';
  raise exception 'FAILED: coach edited a client''s answers';
exception when insufficient_privilege then raise notice 'ok - coaches cannot change a client’s answers';
end $$;
update check_ins set coach_reviewed_at = now(), reviewed_by = 'a0000000-0000-7000-8000-0000000000a2';
select pg_temp.check((select count(*) from progress_photos) = 1, 'the assigned coach sees the progress photos');
reset role;
select pg_temp.check(not exists (select 1 from triage_items where client_id = 'a0000000-0000-7000-8000-0000000000c1' and reason_code = 'check_in_submitted' and handled_at is null),
  'reading the check-in takes the client out of triage');

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((
  with r as (select public.sync_apply($j$[
    {"clientMutationId":"01900000-0000-7000-8000-000000000303","createdAt":"2026-10-19T09:00:00Z","kind":"checkin.submit",
     "payload":{"checkInId":"01900000-0000-7000-8000-0000000003a2","dueDate":"2026-10-18","answers":{"bodyweightKg":79},"photoIds":[],"submittedAt":"2026-10-19T09:00:00Z"}}
  ]$j$::jsonb) as j)
  select jsonb_array_length(j -> 'rejected') = 1 and (j -> 'rejected' -> 0 ->> 'message') like 'Your coach has already read%' from r),
  'changing a check-in the coach already read is refused with a reason, not dropped');
reset role;
