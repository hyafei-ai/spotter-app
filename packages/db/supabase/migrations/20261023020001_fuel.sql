-- Fuel check (docs/features/fuel.md): energy availability and the low-energy pattern screen.
-- Food logs, energy figures, body fat and bodyweight never reach the server from this feature. The client
-- owns its settings; the coach reads only the level and the signs' text, and only while the client shares.

create table public.fuel_settings (
  client_id uuid primary key references public.profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  body_fat_pct numeric check (body_fat_pct between 3 and 70),
  use_estimate boolean not null default false,
  intake_source text not null default 'auto' check (intake_source in ('health', 'spotter', 'auto')),
  -- "Share fuel check level with {coach}". Off by default.
  share_with_coach boolean not null default false,
  updated_at timestamptz not null default now(),
  client_mutation_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.fuel_shares (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  share_date date not null,
  level text not null check (level in ('none', 'watch', 'talk_to_someone')),
  -- Plain-text signs only, at most 6.
  signs jsonb not null default '[]'::jsonb check (jsonb_typeof(signs) = 'array' and jsonb_array_length(signs) <= 6),
  shared_at timestamptz not null,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  unique (client_id, share_date)
);
create index on public.fuel_shares (tenant_id, client_id, share_date desc);

alter table public.fuel_settings enable row level security;
alter table public.fuel_shares enable row level security;

-- Whether a client currently shares the fuel check. Security definer so the coach policy below can ask
-- without being able to read the client's settings row.
create or replace function public.fuel_shared(client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select share_with_coach from fuel_settings where client_id = client), false)
$$;
revoke all on function public.fuel_shared(uuid) from public;
grant execute on function public.fuel_shared(uuid) to authenticated;

-- Settings: the client's own row only. No coach policy on purpose.
create policy fuel_settings_own_read on public.fuel_settings for select using (client_id = auth.uid());
create policy fuel_settings_own_insert on public.fuel_settings for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy fuel_settings_own_update on public.fuel_settings for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy fuel_settings_own_delete on public.fuel_settings for delete using (client_id = auth.uid());

-- Shares: only the client writes. Coaches who can see the client read them while sharing is on;
-- turning sharing off hides every past share at once.
create policy fuel_shares_own_read on public.fuel_shares for select using (client_id = auth.uid());
create policy fuel_shares_own_insert on public.fuel_shares for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy fuel_shares_own_update on public.fuel_shares for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy fuel_shares_own_delete on public.fuel_shares for delete using (client_id = auth.uid());
create policy fuel_shares_coach_read on public.fuel_shares for select
  using (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id) and public.fuel_shared(client_id));

-- Triage reason list: the full list from 20261022090001_jtbd_integration.sql plus 'fuel_pattern'.
-- (Other physiology builds may add reasons too; the integrator reconciles the final list.)
alter table public.triage_items drop constraint if exists triage_items_reason_code_check;
alter table public.triage_items add constraint triage_items_reason_code_check check (reason_code in (
  'payment_failed', 'parq_flag', 'form_check_waiting', 'check_in_submitted', 'unread_message', 'missed_sessions', 'churn_risk', 'new_client',
  'follow_up_due', 'sleep_short_streak', 'load_spike',
  'check_in_request',
  'fuel_pattern'
));

-- A shared "worth talking to someone" level opens one "Fuel check flagged" item for the coach, once per
-- open item. Runs inside the sync handler's write (security definer: clients can't write triage_items).
create or replace function public.fuel_share_triage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.level = 'talk_to_someone' and public.fuel_shared(new.client_id)
     and not exists (select 1 from triage_items t where t.tenant_id = new.tenant_id and t.client_id = new.client_id
                     and t.reason_code = 'fuel_pattern' and t.handled_at is null) then
    insert into triage_items (tenant_id, client_id, reason_code, priority, detail, since)
    values (new.tenant_id, new.client_id, 'fuel_pattern', 62,
            jsonb_build_object('text', 'Fuel check flagged: worth a conversation', 'date', new.share_date), new.shared_at);
  end if;
  return new;
end $$;
create trigger fuel_share_triage after insert or update on public.fuel_shares for each row execute function public.fuel_share_triage();

-- Offline mutations from the client app (see 20261021000001_sync_dispatch.sql).
create or replace function public.sync_handle_fuel(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
begin
  if kind not in ('fuel.settings.set', 'fuel.pattern.share') then
    return null;
  end if;
  select m.tenant_id into tenant from memberships m
   where m.profile_id = uid and m.role = 'client' and m.status in ('active', 'paused')
   order by m.created_at desc limit 1;
  if tenant is null then
    raise exception 'You’re not a client of a coach on Spotter.' using errcode = '42501';
  end if;

  case kind
    when 'fuel.settings.set' then
      insert into fuel_settings (client_id, tenant_id, body_fat_pct, use_estimate, intake_source, share_with_coach, updated_at, client_mutation_id)
      values (uid, tenant, (p ->> 'bodyFatPct')::numeric, coalesce((p ->> 'useEstimate')::boolean, false),
              coalesce(p ->> 'intakeSource', 'auto'), coalesce((p ->> 'shareWithCoach')::boolean, false),
              (p ->> 'updatedAt')::timestamptz, mid)
      on conflict (client_id) do update
        set tenant_id = excluded.tenant_id, body_fat_pct = excluded.body_fat_pct, use_estimate = excluded.use_estimate,
            intake_source = excluded.intake_source, share_with_coach = excluded.share_with_coach,
            updated_at = excluded.updated_at, client_mutation_id = excluded.client_mutation_id
        where fuel_settings.updated_at <= excluded.updated_at;
      return tenant;

    when 'fuel.pattern.share' then
      if not public.fuel_shared(uid) then
        raise exception 'Fuel check sharing is off.' using errcode = '42501';
      end if;
      insert into fuel_shares (tenant_id, client_id, share_date, level, signs, shared_at, client_mutation_id)
      values (tenant, uid, (p ->> 'date')::date, p ->> 'level', coalesce(p -> 'signs', '[]'::jsonb), (p ->> 'sharedAt')::timestamptz, mid)
      on conflict (client_id, share_date) do update
        set level = excluded.level, signs = excluded.signs, shared_at = excluded.shared_at, client_mutation_id = excluded.client_mutation_id
        where fuel_shares.shared_at <= excluded.shared_at;
      return tenant;
  end case;
end $$;
