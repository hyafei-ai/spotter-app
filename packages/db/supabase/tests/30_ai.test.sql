-- AI drafts and progression suggestions: nothing reaches a client without a coach's approval,
-- clients never see drafts, and suggestions are readable by the client but only answerable.
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

-- Assistant A drafts a check-in summary for their assigned client A1 (the function writes drafts as the coach).
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
insert into ai_drafts (id, tenant_id, client_id, kind, input_ref, output, model)
values ('a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1',
        'check_in_summary', '{"week":"2026-10-12"}', '{"text":"You trained 2 of 3 sessions.\nSquat moved well.\nCheck-in not in yet."}', 'claude-opus-5-5');

do $$ begin
  update ai_drafts set sent_at = now() where id = 'a0000000-0000-7000-8000-000000000501';
  raise exception 'FAILED: draft marked sent without approval';
exception when check_violation then raise notice 'ok - a draft can’t be marked sent without a coach approval';
end $$;

do $$ begin
  update ai_drafts set status = 'approved' where id = 'a0000000-0000-7000-8000-000000000501';
  raise exception 'FAILED: draft approved without an approver';
exception when check_violation then raise notice 'ok - approval needs an approver and a time';
end $$;

select pg_temp.check(public.ai_drafts_this_month('a0000000-0000-7000-8000-000000000000') = 1, 'usage counts this month’s model drafts');

-- Client A1 never sees drafts, even their own, and can't approve one.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from ai_drafts) = 0, 'a client can never read ai_drafts');
select pg_temp.check((select count(*) from ai_usage_monthly) = 0, 'a client can’t read AI usage');
do $$ begin
  perform public.approve_ai_draft('a0000000-0000-7000-8000-000000000501', null, true);
  raise exception 'FAILED: client approved a draft';
exception when no_data_found then raise notice 'ok - a client can’t approve or send a draft';
end $$;
select pg_temp.check((select count(*) from messages where sender_id = 'a0000000-0000-7000-8000-0000000000a2') = 0, 'nothing was posted to the client');

-- The coach approves an edited draft: it posts to the client's thread as the coach.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check(
  (public.approve_ai_draft('a0000000-0000-7000-8000-000000000501', 'You trained 2 of 3 sessions. Squat moved well. Send your check-in when you can.', true) ->> 'status') = 'edited',
  'coach approves an edited draft');
select pg_temp.check((select sent_at is not null and approved_by = 'a0000000-0000-7000-8000-0000000000a2' from ai_drafts where id = 'a0000000-0000-7000-8000-000000000501'),
  'the sent draft records who approved it');

reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select body from messages where sender_id = 'a0000000-0000-7000-8000-0000000000a2') like 'You trained 2 of 3 sessions.%',
  'the client receives the approved text, from their coach');

-- Owner B can't see tenant A's drafts.
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from ai_drafts) = 0, 'another trainer can’t see drafts');

-- Progression suggestions: written by the service (superuser here), read and answered by the client.
reset role;
insert into progression_rules (id, tenant_id, program_id, program_exercise_id, condition, increment, sessions_required)
values ('a0000000-0000-7000-8000-000000000601', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000101',
        'a0000000-0000-7000-8000-000000000104', '{"maxRpe":8}', 2.5, 2);
insert into progression_suggestions (id, tenant_id, client_id, program_exercise_id, rule_id, previous_load_kg, suggested_load_kg, reason)
values ('a0000000-0000-7000-8000-000000000602', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1',
        'a0000000-0000-7000-8000-000000000104', 'a0000000-0000-7000-8000-000000000601', 100, 102.5, 'You hit 8 reps on every set, 2 sessions in a row.');
do $$ begin
  insert into progression_suggestions (tenant_id, client_id, program_exercise_id, rule_id, previous_load_kg, suggested_load_kg, reason)
  values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'a0000000-0000-7000-8000-000000000104',
          'a0000000-0000-7000-8000-000000000601', 100, 105, 'dup');
  raise exception 'FAILED: two open suggestions for one exercise';
exception when unique_violation then raise notice 'ok - one open suggestion per client and exercise';
end $$;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select suggested_load_kg from progression_suggestions) = 102.5, 'the client reads their suggestion');
update progression_suggestions set status = 'kept' where id = 'a0000000-0000-7000-8000-000000000602';
select pg_temp.check((select status from progression_suggestions) = 'kept', 'the client can keep their current load');
do $$ begin
  update progression_suggestions set suggested_load_kg = 200 where id = 'a0000000-0000-7000-8000-000000000602';
  raise exception 'FAILED: client changed the suggested load';
exception when insufficient_privilege then raise notice 'ok - the client can’t change the suggested load';
end $$;

reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from progression_suggestions) = 0, 'other clients can’t see the suggestion');

-- app.open updates the client's last open time through sync, and nothing else about the membership.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000071","createdAt":"2026-10-21T08:00:00Z","kind":"app.open","payload":{"openedAt":"2026-10-21T08:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'app.open is accepted through sync');
select pg_temp.check((select last_app_open_at = '2026-10-21T08:00:00Z' from memberships where profile_id = 'a0000000-0000-7000-8000-0000000000c1'),
  'last app open is recorded');
do $$ begin
  update memberships set assigned_coach_id = null where profile_id = 'a0000000-0000-7000-8000-0000000000c1';
  raise exception 'FAILED: client reassigned their coach';
exception when insufficient_privilege then raise notice 'ok - a client can’t change anything else on their membership';
end $$;
reset role;
