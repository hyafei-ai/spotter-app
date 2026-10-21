-- Fixes for interactions between the three JTBD builds (daily read, coach memory, retention),
-- found when they were merged.

-- 1. Coach memory and retention each replaced the triage reason list with their own; the later one
--    dropped the other's reasons. One list with all of them.
alter table public.triage_items drop constraint if exists triage_items_reason_code_check;
alter table public.triage_items add constraint triage_items_reason_code_check check (reason_code in (
  'payment_failed', 'parq_flag', 'form_check_waiting', 'check_in_submitted', 'unread_message', 'missed_sessions', 'churn_risk', 'new_client',
  'follow_up_due', 'sleep_short_streak', 'load_spike',
  'check_in_request'
));

-- 2. Short-sleep streaks: daily_checks keys days by check_date (not date). Only reads the client
--    shared count, so a private day never raises anything for the coach.
create or replace function public.raise_sleep_streaks(on_day date default current_date) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
begin
  if to_regclass('public.daily_checks') is null then return 0; end if;
  for r in
    select tenant_id, client_id, count(*)::int as nights
      from public.daily_checks
     where share_with_coach and sleep_hours < 6.5 and check_date between on_day - 2 and on_day
     group by tenant_id, client_id
    having count(distinct check_date) = 3
  loop
    if not exists (select 1 from triage_items t where t.tenant_id = r.tenant_id and t.client_id = r.client_id
                   and t.reason_code = 'sleep_short_streak' and t.handled_at is null) then
      insert into triage_items (tenant_id, client_id, reason_code, priority, detail, since)
      values (r.tenant_id, r.client_id, 'sleep_short_streak', 45,
              jsonb_build_object('count', r.nights, 'text', format('Short sleep %s nights running', r.nights)), on_day::timestamptz);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.raise_sleep_streaks(date) from public, anon, authenticated;
grant execute on function public.raise_sleep_streaks(date) to service_role;

-- 3. Easy-day reads for the owner's risk signals: the tone lives in shared_read (stored only when the
--    client shared that day). Private days are never counted, so owners only see what clients shared.
create or replace function public.ease_reads(t uuid, client uuid, from_day date, to_day date) returns int
language sql stable security invoker set search_path = public as $$
  select count(*)::int from public.daily_checks
   where tenant_id = t and client_id = client and check_date >= from_day and check_date < to_day
     and share_with_coach and shared_read ->> 'tone' = 'ease'
$$;
