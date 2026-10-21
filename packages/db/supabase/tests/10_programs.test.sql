-- Program builder and assignment: publishing, version snapshots ("edits apply to future sessions
-- only"), one-day overrides, and who can see or change what.
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

-- Owner A builds a draft program: one week, Monday "Lower", back squat 3 × 5 @ 100 kg with a rule.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
insert into programs (id, tenant_id, name, is_template, status) values
  ('a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000000', 'Block 1', false, 'draft');
insert into program_weeks (id, tenant_id, program_id, week_index) values
  ('a0000000-0000-7000-8000-000000000502', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000501', 0);
insert into program_days (id, tenant_id, program_id, week_id, day_index, title, weekday) values
  ('a0000000-0000-7000-8000-000000000503', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000502', 0, 'Lower', 1);
insert into program_exercises (id, tenant_id, program_id, program_day_id, exercise_id, position, metric, rest_s, alternatives) values
  ('a0000000-0000-7000-8000-000000000504', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000503', 'back-squat', 0, 'weight_reps', 150, '{pull-up}');
insert into prescribed_sets (id, tenant_id, program_id, program_exercise_id, set_index, reps_min, reps_max, load_type, load_value) values
  ('a0000000-0000-7000-8000-000000000511', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000504', 0, 5, 5, 'absolute', 100),
  ('a0000000-0000-7000-8000-000000000512', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000504', 1, 5, 5, 'absolute', 100),
  ('a0000000-0000-7000-8000-000000000513', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000504', 2, 5, 5, 'pct_1rm', 0.8);
insert into progression_rules (id, tenant_id, program_id, program_exercise_id, condition, increment, sessions_required) values
  ('a0000000-0000-7000-8000-000000000514', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000504', '{"maxRpe": 8}', 2.5, 2);

do $$ begin
  insert into program_days (id, tenant_id, program_id, week_id, day_index, title, weekday) values
    ('a0000000-0000-7000-8000-000000000505', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000502', 1, 'Also Monday', 1);
  raise exception 'FAILED: two sessions on one weekday';
exception when unique_violation then raise notice 'ok - one session per weekday per week';
end $$;

-- A draft has no snapshot to hand out; publishing a draft keeps version 1.
select pg_temp.check(public.publish_program('a0000000-0000-7000-8000-000000000501', '2026-10-19') = 1, 'publishing a draft keeps version 1');
select pg_temp.check((select status from programs where id = 'a0000000-0000-7000-8000-000000000501') = 'published', 'program is published');

-- The snapshot has the core Program shape.
select pg_temp.check((
  with s as (select public.program_snapshot('a0000000-0000-7000-8000-000000000501') as j)
  select j -> 'weeks' -> 0 -> 'days' -> 0 ->> 'title' = 'Lower'
     and (j -> 'weeks' -> 0 -> 'days' -> 0 ->> 'weekday')::int = 1
     and j -> 'weeks' -> 0 -> 'days' -> 0 -> 'exercises' -> 0 ->> 'name' = 'Back Squat'
     and jsonb_array_length(j -> 'weeks' -> 0 -> 'days' -> 0 -> 'exercises' -> 0 -> 'sets') = 3
     and j -> 'weeks' -> 0 -> 'days' -> 0 -> 'exercises' -> 0 -> 'sets' -> 2 ->> 'loadType' = 'pct_1rm'
     and (j -> 'weeks' -> 0 -> 'days' -> 0 -> 'exercises' -> 0 -> 'progressionRule' ->> 'incrementKg')::numeric = 2.5
     and j -> 'weeks' -> 0 -> 'days' -> 0 -> 'exercises' -> 0 -> 'alternatives' -> 0 ->> 'name' = 'Pull-up'
  from s), 'snapshot matches the core Program shape');

-- Assigning it to client A1 (via their assistant? no: owner) snapshots version 1 from the start date.
insert into assignments (id, tenant_id, client_id, program_id, start_date) values
  ('a0000000-0000-7000-8000-000000000521', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'a0000000-0000-7000-8000-000000000501', '2026-10-19');
select pg_temp.check((select count(*) from assignment_versions where assignment_id = 'a0000000-0000-7000-8000-000000000521') = 1, 'a new assignment gets the current version');

-- Live edit: 100 → 102.5 kg, published from the 21st. The 19th keeps 100 kg.
update prescribed_sets set load_value = 102.5 where program_exercise_id = 'a0000000-0000-7000-8000-000000000504' and load_type = 'absolute';
select pg_temp.check(public.publish_program('a0000000-0000-7000-8000-000000000501', '2026-10-21') = 2, 'saving a live program bumps the version');
select pg_temp.check((
  select (public.assigned_day('a0000000-0000-7000-8000-000000000521', '2026-10-19') -> 'snapshot' -> 'weeks' -> 0 -> 'days' -> 0 -> 'exercises' -> 0 -> 'sets' -> 0 ->> 'loadValue')::numeric = 100
     and (public.assigned_day('a0000000-0000-7000-8000-000000000521', '2026-10-21') -> 'snapshot' -> 'weeks' -> 0 -> 'days' -> 0 -> 'exercises' -> 0 -> 'sets' -> 0 ->> 'loadValue')::numeric = 102.5
     and (public.assigned_day('a0000000-0000-7000-8000-000000000521', '2026-10-21') ->> 'programVersion')::int = 2
), 'edits apply from the next session; earlier sessions keep the old version');

-- Re-publishing for the same date replaces that version instead of stacking.
select public.publish_program('a0000000-0000-7000-8000-000000000501', '2026-10-21');
select pg_temp.check((select count(*) from assignment_versions where assignment_id = 'a0000000-0000-7000-8000-000000000521') = 2, 'republishing replaces versions from that date on');

-- tenant_id/client_id on snapshots always come from the assignment.
insert into session_overrides (assignment_id, date, day, tenant_id, client_id) values
  ('a0000000-0000-7000-8000-000000000521', '2026-10-22', '{"id":"x","title":"Deload","weekday":4,"coachNote":null,"exercises":[]}', 'b0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select tenant_id = 'a0000000-0000-7000-8000-000000000000' and client_id = 'a0000000-0000-7000-8000-0000000000c1'
  from session_overrides where date = '2026-10-22'), 'overrides take tenant and client from the assignment');
select pg_temp.check(public.assigned_day('a0000000-0000-7000-8000-000000000521', '2026-10-22') ->> 'title' = 'Deload', 'an override replaces that day only');

-- Client A1 reads their own snapshots and overrides but can't change them.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from assignment_versions) >= 2, 'client reads their program versions');
select pg_temp.check((select count(*) from session_overrides) = 1, 'client reads their session overrides');
do $$ begin
  insert into session_overrides (assignment_id, date, day) values ('a0000000-0000-7000-8000-000000000521', '2026-10-23', '{"exercises":[]}');
  raise exception 'FAILED: client edited their own program';
exception when insufficient_privilege then raise notice 'ok - clients cannot override their own sessions';
end $$;
do $$ begin
  perform public.publish_program('a0000000-0000-7000-8000-000000000501', '2026-10-21');
  raise exception 'FAILED: client published a program';
exception when insufficient_privilege then raise notice 'ok - clients cannot publish programs';
end $$;

-- Client A2 sees none of it.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from session_overrides) = 0 and (select count(*) from assignment_versions where assignment_id = 'a0000000-0000-7000-8000-000000000521') = 0, 'another client sees none of it');

-- Assistant A edits today's session for their assigned client (A1) but not for A2.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
insert into session_overrides (assignment_id, date, day) values ('a0000000-0000-7000-8000-000000000521', '2026-10-24', '{"id":"y","title":"Short","weekday":6,"coachNote":null,"exercises":[]}');
select pg_temp.check((select count(*) from session_overrides) = 2, 'assistant edits a session for an assigned client');
reset role;
insert into assignments (id, tenant_id, client_id, program_id, start_date) values
  ('a0000000-0000-7000-8000-000000000522', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c2', 'a0000000-0000-7000-8000-000000000501', '2026-10-19');
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
do $$ begin
  insert into session_overrides (assignment_id, date, day) values ('a0000000-0000-7000-8000-000000000522', '2026-10-24', '{"exercises":[]}');
  raise exception 'FAILED: assistant edited an unassigned client''s session';
-- The assignment is invisible to them, so the insert fails as not found rather than forbidden.
exception when insufficient_privilege or no_data_found then raise notice 'ok - assistant cannot edit an unassigned client''s session';
end $$;

-- Another trainer sees nothing.
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from assignment_versions) = 0 and (select count(*) from session_overrides) = 0, 'another trainer sees nothing');
do $$ begin
  perform public.publish_program('a0000000-0000-7000-8000-000000000501', '2026-10-21');
  raise exception 'FAILED: another trainer published tenant A''s program';
exception when insufficient_privilege then raise notice 'ok - another trainer cannot publish it';
end $$;
reset role;
