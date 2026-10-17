-- RLS tests (Security and privacy): a client can't read another client's rows or another tenant's data;
-- assistants only see assigned clients; coach-only tables stay coach-only.
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

-- ---------- client A1 ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from tenants) = 1, 'client sees only their own tenant');
select pg_temp.check((select count(*) from sessions where client_id = 'a0000000-0000-7000-8000-0000000000c2') = 0, 'client cannot read another client''s sessions');
select pg_temp.check((select count(*) from sessions where tenant_id = 'b0000000-0000-7000-8000-000000000000') = 0, 'client cannot read another tenant''s sessions');
select pg_temp.check((select count(*) from threads) = 1, 'client sees only their own thread');
select pg_temp.check((select count(*) from triage_items) = 0, 'triage is never visible to clients');
select pg_temp.check((select count(*) from program_days) = 1, 'client reads the program assigned to them');
select pg_temp.check((select count(*) from memberships) = 1, 'client sees only their own membership');
select pg_temp.check((select count(*) from profiles) = 1, 'client sees only their own profile');

do $$ begin
  insert into logged_sets (id, tenant_id, client_id, session_id, program_exercise_id, exercise_id, set_index, weight, reps, logged_at)
  values ('a0000000-0000-7000-8000-000000000901', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1',
          'a0000000-0000-7000-8000-000000000301', 'a0000000-0000-7000-8000-000000000104', 'back-squat', 0, 100, 5, now());
  raise exception 'FAILED: client logged a set into another client''s session';
exception when insufficient_privilege then raise notice 'ok - client cannot write into another client''s session';
end $$;

do $$ begin
  insert into messages (id, tenant_id, thread_id, sender_id, body)
  values ('a0000000-0000-7000-8000-000000000902', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000202', 'a0000000-0000-7000-8000-0000000000c1', 'hi');
  raise exception 'FAILED: client posted into another client''s thread';
exception when insufficient_privilege then raise notice 'ok - client cannot post into another client''s thread';
end $$;

do $$ begin
  update tenants set brand_color = '#000000';
  if found then raise exception 'FAILED: client changed tenant branding'; end if;
  raise notice 'ok - client cannot change tenant branding';
end $$;

-- ---------- assistant A ----------
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from triage_items) = 1, 'assistant sees triage only for assigned clients');
select pg_temp.check((select count(*) from sessions) = 0, 'assistant cannot see an unassigned client''s sessions');
select pg_temp.check((select count(*) from threads) = 1, 'assistant sees only assigned clients'' threads');
do $$ begin
  update tenants set app_name = 'Hijacked';
  if found then raise exception 'FAILED: assistant changed branding'; end if;
  raise notice 'ok - assistant cannot change branding';
end $$;

-- ---------- owner A ----------
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check((select count(*) from triage_items) = 2, 'owner sees all triage in their tenant');
select pg_temp.check((select count(*) from sessions) = 1, 'owner sees their clients'' sessions');
select pg_temp.check((select count(*) from sessions where tenant_id = 'b0000000-0000-7000-8000-000000000000') = 0, 'owner cannot see another tenant');
select pg_temp.check((select count(*) from profiles) = 4, 'owner sees profiles in their tenant only');

do $$ begin
  insert into ai_drafts (tenant_id, client_id, kind, input_ref, output, status, model)
  values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'check_in_summary', '{}', '{}', 'approved', 'test-model');
  raise exception 'FAILED: AI draft approved without an approver';
exception when check_violation then raise notice 'ok - an AI draft can''t be approved without a coach approval';
end $$;

-- ---------- owner B ----------
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from sessions) = 1 and (select count(*) from triage_items) = 0, 'owner B sees only tenant B');

-- ---------- anonymous ----------
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select pg_temp.check((select count(*) from tenants) = 0 and (select count(*) from sessions) = 0, 'anonymous sees nothing');
reset role;
