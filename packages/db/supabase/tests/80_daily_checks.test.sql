-- Daily read: the client owns their checks; coaches see only what was shared, through shared_reads_for_coach.
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

-- Client A1 (coached by assistant A2) sends three checks from the offline queue:
-- 10-19 shared with the cycle phase, 10-20 shared but cycle phase private, 10-21 kept private.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000801","createdAt":"2026-10-19T07:00:00Z","kind":"daily_check.submit",
   "payload":{"checkId":"01900000-0000-7000-8000-0000000008a1","date":"2026-10-19","sleepHours":7.5,"sleepSource":"health","energy":4,"soreness":2,"stress":2,
     "cyclePhase":"menstrual","shareCycle":true,"note":null,"shareWithCoach":true,
     "sharedRead":{"tone":"steady","headline":"Good to train as planned","factors":[{"kind":"sleep_ok","text":"Slept 7.5 h","strain":false},{"kind":"cycle_phase","text":"Cycle: period phase","strain":false}],"suggestLighter":false},
     "submittedAt":"2026-10-19T07:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000802","createdAt":"2026-10-20T07:00:00Z","kind":"daily_check.submit",
   "payload":{"checkId":"01900000-0000-7000-8000-0000000008a2","date":"2026-10-20","sleepHours":5.5,"sleepSource":"manual","energy":2,"soreness":4,"stress":3,
     "cyclePhase":"luteal","shareCycle":false,"note":"Long shift","shareWithCoach":true,
     "sharedRead":{"tone":"ease","headline":"Today looks like an easier day","factors":[{"kind":"soreness_high","text":"Feeling sore today","strain":true},{"kind":"energy_low","text":"Energy is low today","strain":true},{"kind":"cycle_phase","text":"Cycle: luteal phase","strain":false}],"suggestLighter":true},
     "submittedAt":"2026-10-20T07:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000803","createdAt":"2026-10-21T07:00:00Z","kind":"daily_check.submit",
   "payload":{"checkId":"01900000-0000-7000-8000-0000000008a3","date":"2026-10-21","sleepHours":6,"sleepSource":"manual","energy":3,"soreness":3,"stress":4,
     "cyclePhase":"luteal","shareCycle":true,"note":"Rough night","shareWithCoach":false,
     "sharedRead":{"tone":"watch","headline":"Train as planned, and keep an eye on it","factors":[],"suggestLighter":false},
     "submittedAt":"2026-10-21T07:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 3, 'client sends daily checks from the offline queue');
select pg_temp.check((select count(*) from daily_checks) = 3, 'client reads their own checks');
select pg_temp.check((select shared_read from daily_checks where check_date = '2026-10-21') is null, 'a private day stores no shared read');

-- Re-sending an older edit of the same day never overwrites a newer one.
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000804","createdAt":"2026-10-20T06:00:00Z","kind":"daily_check.submit",
   "payload":{"checkId":"01900000-0000-7000-8000-0000000008a4","date":"2026-10-20","sleepHours":8,"sleepSource":"manual","energy":5,"soreness":1,"stress":1,
     "cyclePhase":null,"shareCycle":false,"note":null,"shareWithCoach":true,"sharedRead":null,"submittedAt":"2026-10-20T06:00:00Z"}}
]$j$::jsonb) -> 'accepted') = 1, 'an older edit is accepted');
select pg_temp.check((select energy from daily_checks where check_date = '2026-10-20') = 2, 'but it doesn’t overwrite the newer check');

-- The client can't store a shared read on a private day.
do $$ begin
  insert into daily_checks (id, tenant_id, client_id, check_date, share_with_coach, shared_read, submitted_at)
  values ('01900000-0000-7000-8000-0000000008b1', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1',
          '2026-10-10', false, '{"tone":"steady"}', now());
  raise exception 'FAILED: a private day kept a shared read';
exception when check_violation then raise notice 'ok - a private day can’t carry a shared read';
end $$;

-- The client chooses the easier version of a session; the coach sees it with the session.
insert into sessions (id, tenant_id, client_id, scheduled_date, started_at)
values ('01900000-0000-7000-8000-0000000008c1', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', '2026-10-20', '2026-10-20T08:00:00Z');
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000805","createdAt":"2026-10-20T08:00:01Z","kind":"session.variant",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000008c1","variant":"lighter"}}
]$j$::jsonb) -> 'accepted') = 1, 'client marks a session as the easier version');
select pg_temp.check(not exists (select 1 from public.shared_reads_for_coach('a0000000-0000-7000-8000-0000000000c1')), 'the client gets nothing from the coach RPC');
reset role;

-- Assistant A2 coaches A1: no direct access to the table, only the shared projection.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from daily_checks) = 0, 'a coach can’t select daily checks directly');
select pg_temp.check((select count(*) from public.shared_reads_for_coach('a0000000-0000-7000-8000-0000000000c1')) = 3, 'the coach sees one row per check');
select pg_temp.check(
  (select not shared and shared_read is null and cycle_phase is null from public.shared_reads_for_coach('a0000000-0000-7000-8000-0000000000c1') where check_date = '2026-10-21'),
  'a private day shows only that the client checked in');
select pg_temp.check(
  (select cycle_phase is null and not exists (select 1 from jsonb_array_elements(shared_read -> 'factors') f where f ->> 'kind' = 'cycle_phase')
     from public.shared_reads_for_coach('a0000000-0000-7000-8000-0000000000c1') where check_date = '2026-10-20'),
  'the coach can’t see the cycle phase when it wasn’t shared, not even in the read’s factors');
select pg_temp.check(
  (select shared_read ->> 'tone' = 'ease' from public.shared_reads_for_coach('a0000000-0000-7000-8000-0000000000c1') where check_date = '2026-10-20'),
  'the coach sees the shared read');
select pg_temp.check(
  (select cycle_phase = 'menstrual' from public.shared_reads_for_coach('a0000000-0000-7000-8000-0000000000c1') where check_date = '2026-10-19'),
  'the coach sees the cycle phase on a day the client shared it');
select pg_temp.check((select session_variant from sessions where id = '01900000-0000-7000-8000-0000000008c1') = 'lighter', 'the coach sees which version the client chose');
reset role;

-- Owner B (another tenant) sees nothing, and can't mark A1's session.
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
select pg_temp.check(not exists (select 1 from public.shared_reads_for_coach('a0000000-0000-7000-8000-0000000000c1')), 'another trainer sees no reads');
select pg_temp.check((select count(*) from daily_checks) = 0, 'another trainer sees no checks');
reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000806","createdAt":"2026-10-20T09:00:00Z","kind":"session.variant",
   "payload":{"sessionId":"01900000-0000-7000-8000-0000000008c1","variant":"recovery"}}
]$j$::jsonb) -> 'rejected' -> 0 ->> 'reason') = 'not_found', 'another client can’t change someone else’s session');
reset role;
