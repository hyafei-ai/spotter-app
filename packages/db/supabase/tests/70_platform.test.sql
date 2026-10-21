-- Platform: invites, team handoff, billing visibility, support access, inbox tools, sync pull, deletion.
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

-- ---------- invites ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
insert into invites (tenant_id, email, full_name, role, token_hash, invited_by)
values ('a0000000-0000-7000-8000-000000000000', 'newbie@example.com', 'New Client', 'client',
        encode(digest('tok_newbie_123', 'sha256'), 'hex'), 'a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from invites) = 1, 'an assistant can invite a client');
do $$ begin
  insert into invites (tenant_id, email, role, token_hash, invited_by)
  values ('a0000000-0000-7000-8000-000000000000', 'helper@example.com', 'assistant', 'x', 'a0000000-0000-7000-8000-0000000000a2');
  raise exception 'FAILED: assistant invited another coach';
exception when insufficient_privilege then raise notice 'ok - only the owner can invite coaches';
end $$;
reset role;

-- A brand-new user accepts it.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c9');
select pg_temp.check(public.accept_invite('tok_newbie_123') = 'a0000000-0000-7000-8000-000000000000', 'accepting an invite joins the coach’s business');
select pg_temp.check((select assigned_coach_id from memberships where profile_id = 'a0000000-0000-7000-8000-0000000000c9') = 'a0000000-0000-7000-8000-0000000000a2', 'the inviting coach becomes the client’s coach');
select pg_temp.check((select count(*) from threads) = 1, 'a message thread is ready for the new client');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
do $$ begin
  perform public.accept_invite('tok_newbie_123');
  raise exception 'FAILED: invite reused by someone else';
exception when no_data_found then raise notice 'ok - an invite can’t be reused by someone else';
end $$;
do $$ begin
  perform public.accept_invite('not-a-real-token');
  raise exception 'FAILED: bogus token accepted';
exception when no_data_found then raise notice 'ok - an unknown invite is refused';
end $$;
reset role;
update invites set accepted_at = null, accepted_by = null, expires_at = now() - interval '1 minute';
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
do $$ begin
  perform public.accept_invite('tok_newbie_123');
  raise exception 'FAILED: expired invite accepted';
exception when no_data_found then raise notice 'ok - an expired invite is refused';
end $$;
reset role;

-- ---------- billing visibility (UX M1) ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check(not public.can_see_billing('a0000000-0000-7000-8000-000000000000'), 'an assistant can’t see billing');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check(public.can_see_billing('a0000000-0000-7000-8000-000000000000'), 'the owner can see billing');
reset role;

-- ---------- handoff keeps history ----------
-- Client A1 is the assistant's client and already has sessions from the sync tests.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
do $$ begin
  perform public.hand_off_client('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'a0000000-0000-7000-8000-0000000000a2');
  raise exception 'FAILED: assistant moved a client';
exception when insufficient_privilege then raise notice 'ok - only the owner can hand clients over';
end $$;
select pg_temp.check((select count(*) from sessions where client_id = 'a0000000-0000-7000-8000-0000000000c1') > 0, 'assistant sees their client’s sessions before the handoff');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select public.hand_off_client('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'a0000000-0000-7000-8000-0000000000a1', 'Covering while Sam is away');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from sessions where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 0, 'after the handoff the previous coach no longer sees the client');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select public.hand_off_client('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'a0000000-0000-7000-8000-0000000000a2', 'Back to Sam');
select pg_temp.check((select count(*) from coach_assignments where client_id = 'a0000000-0000-7000-8000-0000000000c1') = 2
  and (select count(*) from coach_assignments where client_id = 'a0000000-0000-7000-8000-0000000000c1' and ended_at is null) = 1, 'handoffs are recorded with one current coach');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from sessions where client_id = 'a0000000-0000-7000-8000-0000000000c1') > 0
  and (select count(*) from messages m join threads t on t.id = m.thread_id where t.client_id = 'a0000000-0000-7000-8000-0000000000c1') > 0,
  'the new coach sees the full history: sessions and messages');
reset role;

-- ---------- inbox tools ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check(public.send_bulk_message('a0000000-0000-7000-8000-000000000000',
  array['a0000000-0000-7000-8000-0000000000c1', 'a0000000-0000-7000-8000-0000000000c2', 'b0000000-0000-7000-8000-0000000000c1']::uuid[],
  'Gym closes early on Friday.') = 2, 'bulk message reaches only the coach’s own clients');
insert into saved_replies (tenant_id, coach_id, title, body) values ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000a1', 'Great week', 'Great week. Same plan next week.');
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from saved_replies) = 0, 'saved replies are private to each coach');
reset role;

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check(public.mark_thread_read('a0000000-0000-7000-8000-000000000201', now()) >= 1, 'opening the thread marks the coach’s messages read');
select pg_temp.check((select count(*) from messages where read_at is null and sender_id <> 'a0000000-0000-7000-8000-0000000000c1') = 0, 'no unread coach messages remain');

-- Attachments and consent through the offline queue.
select pg_temp.check(jsonb_array_length(public.sync_apply($j$[
  {"clientMutationId":"01900000-0000-7000-8000-000000000701","createdAt":"2026-10-21T10:00:00Z","kind":"message.attach",
   "payload":{"messageId":"01900000-0000-7000-8000-0000000007a1","threadId":"a0000000-0000-7000-8000-000000000201","kind":"voice","body":null,"mediaPath":"voice/a1.m4a","durationMs":4200,"link":null,"sentAt":"2026-10-21T10:00:00Z"}},
  {"clientMutationId":"01900000-0000-7000-8000-000000000702","createdAt":"2026-10-21T10:00:01Z","kind":"consent.record",
   "payload":{"consentId":"01900000-0000-7000-8000-0000000007b1","kind":"terms_privacy","granted":true,"version":"2026-10-01","recordedAt":"2026-10-21T10:00:01Z"}}
]$j$::jsonb) -> 'accepted') = 2, 'voice notes and consent sync from the offline queue');
select pg_temp.check((select duration_ms from messages where id = '01900000-0000-7000-8000-0000000007a1') = 4200, 'voice note keeps its length');

-- Sync pull returns only the caller's own data.
select pg_temp.check(
  jsonb_array_length(public.sync_pull() -> 'sessions') > 0
  and not exists (select 1 from jsonb_array_elements(public.sync_pull() -> 'sessions') s where s ->> 'client_id' <> 'a0000000-0000-7000-8000-0000000000c1')
  -- Other test files may add days to the shared fixture program, so check ownership, not a count.
  and jsonb_array_length(public.sync_pull() -> 'program_days') >= 1
  and not exists (
    select 1 from jsonb_array_elements(public.sync_pull() -> 'program_days') d
     where (d ->> 'program_id')::uuid not in (select program_id from assignments where client_id = 'a0000000-0000-7000-8000-0000000000c1')
  ),
  'sync pull returns the client’s own sessions and assigned program');
select pg_temp.check(jsonb_array_length(public.sync_pull(now() + interval '1 minute') -> 'sessions') = 0, 'sync pull returns nothing newer than the cursor');
reset role;

-- ---------- support access ----------
insert into profiles (id, full_name) values ('f0000000-0000-7000-8000-0000000000f1', 'Spotter Support');
insert into platform_admins (profile_id) values ('f0000000-0000-7000-8000-0000000000f1');
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
do $$ begin
  perform public.open_support_session('a0000000-0000-7000-8000-000000000000', 'Looking around for no reason');
  raise exception 'FAILED: a coach opened a support session';
exception when insufficient_privilege then raise notice 'ok - only Spotter staff can open support access';
end $$;
reset role;
select pg_temp.as_user('f0000000-0000-7000-8000-0000000000f1');
select pg_temp.check((select count(*) from sessions) = 0, 'staff see nothing without a support session');
do $$ begin
  perform public.open_support_session('a0000000-0000-7000-8000-000000000000', 'short');
  raise exception 'FAILED: support session without a real reason';
exception when check_violation then raise notice 'ok - support access needs a reason';
end $$;
do $$ begin
  perform public.open_support_session('a0000000-0000-7000-8000-000000000000', 'Ticket 4411: sets not syncing', 240);
  raise exception 'FAILED: support session over an hour';
exception when invalid_parameter_value then raise notice 'ok - support access is capped at an hour';
end $$;
select public.open_support_session('a0000000-0000-7000-8000-000000000000', 'Ticket 4411: sets not syncing', 15);
select pg_temp.check((select count(*) from sessions) > 0 and (select count(*) from sessions where tenant_id = 'b0000000-0000-7000-8000-000000000000') = 0, 'a support session opens read access to that tenant only');
reset role;
select pg_temp.check(exists (select 1 from audit_log where action = 'support.open' and reason like 'Ticket 4411%'), 'support access is written to the audit log');
update support_grants set granted_at = now() - interval '20 minutes', expires_at = now() - interval '5 minutes';
select pg_temp.as_user('f0000000-0000-7000-8000-0000000000f1');
select pg_temp.check((select count(*) from sessions) = 0, 'support access expires on its own');
reset role;

-- ---------- account deletion ----------
insert into waiver_signatures (id, tenant_id, client_id, waiver_version, signed_name, signature_svg, app_version, signed_at)
values ('a0000000-0000-7000-8000-000000000901', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c2', 1, 'Client A2', '<svg/>', '0.1.0', now());
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select public.delete_my_account();
reset role;
select pg_temp.check((select count(*) from sessions where client_id = 'a0000000-0000-7000-8000-0000000000c2') = 0, 'deleting an account removes training data');
select pg_temp.check((select full_name from profiles where id = 'a0000000-0000-7000-8000-0000000000c2') = 'Deleted user', 'the profile is anonymised');
select pg_temp.check((select count(*) from waiver_signatures where client_id = 'a0000000-0000-7000-8000-0000000000c2') = 1, 'the signed waiver is kept as a legal record');
select pg_temp.check(exists (select 1 from audit_log where action = 'account.delete'), 'deletion is written to the audit log');
