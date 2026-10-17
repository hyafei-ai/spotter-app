-- Editable intake forms: only the tenant owner can change the form; clients and assistants read it.
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

-- Owner A creates and edits the tenant's form.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
insert into intake_forms (id, tenant_id, schema, is_default) values
  ('a0000000-0000-7000-8000-000000000401', 'a0000000-0000-7000-8000-000000000000',
   '{"questions":[{"id":"goal","type":"single_choice","label":"Main goal","required":true,"options":["Strength","Muscle"]}]}', true);
update intake_forms set schema = '{"questions":[{"id":"sleep","type":"number","label":"Hours of sleep","required":false,"unit":"h"}]}'
 where id = 'a0000000-0000-7000-8000-000000000401';
select pg_temp.check((select version from intake_forms where id = 'a0000000-0000-7000-8000-000000000401') = 2, 'owner edits the form and the version goes up');

do $$ begin
  insert into intake_forms (tenant_id, schema, is_default) values ('a0000000-0000-7000-8000-000000000000', '{"questions":[]}', true);
  raise exception 'FAILED: two live forms for one tenant';
exception when unique_violation then raise notice 'ok - one live intake form per tenant';
end $$;

do $$ begin
  update intake_forms set schema = '{"questions":"nope"}' where id = 'a0000000-0000-7000-8000-000000000401';
  raise exception 'FAILED: malformed form saved';
exception when check_violation then raise notice 'ok - a malformed form is refused';
end $$;

-- Assistant A can read but not edit.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from intake_forms) = 1, 'assistant can read the form');
do $$ begin
  update intake_forms set schema = '{"questions":[]}';
  if found then raise exception 'FAILED: assistant edited the intake form'; end if;
  raise notice 'ok - assistant cannot edit the intake form';
end $$;

-- Client A1 reads it (to render intake) but can't change it; owner B can't see it at all.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select schema -> 'questions' -> 0 ->> 'id' from intake_forms) = 'sleep', 'client reads their trainer’s current form');
do $$ begin
  update intake_forms set schema = '{"questions":[]}';
  if found then raise exception 'FAILED: client edited the intake form'; end if;
  raise notice 'ok - client cannot edit the intake form';
end $$;

-- A response records the form version it answered.
select public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000051","createdAt":"2026-10-17T15:00:00Z","kind":"intake.submit",
   "payload":{"responseId":"01900000-0000-7000-8000-0000000000f5","formId":"a0000000-0000-7000-8000-000000000401","formVersion":2,"answers":{"sleep":7},"parqFlag":false}}
]$j$::jsonb);
select pg_temp.check((select form_version from intake_responses where id = '01900000-0000-7000-8000-0000000000f5') = 2, 'response stores the form version');

reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from intake_forms) = 0, 'another trainer cannot see the form');
reset role;
