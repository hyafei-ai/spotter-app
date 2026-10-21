-- Nutrition and habits: clients only see their own logs; coaches set targets only for clients they can see.
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

-- Owner A sets targets and a habit for client A1 (assigned to the assistant) and A2.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
insert into nutrition_targets (tenant_id, client_id, mode, kcal, protein_g, carbs_g, fat_g) values
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'macros', 2400, 160, 270, 75),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c2', 'off', null, null, null, null);
insert into habits (id, tenant_id, client_id, title) values
  ('a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'Walk 8,000 steps');
select pg_temp.check((select count(*) from nutrition_targets) = 2, 'owner sets targets for their clients');

-- The assistant only coaches A1: can change A1's targets, not A2's.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
update nutrition_targets set kcal = 2500 where client_id = 'a0000000-0000-7000-8000-0000000000c1';
select pg_temp.check((select kcal from nutrition_targets where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 2500, 'assistant updates targets for an assigned client');
do $$ begin
  insert into nutrition_targets (tenant_id, client_id, mode) values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c2', 'portions');
  raise exception 'FAILED: assistant set targets for a client they can''t see';
exception when insufficient_privilege or unique_violation then raise notice 'ok - assistant cannot set targets for an unassigned client';
end $$;
select pg_temp.check((select count(*) from nutrition_targets where client_id = 'a0000000-0000-7000-8000-0000000000c2') = 0, 'assistant cannot even see an unassigned client''s targets');

-- Owner B can't touch tenant A.
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
do $$ begin
  insert into nutrition_targets (tenant_id, client_id, mode) values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'off');
  raise exception 'FAILED: another trainer set targets';
exception when insufficient_privilege or unique_violation then raise notice 'ok - another trainer cannot set targets';
end $$;

-- Client A1 logs food and ticks a habit through sync_apply.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000401","createdAt":"2026-10-21T08:00:00Z","kind":"food.log",
   "payload":{"logId":"01900000-0000-7000-8000-0000000004a1","date":"2026-10-21","meal":"breakfast","foodId":"sample:oats","name":"Rolled oats, dry","grams":60,"kcal":227,"proteinG":7.8,"carbsG":40.8,"fatG":3.9,"portions":null,"loggedAt":"2026-10-21T08:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000402","createdAt":"2026-10-21T08:01:00Z","kind":"habit.check",
   "payload":{"habitId":"a0000000-0000-7000-8000-000000000501","date":"2026-10-21","done":true,"checkedAt":"2026-10-21T08:01:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000403","createdAt":"2026-10-21T08:02:00Z","kind":"habit.check",
   "payload":{"habitId":"a0000000-0000-7000-8000-000000000501","date":"2026-10-21","done":false,"checkedAt":"2026-10-21T07:59:00Z"}}
]$j$::jsonb) -> 'accepted') = 3, 'client logs food and ticks a habit offline');
select pg_temp.check((select done from habit_logs where habit_id = 'a0000000-0000-7000-8000-000000000501') = true, 'an older habit tick never overwrites a newer one');
select pg_temp.check((select kcal from nutrition_targets) = 2500, 'client reads their own targets');
select pg_temp.check((select count(*) from nutrition_targets) = 1, 'client sees only their own targets');
do $$ begin
  update nutrition_targets set kcal = 5000;
  if found then raise exception 'FAILED: client changed their own targets'; end if;
  raise notice 'ok - client cannot change their targets';
end $$;

-- Undo a food entry.
select public.sync_apply($j$[{"clientMutationId":"01900000-0000-7000-8000-000000000404","createdAt":"2026-10-21T08:03:00Z","kind":"food.delete",
  "payload":{"logId":"01900000-0000-7000-8000-0000000004a1","deletedAt":"2026-10-21T08:03:00Z"}}]$j$::jsonb);
select pg_temp.check((select deleted_at is not null from food_logs where id = '01900000-0000-7000-8000-0000000004a1'), 'deleting a food entry keeps the row, marked deleted');

-- A habit that isn't theirs is rejected, not silently dropped.
select pg_temp.check((public.sync_apply($j$[{"clientMutationId":"01900000-0000-7000-8000-000000000405","createdAt":"2026-10-21T08:04:00Z","kind":"habit.check",
  "payload":{"habitId":"a0000000-0000-7000-8000-000000000599","date":"2026-10-21","done":true,"checkedAt":"2026-10-21T08:04:00Z"}}]$j$::jsonb) -> 'rejected' -> 0 ->> 'reason') = 'not_found', 'ticking a removed habit is rejected with a reason');

-- Client A2 can't read A1's logs.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from food_logs) = 0 and (select count(*) from habit_logs) = 0, 'a client cannot read another client''s food or habit logs');
do $$ begin
  insert into food_logs (id, tenant_id, client_id, date, meal, name, kcal, protein_g, carbs_g, fat_g, logged_at)
  values ('01900000-0000-7000-8000-0000000004a9', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', '2026-10-21', 'lunch', 'x', 1, 0, 0, 0, now());
  raise exception 'FAILED: client logged food for someone else';
exception when insufficient_privilege then raise notice 'ok - a client cannot log food for another client';
end $$;

-- Coaches who can see A1 read the logs; owner B can't.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from food_logs) = 1, 'the assigned coach reads the client''s food log');
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from food_logs) = 0, 'another trainer cannot read the food log');

-- Food cache: readable when signed in, not writable by clients.
reset role;
insert into foods (id, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g) values ('off:5000000000012', 'off', 'Fixture oat bar', 435, 11.2, 52, 18.5);
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from foods) = 1, 'signed-in users read the public food cache');
do $$ begin
  insert into foods (id, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g) values ('off:1', 'off', 'x', 1, 1, 1, 1);
  raise exception 'FAILED: client wrote to the food cache';
exception when insufficient_privilege then raise notice 'ok - clients cannot write to the food cache';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select pg_temp.check((select count(*) from foods) = 0, 'anonymous users cannot read the food cache');
reset role;
