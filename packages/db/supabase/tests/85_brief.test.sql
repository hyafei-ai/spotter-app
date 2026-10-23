-- Daily brief: pain logs (coach sees shared ones), wearable days (client only), imported workouts (coach gets a
-- summary of shared ones), the shared brief inside the shared read, ongoing-pain triage and account deletion.
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

-- Client A1 (coached by assistant A2) syncs a shared knee log, a private shoulder log, two wearable days and
-- two imported runs (one shared, one private).
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000901","createdAt":"2026-10-21T07:00:00Z","kind":"pain.log",
   "payload":{"painId":"01900000-0000-7000-8000-0000000009a1","date":"2026-10-21","region":"knee","side":"left","level":4,"note":"Stairs","shareWithCoach":true,"loggedAt":"2026-10-21T07:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000902","createdAt":"2026-10-21T07:01:00Z","kind":"pain.log",
   "payload":{"painId":"01900000-0000-7000-8000-0000000009a2","date":"2026-10-21","region":"shoulder","side":null,"level":2,"note":null,"shareWithCoach":false,"loggedAt":"2026-10-21T07:01:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000903","createdAt":"2026-10-21T07:02:00Z","kind":"wearable.days",
   "payload":{"days":[{"date":"2026-10-20","source":"apple_health","sleepHours":7.4,"hrvMs":48,"restingHr":58,"activeKcal":520},
                      {"date":"2026-10-21","source":"apple_health","sleepHours":5.9,"hrvMs":41,"restingHr":64,"activeKcal":380}]}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000904","createdAt":"2026-10-21T07:03:00Z","kind":"workout.import",
   "payload":{"workouts":[
     {"externalId":"hk-run-1","date":"2026-10-19","startedAt":"2026-10-19T06:30:00Z","durationMin":34,"activity":"run","activeKcal":320,"distanceM":5200,"avgHr":148,"maxHr":168,"source":"apple_health","sourceApp":"Workout","shareWithCoach":true},
     {"externalId":"hk-run-2","date":"2026-10-20","startedAt":"2026-10-20T06:30:00Z","durationMin":28,"activity":"run","activeKcal":260,"distanceM":4300,"avgHr":146,"maxHr":165,"source":"apple_health","sourceApp":"Strava","shareWithCoach":false}]}}
]$j$::jsonb) -> 'accepted') = 4, 'client syncs pain, wearable days and imported workouts');
select pg_temp.check((select count(*) from pain_logs) = 2, 'client reads their own pain logs');
select pg_temp.check((select count(*) from wearable_days) = 2, 'client reads their own wearable days');
select pg_temp.check((select count(*) from imported_workouts) = 2, 'client reads their own imported workouts');

-- Re-importing upserts instead of duplicating; an older pain edit never overwrites a newer one.
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000905","createdAt":"2026-10-21T08:00:00Z","kind":"wearable.days",
   "payload":{"days":[{"date":"2026-10-21","source":"apple_health","sleepHours":6.0,"hrvMs":42,"restingHr":63,"activeKcal":410}]}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000906","createdAt":"2026-10-21T06:00:00Z","kind":"pain.log",
   "payload":{"painId":"01900000-0000-7000-8000-0000000009a1","date":"2026-10-21","region":"knee","side":"left","level":1,"note":null,"shareWithCoach":true,"loggedAt":"2026-10-21T06:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 2, 'repeat syncs are accepted');
select pg_temp.check((select count(*) from wearable_days) = 2 and (select hrv_ms from wearable_days where day = '2026-10-21') = 42, 'a re-synced day replaces the old one');
select pg_temp.check((select level from pain_logs where id = '01900000-0000-7000-8000-0000000009a1') = 4, 'an older pain edit doesn’t overwrite the newer one');

-- Today's shared read carries the brief; the client kept the cycle phase private, so its reason must not reach the coach.
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000907","createdAt":"2026-10-21T07:05:00Z","kind":"daily_check.submit",
   "payload":{"checkId":"01900000-0000-7000-8000-0000000009b1","date":"2026-10-22","sleepHours":5.9,"sleepSource":"health","energy":3,"soreness":3,"stress":3,
     "cyclePhase":"luteal","shareCycle":false,"note":null,"shareWithCoach":true,
     "sharedRead":{"tone":"ease","headline":"Today looks like an easier day","factors":[{"kind":"sleep_short","text":"Short sleep 2 of the last 3 nights","strain":true}],"suggestLighter":true,
       "brief":{"tone":"ease","feel":"You’re running tired today","why":[{"source":"hrv","text":"HRV 15% under your usual (Apple Watch)"},{"source":"cycle","text":"Luteal phase: your lifts usually run ~3% lower here (your own data, 5 cycles)"}],
                "todo":["Take the easier version A2 set","Aim for bed by 10:30"],"suggestLighter":true}},
     "submittedAt":"2026-10-22T07:05:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'client shares a read with the brief');
reset role;

-- Assistant A2 coaches A1.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from pain_logs) = 1, 'the coach sees only the pain log the client shared');
select pg_temp.check((select region from pain_logs) = 'knee', 'the shared one is the knee');
select pg_temp.check((select count(*) from wearable_days) = 0, 'the coach can’t read wearable days');
select pg_temp.check((select count(*) from imported_workouts) = 0, 'the coach can’t select imported workouts directly');
select pg_temp.check((select count(*) from public.imported_workouts_for_coach('a0000000-0000-7000-8000-0000000000c1')) = 1, 'the coach gets a summary of shared imported workouts only');
select pg_temp.check(
  (select not (to_jsonb(w) ? 'avg_hr') and not (to_jsonb(w) ? 'active_kcal') and w.activity = 'run' and w.distance_m = 5200
     from public.imported_workouts_for_coach('a0000000-0000-7000-8000-0000000000c1') w),
  'the summary has type, date, duration and distance but no heart rate or kcal');
select pg_temp.check(
  (select shared_read -> 'brief' ->> 'feel' = 'You’re running tired today'
          and jsonb_array_length(shared_read -> 'brief' -> 'why') = 1
          and shared_read -> 'brief' -> 'why' -> 0 ->> 'source' = 'hrv'
     from public.shared_reads_for_coach('a0000000-0000-7000-8000-0000000000c1') where check_date = '2026-10-22'),
  'the coach sees the brief without the cycle reason the client didn’t share');
reset role;

-- Owner B (another tenant) sees nothing; client B1 can't overwrite or delete A1's pain log.
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check((select count(*) from pain_logs) = 0, 'another trainer sees no pain logs');
select pg_temp.check(not exists (select 1 from public.imported_workouts_for_coach('a0000000-0000-7000-8000-0000000000c1')), 'another trainer sees no imported workouts');
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000908","createdAt":"2026-10-22T09:00:00Z","kind":"pain.log",
   "payload":{"painId":"01900000-0000-7000-8000-0000000009a1","date":"2026-10-22","region":"hip","side":null,"level":9,"note":null,"shareWithCoach":true,"loggedAt":"2026-10-22T09:00:00Z"}}
]$j$::jsonb) -> 'rejected' -> 0 ->> 'reason') = 'not_found', 'another client can’t overwrite someone else’s pain log');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000909","createdAt":"2026-10-22T09:01:00Z","kind":"pain.delete",
   "payload":{"painId":"01900000-0000-7000-8000-0000000009a1","deletedAt":"2026-10-22T09:01:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'a delete of someone else’s log is a no-op');
reset role;
select pg_temp.check((select level from pain_logs where id = '01900000-0000-7000-8000-0000000009a1') = 4, 'A1’s knee log is untouched');

-- Two more shared knee days → ongoing pain → one triage item for A1's coach. Private logs raise nothing.
insert into pain_logs (id, tenant_id, client_id, log_date, region, side, level, share_with_coach, logged_at) values
  ('01900000-0000-7000-8000-0000000009a3', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', '2026-10-22', 'knee', 'left', 3, true, now()),
  ('01900000-0000-7000-8000-0000000009a4', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', '2026-10-23', 'knee', 'left', 3, true, now()),
  ('01900000-0000-7000-8000-0000000009a5', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', '2026-10-22', 'shoulder', null, 7, false, now());
select pg_temp.check(public.raise_pain_ongoing('2026-10-23') = 1, 'ongoing shared pain raises one item');
select pg_temp.check(
  (select detail ->> 'text' from triage_items where reason_code = 'pain_ongoing' and client_id = 'a0000000-0000-7000-8000-0000000000c1') = 'Pain logged 3 days running: knee',
  'in coach words: “Pain logged 3 days running: knee”');
select pg_temp.check(public.raise_pain_ongoing('2026-10-23') = 0, 'it isn’t raised twice while open');

-- Account deletion removes the client's brief data (rolled back so later tests keep their fixtures).
begin;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select public.delete_my_account();
reset role;
select pg_temp.check(
  not exists (select 1 from pain_logs where client_id = 'a0000000-0000-7000-8000-0000000000c1')
  and not exists (select 1 from wearable_days where client_id = 'a0000000-0000-7000-8000-0000000000c1')
  and not exists (select 1 from imported_workouts where client_id = 'a0000000-0000-7000-8000-0000000000c1')
  and not exists (select 1 from daily_checks where client_id = 'a0000000-0000-7000-8000-0000000000c1'),
  'deleting the account removes pain logs, wearable days, imported workouts and daily checks');
rollback;
delete from triage_items where reason_code = 'pain_ongoing';
