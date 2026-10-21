-- Cross-feature checks added when the feature builds were merged.
\set ON_ERROR_STOP 1

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- Account deletion (70_platform deletes client A2) ends their membership despite the membership guard.
select pg_temp.check((select status = 'ended' from memberships where profile_id = 'a0000000-0000-7000-8000-0000000000c2'),
  'deleting an account ends the membership');

-- A client still can't end their own membership directly.
select set_config('request.jwt.claim.sub', 'a0000000-0000-7000-8000-0000000000c1', false);
set role authenticated;
do $$ begin
  update memberships set status = 'ended' where profile_id = 'a0000000-0000-7000-8000-0000000000c1';
  if found then raise exception 'FAILED: client ended their membership directly'; end if;
  raise notice 'ok - clients can’t end their own membership outside account deletion';
exception when insufficient_privilege then raise notice 'ok - clients can’t end their own membership outside account deletion';
end $$;
-- The deletion flag is transaction-local and doesn't leak.
select pg_temp.check(coalesce(current_setting('spotter.deleting_account', true), '') = '', 'no account-deletion flag outside delete_my_account');
reset role;
