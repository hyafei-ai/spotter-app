-- Physiology integration (docs/physiology.md).

-- 1. Owners never see health-derived signals. The owner's members-at-risk list used to count shared
--    easy-day reads ("Rough recovery"); coaches get that through their own shared data instead.
create or replace function public.ease_reads(t uuid, client uuid, from_day date, to_day date) returns int
language sql stable security invoker set search_path = public as $$
  select 0
$$;

-- 2. Deleting an account removes the athlete's own health rows: daily checks (they can hold a cycle
--    phase and notes), fuel settings and shares, pain logs, wearable days and imported workouts. Same
--    hook as cycle_forget_on_account_delete (20261023010001_cycle.sql); tables that don't exist yet are skipped.
create or replace function public.health_forget_on_account_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tbl text;
begin
  if new.status = 'ended' and current_setting('spotter.deleting_account', true) = new.profile_id::text then
    foreach tbl in array array['daily_checks', 'fuel_settings', 'fuel_shares', 'pain_logs', 'wearable_days', 'imported_workouts'] loop
      if to_regclass('public.' || tbl) is not null then
        execute format('delete from public.%I where client_id = $1', tbl) using new.profile_id;
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger health_forget_on_account_delete after update of status on public.memberships
  for each row execute function public.health_forget_on_account_delete();

-- 3. One triage reason list for every build: the fuel and brief migrations each redefined it with only
--    their own addition.
alter table public.triage_items drop constraint if exists triage_items_reason_code_check;
alter table public.triage_items add constraint triage_items_reason_code_check check (reason_code in (
  'payment_failed', 'parq_flag', 'form_check_waiting', 'check_in_submitted', 'unread_message', 'missed_sessions', 'churn_risk', 'new_client',
  'follow_up_due', 'sleep_short_streak', 'load_spike',
  'check_in_request',
  'fuel_pattern', 'pain_ongoing'
));
