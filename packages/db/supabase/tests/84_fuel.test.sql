-- Fuel check: the client owns settings and shares; coaches see only the level and signs, only while shared.
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

-- Client A1 (coached by assistant A2) saves settings with sharing off, then tries to share a level.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000841","createdAt":"2026-10-20T07:00:00Z","kind":"fuel.settings.set",
   "payload":{"bodyFatPct":null,"useEstimate":true,"intakeSource":"auto","shareWithCoach":false,"updatedAt":"2026-10-20T07:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client saves fuel settings from the offline queue');
select pg_temp.check((select use_estimate and not share_with_coach from fuel_settings), 'settings are stored, sharing off by default');
select pg_temp.check((public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000842","createdAt":"2026-10-20T07:01:00Z","kind":"fuel.pattern.share",
   "payload":{"date":"2026-10-20","level":"watch","signs":["Pain in the knee on 3 days in the last two weeks"],"sharedAt":"2026-10-20T07:01:00Z"}}
]$j$::jsonb) -> 'rejected' -> 0 ->> 'reason') = 'forbidden', 'a level can’t be shared while sharing is off');

-- Sharing on: a "watch" level, then "talk to someone" twice (one triage item), and an older edit that loses.
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000843","createdAt":"2026-10-21T07:00:00Z","kind":"fuel.settings.set",
   "payload":{"bodyFatPct":27,"useEstimate":false,"intakeSource":"health","shareWithCoach":true,"updatedAt":"2026-10-21T07:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000844","createdAt":"2026-10-21T07:01:00Z","kind":"fuel.pattern.share",
   "payload":{"date":"2026-10-21","level":"watch","signs":["Pain in the knee on 3 days in the last two weeks"],"sharedAt":"2026-10-21T07:01:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000845","createdAt":"2026-10-22T07:01:00Z","kind":"fuel.pattern.share",
   "payload":{"date":"2026-10-22","level":"talk_to_someone","signs":["Energy availability under 30 on 6 of 9 logged days","Pain in the knee on 4 days in the last two weeks"],"sharedAt":"2026-10-22T07:01:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000846","createdAt":"2026-10-23T07:01:00Z","kind":"fuel.pattern.share",
   "payload":{"date":"2026-10-23","level":"talk_to_someone","signs":["Energy availability under 30 on 6 of 9 logged days"],"sharedAt":"2026-10-23T07:01:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000847","createdAt":"2026-10-23T06:00:00Z","kind":"fuel.pattern.share",
   "payload":{"date":"2026-10-23","level":"none","signs":[],"sharedAt":"2026-10-23T06:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 5, 'client turns sharing on and shares levels');
select pg_temp.check((select count(*) from fuel_shares) = 3, 'one share per day');
select pg_temp.check((select level from fuel_shares where share_date = '2026-10-23') = 'talk_to_someone', 'an older edit doesn’t overwrite a newer share');
select pg_temp.check((select count(*) from triage_items) = 0, 'the client can’t read triage items');

-- The client can't write a triage item or a share for someone else.
do $$ begin
  insert into fuel_shares (tenant_id, client_id, share_date, level, shared_at)
  values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c2', '2026-10-22', 'none', now());
  raise exception 'FAILED: a client wrote another client’s share';
exception when insufficient_privilege then raise notice 'ok - a client can’t write another client’s share';
end $$;
reset role;

select pg_temp.check(
  (select count(*) from triage_items where reason_code = 'fuel_pattern' and client_id = 'a0000000-0000-7000-8000-0000000000c1' and handled_at is null) = 1,
  'a shared "talk to someone" level opens one triage item, not one per share');
select pg_temp.check(
  (select detail ->> 'text' from triage_items where reason_code = 'fuel_pattern' limit 1) = 'Fuel check flagged: worth a conversation',
  'the triage item carries coach copy');

-- Assistant A2 coaches A1: reads shares (level and signs only), can't read settings, can't write.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from fuel_shares where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 3, 'the coach sees the shared levels');
select pg_temp.check((select count(*) from fuel_settings) = 0, 'the coach can’t read the client’s fuel settings (body fat stays private)');
select pg_temp.check((select count(*) from triage_items where reason_code = 'fuel_pattern') = 1, 'the coach sees the fuel triage item');
update fuel_shares set level = 'none' where client_id = 'a0000000-0000-7000-8000-0000000000c1';
select pg_temp.check((select count(*) from fuel_shares where level = 'none') = 0, 'the coach can’t change a share');
reset role;

-- Turning sharing off hides every past share from the coach.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000848","createdAt":"2026-10-23T08:00:00Z","kind":"fuel.settings.set",
   "payload":{"bodyFatPct":27,"useEstimate":false,"intakeSource":"health","shareWithCoach":false,"updatedAt":"2026-10-23T08:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client turns sharing off');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from fuel_shares) = 0, 'the coach sees no shares once sharing is off');
reset role;

-- Owner B (another tenant) sees nothing, even with sharing on again.
update fuel_settings set share_with_coach = true where client_id = 'a0000000-0000-7000-8000-0000000000c1';
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from fuel_shares) = 0, 'another trainer sees no fuel shares');
select pg_temp.check((select count(*) from fuel_settings) = 0, 'another trainer sees no fuel settings');
reset role;

-- Client A2 sees none of A1's fuel data.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from fuel_shares) = 0 and (select count(*) from fuel_settings) = 0, 'another client sees no fuel data');
reset role;

-- Leave the shared fixtures as they were for later files.
delete from triage_items where reason_code = 'fuel_pattern';
delete from fuel_shares;
delete from fuel_settings;
