-- Daily read (client JTBD: train around body variance and share the read with the coach without extra effort).
-- The client owns their daily checks. Coaches never select from daily_checks: they call shared_reads_for_coach,
-- which returns only what the client shared, and the cycle phase only when the client shared it that day.

create table public.daily_checks (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  check_date date not null,
  sleep_hours numeric check (sleep_hours between 0 and 16),
  sleep_source text check (sleep_source in ('health', 'manual')),
  energy smallint check (energy between 1 and 5),
  soreness smallint check (soreness between 1 and 5),
  stress smallint check (stress between 1 and 5),
  cycle_phase text check (cycle_phase in ('menstrual', 'follicular', 'ovulation', 'luteal')),
  share_cycle boolean not null default false,
  note text check (char_length(note) <= 300),
  share_with_coach boolean not null default true,
  -- The read the client saw (packages/core signals.ts dailyRead → sharedRead), stored only when shared.
  shared_read jsonb,
  submitted_at timestamptz not null,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, check_date),
  check (share_with_coach or shared_read is null),
  check (cycle_phase is not null or not share_cycle)
);

alter table public.daily_checks enable row level security;
create trigger touch_updated_at before update on public.daily_checks for each row execute function public.touch_updated_at();

-- Own rows only. No coach policy on purpose: coaches read through the RPC below.
create policy daily_checks_own_read on public.daily_checks for select using (client_id = auth.uid());
create policy daily_checks_own_insert on public.daily_checks for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy daily_checks_own_update on public.daily_checks for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy daily_checks_own_delete on public.daily_checks for delete using (client_id = auth.uid());

-- Which version of a session the client chose from the read. Coaches see it with the session (sessions_read).
alter table public.sessions add column session_variant text not null default 'planned'
  check (session_variant in ('planned', 'lighter', 'recovery'));

-- The coach's view of a client's recent daily reads. Private days come back as shared = false with nothing else.
create or replace function public.shared_reads_for_coach(client uuid)
returns table (check_date date, submitted_at timestamptz, shared boolean, shared_read jsonb, cycle_phase text)
language sql stable security definer set search_path = public as $$
  select d.check_date,
         d.submitted_at,
         d.share_with_coach,
         case when not d.share_with_coach or d.shared_read is null then null
              when d.share_cycle then d.shared_read
              else jsonb_set(d.shared_read, '{factors}', coalesce((
                     select jsonb_agg(f) from jsonb_array_elements(d.shared_read -> 'factors') f
                      where f ->> 'kind' <> 'cycle_phase'), '[]'::jsonb))
         end,
         case when d.share_with_coach and d.share_cycle then d.cycle_phase end
    from daily_checks d
   where d.client_id = client
     and public.is_coach(d.tenant_id)
     and public.can_see_client(d.tenant_id, d.client_id)
   order by d.check_date desc
   limit 28
$$;
revoke all on function public.shared_reads_for_coach(uuid) from public;
grant execute on function public.shared_reads_for_coach(uuid) to authenticated;

-- Offline mutations from the client app (see 20261021000001_sync_dispatch.sql).
create or replace function public.sync_handle_daily(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
  shares boolean;
begin
  case kind
    when 'daily_check.submit' then
      select m.tenant_id into tenant from memberships m
       where m.profile_id = uid and m.role = 'client' and m.status in ('active', 'paused')
       order by m.created_at desc limit 1;
      if tenant is null then
        raise exception 'You’re not a client of a coach on Spotter.' using errcode = '42501';
      end if;
      shares := coalesce((p ->> 'shareWithCoach')::boolean, false);
      insert into daily_checks (id, tenant_id, client_id, check_date, sleep_hours, sleep_source, energy, soreness, stress,
                                cycle_phase, share_cycle, note, share_with_coach, shared_read, submitted_at, client_mutation_id)
      values ((p ->> 'checkId')::uuid, tenant, uid, (p ->> 'date')::date, (p ->> 'sleepHours')::numeric, p ->> 'sleepSource',
              (p ->> 'energy')::smallint, (p ->> 'soreness')::smallint, (p ->> 'stress')::smallint,
              p ->> 'cyclePhase', coalesce((p ->> 'shareCycle')::boolean, false) and p ->> 'cyclePhase' is not null,
              p ->> 'note', shares, case when shares then nullif(p -> 'sharedRead', 'null'::jsonb) end,
              (p ->> 'submittedAt')::timestamptz, mid)
      on conflict (client_id, check_date) do update
        set sleep_hours = excluded.sleep_hours, sleep_source = excluded.sleep_source, energy = excluded.energy,
            soreness = excluded.soreness, stress = excluded.stress, cycle_phase = excluded.cycle_phase,
            share_cycle = excluded.share_cycle, note = excluded.note, share_with_coach = excluded.share_with_coach,
            shared_read = excluded.shared_read, submitted_at = excluded.submitted_at, client_mutation_id = excluded.client_mutation_id
        where daily_checks.submitted_at <= excluded.submitted_at;
      return tenant;

    when 'session.variant' then
      update sessions set session_variant = p ->> 'variant'
       where id = (p ->> 'sessionId')::uuid and client_id = uid
      returning tenant_id into tenant;
      if tenant is null then
        raise exception 'That session isn’t on your log.' using errcode = 'P0002';
      end if;
      return tenant;

    else
      return null;
  end case;
end $$;
