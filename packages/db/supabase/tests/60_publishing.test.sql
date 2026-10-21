-- White-label publishing: branding is owner-only, trainer codes expose public fields only,
-- store credentials are never readable back, jobs are owner-queued and worker-updated, revoke works.
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

-- Owner A sets branding, including a trainer code and tab labels.
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
update tenants set join_code = 'TENANTA', tab_labels = '{"today":"Train"}', splash_background = '#F3EFE7', stripe_account_id = 'acct_secret'
 where id = 'a0000000-0000-7000-8000-000000000000';
select pg_temp.check((select join_code from tenants where id = 'a0000000-0000-7000-8000-000000000000') = 'TENANTA', 'owner sets the trainer code and branding');

do $$ begin
  update tenants set app_name = repeat('x', 31) where id = 'a0000000-0000-7000-8000-000000000000';
  raise exception 'FAILED: 31-character app name saved';
exception when check_violation then raise notice 'ok - app names are capped at 30 characters';
end $$;

-- Assistant can't change branding.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
do $$ begin
  update tenants set join_code = 'HIJACK';
  if found then raise exception 'FAILED: assistant changed the trainer code'; end if;
  raise notice 'ok - assistant cannot change branding';
end $$;

-- Anyone with the code gets public branding only.
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select pg_temp.check((public.tenant_by_code(' tenant-a ') ->> 'slug') = 'tenant-a', 'shared app resolves a trainer code (case and spaces ignored)');
select pg_temp.check(not (public.tenant_by_code('TENANTA') ? 'stripeAccountId') and public.tenant_by_code('TENANTA')::text not like '%acct_secret%', 'trainer code lookup never exposes private fields');
select pg_temp.check(public.tenant_by_code('NOPE') is null, 'unknown code returns nothing');
reset role;

-- The Edge Function (service role) stores an encrypted credential.
insert into store_credentials (tenant_id, platform, ciphertext, iv, wrapped_key, kek_id, fingerprint, meta)
values ('a0000000-0000-7000-8000-000000000000', 'ios', 'Y2lwaGVy', 'aXY=', 'a2V5', 'kek-1', 'sha256:ab12', '{"keyId":"ABC123DEF4"}');

select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check((select fingerprint from store_credentials where platform = 'ios') = 'sha256:ab12', 'owner sees that a key exists');
do $$ begin
  perform ciphertext from store_credentials;
  raise exception 'FAILED: owner read credential ciphertext';
exception when insufficient_privilege then raise notice 'ok - owner cannot read the encrypted key back';
end $$;
do $$ begin
  insert into store_credentials (tenant_id, platform, ciphertext, iv, wrapped_key, kek_id, fingerprint)
  values ('a0000000-0000-7000-8000-000000000000', 'android', 'x', 'x', 'x', 'k', 'f');
  raise exception 'FAILED: credential inserted from the app';
exception when insufficient_privilege then raise notice 'ok - credentials can only be stored through the encrypting function';
end $$;

-- Owner queues a build; can't fake its result.
insert into publish_jobs (tenant_id, platform, kind, requested_by)
values ('a0000000-0000-7000-8000-000000000000', 'ios', 'build', 'a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check((select count(*) from publish_jobs where status = 'queued') = 1, 'owner queues a build');
do $$ begin
  insert into publish_jobs (tenant_id, platform, kind, status, store_status, requested_by)
  values ('a0000000-0000-7000-8000-000000000000', 'ios', 'submit', 'succeeded', 'live', 'a0000000-0000-7000-8000-0000000000a1');
  raise exception 'FAILED: owner marked a job live';
exception when insufficient_privilege then raise notice 'ok - only the build worker can set job results';
end $$;

-- Listing can't be confirmed with placeholders left in.
insert into listing_kits (tenant_id, description) values ('a0000000-0000-7000-8000-000000000000', 'Coaching for [[WHO]].');
do $$ begin
  update listing_kits set confirmed_at = now();
  raise exception 'FAILED: listing confirmed with placeholders';
exception when check_violation then raise notice 'ok - listing cannot be confirmed with placeholders left';
end $$;

-- Clients and assistants see none of it.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from publish_jobs) = 0 and (select count(*) from listing_kits) = 0, 'clients cannot see publishing data');
do $$ begin
  perform fingerprint from store_credentials;
  if found then raise exception 'FAILED: client saw a credential'; end if;
  raise notice 'ok - clients cannot see credentials';
end $$;
do $$ begin
  perform public.revoke_spotter_access('a0000000-0000-7000-8000-000000000000');
  raise exception 'FAILED: client revoked access';
exception when insufficient_privilege then raise notice 'ok - only the owner can revoke access';
end $$;

-- Owner revokes Spotter's access: keys gone, queued jobs cancelled, audit row written.
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
select pg_temp.check(public.revoke_spotter_access('a0000000-0000-7000-8000-000000000000', 'Moving platforms') = 1, 'revoke deletes the stored key');
select pg_temp.check((select count(*) from store_credentials) = 0, 'no credentials remain');
select pg_temp.check((select status from publish_jobs limit 1) = 'cancelled', 'queued builds are cancelled');
select pg_temp.check(exists (select 1 from audit_log where action = 'revoke_spotter_access'), 'revoke is written to the audit log');
reset role;
