-- Fixes for interactions between feature migrations, found when the builds were merged.

-- 1. The membership guard (20261021030001_ai) stops clients editing their own membership, which also
--    blocked delete_my_account (20261021070001_platform) from ending it. Account deletion now marks the
--    transaction, and the guard lets exactly that change through: this caller's membership to 'ended'.
create or replace function public.membership_client_update_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() = old.profile_id and not public.is_owner(old.tenant_id)
     and (new.role, new.status, new.assigned_coach_id, new.revenue_split, new.tenant_id, new.profile_id)
         is distinct from (old.role, old.status, old.assigned_coach_id, old.revenue_split, old.tenant_id, old.profile_id) then
    if current_setting('spotter.deleting_account', true) = old.profile_id::text
       and new.status = 'ended'
       and (new.role, new.assigned_coach_id, new.revenue_split, new.tenant_id, new.profile_id)
           is not distinct from (old.role, old.assigned_coach_id, old.revenue_split, old.tenant_id, old.profile_id) then
      return new;
    end if;
    raise exception 'Clients can’t change their membership.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m record;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  -- Transaction-local: lets the membership guard accept ending this caller's own memberships.
  perform set_config('spotter.deleting_account', uid::text, true);
  for m in select tenant_id from memberships where profile_id = uid loop
    insert into audit_log (tenant_id, actor_id, action, target) values (m.tenant_id, uid, 'account.delete', uid::text);
  end loop;
  delete from sessions where client_id = uid;              -- cascades to logged sets and PRs
  delete from intake_responses where client_id = uid;
  delete from devices where profile_id = uid;
  delete from notification_settings where profile_id = uid;
  delete from push_outbox where profile_id = uid;
  update messages set body = null, media_path = null, link = null where sender_id = uid;
  update memberships set status = 'ended' where profile_id = uid;
  update profiles set full_name = 'Deleted user', avatar_url = null where id = uid;
end $$;
grant execute on function public.delete_my_account() to authenticated;
