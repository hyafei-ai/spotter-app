-- Platform plumbing (builder G): invites (C-1), push settings and outbox, consent records,
-- team handoff history (K-8), saved replies and bulk messages (K-1), message attachments and
-- read receipts (C-6), time-boxed platform-admin support access, account deletion, sync pull.

-- ---------- invites ----------

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name text,
  role public.member_role not null default 'client' check (role in ('client', 'assistant')),
  token_hash text not null unique,           -- sha256 of the token in the link; the token itself is never stored
  invited_by uuid not null references public.profiles (id),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.invites (tenant_id, created_at desc);

-- Accepting an invite: verifies the token, creates the membership (and the client's thread),
-- and marks the invite used. Runs as definer because the caller isn't a member yet.
create or replace function public.accept_invite(token text, full_name text default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  inv invites%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in to accept the invite.' using errcode = '42501'; end if;
  select * into inv from invites where token_hash = encode(digest(token, 'sha256'), 'hex') for update;
  if not found or inv.revoked_at is not null then
    raise exception 'This invite isn’t valid. Ask your coach for a new link.' using errcode = 'P0002';
  end if;
  if inv.accepted_at is not null and inv.accepted_by is distinct from uid then
    raise exception 'This invite has already been used.' using errcode = 'P0002';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invite has expired. Ask your coach for a new link.' using errcode = 'P0002';
  end if;

  insert into profiles (id, full_name) values (uid, coalesce(full_name, inv.full_name, ''))
    on conflict (id) do nothing;
  insert into memberships (tenant_id, profile_id, role, assigned_coach_id)
    values (inv.tenant_id, uid, inv.role, case when inv.role = 'client' then inv.invited_by end)
    on conflict (tenant_id, profile_id) do update set status = 'active';
  if inv.role = 'client' then
    insert into threads (id, tenant_id, client_id) values (gen_random_uuid(), inv.tenant_id, uid)
      on conflict (tenant_id, client_id) do nothing;
    insert into coach_assignments (tenant_id, client_id, coach_id, assigned_by, note)
      values (inv.tenant_id, uid, inv.invited_by, inv.invited_by, 'Joined by invite');
    insert into triage_items (tenant_id, client_id, reason_code, priority) values (inv.tenant_id, uid, 'new_client', 30);
  end if;
  update invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.tenant_id;
end $$;
grant execute on function public.accept_invite(text, text) to authenticated;

-- ---------- push: devices, settings, outbox ----------

alter table public.devices
  add column last_seen_at timestamptz not null default now(),
  add column disabled_at timestamptz;      -- set when Expo reports DeviceNotRegistered

create table public.notification_settings (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  settings jsonb not null,                 -- NotificationSettings in packages/core/src/platform.ts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, profile_id),
  check (jsonb_typeof(settings -> 'enabled') = 'object' and settings ? 'timezone')
);

-- Notifications held for quiet hours, and a record of what was sent.
create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.push_outbox (send_after) where sent_at is null;

-- ---------- consent (GDPR / UK GDPR / CCPA) ----------

create table public.consents (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('terms_privacy', 'marketing', 'health_data')),
  granted boolean not null,
  version text not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.consents (profile_id, kind, recorded_at desc);

-- ---------- team (K-8) ----------

-- Who coached a client, when. memberships.assigned_coach_id is the current coach; this keeps history.
create table public.coach_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.profiles (id),
  assigned_by uuid references public.profiles (id),
  note text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index coach_assignments_one_current on public.coach_assignments (tenant_id, client_id) where ended_at is null;

-- Owner hands a client to another coach. Logs, messages and programs stay with the client,
-- so the new coach sees the full history (visibility follows memberships.assigned_coach_id).
create or replace function public.hand_off_client(t uuid, client uuid, to_coach uuid, note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(t) then raise exception 'Only the owner can move clients between coaches.' using errcode = '42501'; end if;
  if not exists (select 1 from memberships where tenant_id = t and profile_id = to_coach and role in ('owner', 'assistant') and status = 'active') then
    raise exception 'That coach isn’t on your team.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from memberships where tenant_id = t and profile_id = client and role = 'client') then
    raise exception 'That client isn’t in your business.' using errcode = 'P0002';
  end if;
  update coach_assignments set ended_at = now() where tenant_id = t and client_id = client and ended_at is null;
  insert into coach_assignments (tenant_id, client_id, coach_id, assigned_by, note) values (t, client, to_coach, auth.uid(), note);
  update memberships set assigned_coach_id = to_coach where tenant_id = t and profile_id = client;
  insert into audit_log (tenant_id, actor_id, action, target, reason) values (t, auth.uid(), 'client.hand_off', client::text, note);
end $$;
grant execute on function public.hand_off_client(uuid, uuid, uuid, text) to authenticated;

-- Billing, branding and publishing are owner-only (UX finding M1). Billing tables should use this in their policies.
create or replace function public.can_see_billing(t uuid) returns boolean
language sql stable as $$ select public.is_owner(t) $$;

-- ---------- inbox tools (K-1) ----------

create table public.saved_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.messages
  add column media_path text,
  add column duration_ms int check (duration_ms >= 0),
  add column link jsonb;

-- One message to many clients. SECURITY INVOKER: RLS decides which threads the coach may post in;
-- clients the coach can't see are skipped and not counted.
create or replace function public.send_bulk_message(t uuid, client_ids uuid[], body text)
returns int
language plpgsql security invoker set search_path = public as $$
declare
  n int := 0;
  th record;
begin
  if not public.is_coach(t) then raise exception 'Only coaches can message clients in bulk.' using errcode = '42501'; end if;
  if char_length(coalesce(body, '')) not between 1 and 4000 then raise exception 'Write a message first.' using errcode = '22023'; end if;
  for th in select id from threads where tenant_id = t and client_id = any (client_ids) and public.can_see_client(t, client_id) loop
    insert into messages (id, tenant_id, thread_id, sender_id, kind, body) values (gen_random_uuid(), t, th.id, auth.uid(), 'text', body);
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.send_bulk_message(uuid, uuid[], text) to authenticated;

-- Read receipts: marks the other side's messages read up to a time.
create or replace function public.mark_thread_read(thread uuid, up_to timestamptz)
returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update messages set read_at = now()
   where thread_id = thread and sender_id <> auth.uid() and read_at is null and sent_at <= up_to;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.mark_thread_read(uuid, timestamptz) to authenticated;

-- ---------- platform-admin support access ----------

create table public.platform_admins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  admin_id uuid not null references public.profiles (id),
  reason text not null check (char_length(reason) >= 10),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > granted_at and expires_at <= granted_at + interval '60 minutes')
);

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where profile_id = auth.uid())
$$;

-- Opens a time-boxed, reasoned support session and writes it to the tenant's audit log.
create or replace function public.open_support_session(t uuid, reason text, minutes int default 30)
returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if not public.is_platform_admin() then raise exception 'Support access is for Spotter staff only.' using errcode = '42501'; end if;
  if minutes not between 1 and 60 then raise exception 'Support sessions last 1 to 60 minutes.' using errcode = '22023'; end if;
  insert into support_grants (tenant_id, admin_id, reason, expires_at)
    values (t, auth.uid(), reason, now() + make_interval(mins => minutes)) returning id into g;
  insert into audit_log (tenant_id, actor_id, action, target, reason) values (t, auth.uid(), 'support.open', g::text, reason);
  return g;
end $$;
grant execute on function public.open_support_session(uuid, text, int) to authenticated;

create or replace function public.has_support_access(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from support_grants
     where tenant_id = t and admin_id = auth.uid() and revoked_at is null and now() < expires_at
  )
$$;

-- Read-only support visibility on the tables support usually needs.
do $$
declare tb text;
begin
  foreach tb in array array['memberships','sessions','logged_sets','threads','messages','triage_items','intake_responses','assignments','devices']
  loop
    execute format('create policy %1$s_support_read on public.%1$I for select using (public.has_support_access(tenant_id))', tb);
  end loop;
end $$;

-- ---------- account deletion ----------

-- Deletes or anonymises the caller's personal data. Signed waivers are kept (immutable legal record);
-- the Edge Function then removes the auth user with the service role.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m record;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
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

-- ---------- sync pull ----------

-- Everything the client app caches offline that changed since a cursor (GET /sync/pull).
-- SECURITY INVOKER, so RLS limits it to the caller's own rows.
create or replace function public.sync_pull(since timestamptz default '-infinity')
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'cursor', now(),
    'tenants', coalesce((select jsonb_agg(to_jsonb(x)) from tenants x where x.updated_at > since), '[]'),
    'assignments', coalesce((select jsonb_agg(to_jsonb(x)) from assignments x where x.updated_at > since and x.client_id = auth.uid()), '[]'),
    'programs', coalesce((select jsonb_agg(to_jsonb(x)) from programs x where x.updated_at > since and public.is_assigned(x.id)), '[]'),
    'program_weeks', coalesce((select jsonb_agg(to_jsonb(x)) from program_weeks x where x.updated_at > since and public.is_assigned(x.program_id)), '[]'),
    'program_days', coalesce((select jsonb_agg(to_jsonb(x)) from program_days x where x.updated_at > since and public.is_assigned(x.program_id)), '[]'),
    'exercises', coalesce((select jsonb_agg(to_jsonb(e)) from exercises e where e.updated_at > since
        and exists (select 1 from program_exercises pe where pe.exercise_id = e.id and public.is_assigned(pe.program_id))), '[]'),
    'program_exercises', coalesce((select jsonb_agg(to_jsonb(x)) from program_exercises x where x.updated_at > since and public.is_assigned(x.program_id)), '[]'),
    'prescribed_sets', coalesce((select jsonb_agg(to_jsonb(x)) from prescribed_sets x where x.updated_at > since and public.is_assigned(x.program_id)), '[]'),
    'progression_rules', coalesce((select jsonb_agg(to_jsonb(x)) from progression_rules x where x.updated_at > since and public.is_assigned(x.program_id)), '[]'),
    'sessions', coalesce((select jsonb_agg(to_jsonb(x)) from sessions x where x.updated_at > since and x.client_id = auth.uid() and x.started_at > now() - interval '30 days'), '[]'),
    'logged_sets', coalesce((select jsonb_agg(to_jsonb(x)) from logged_sets x where x.updated_at > since and x.client_id = auth.uid() and x.logged_at > now() - interval '30 days'), '[]'),
    'messages', coalesce((select jsonb_agg(to_jsonb(x) order by x.sent_at) from (
        select m.* from messages m join threads th on th.id = m.thread_id
         where m.updated_at > since and th.client_id = auth.uid() order by m.sent_at desc limit 200) x), '[]'),
    'intake_forms', coalesce((select jsonb_agg(to_jsonb(x)) from intake_forms x where x.updated_at > since and x.is_default), '[]')
  )
$$;
grant execute on function public.sync_pull(timestamptz) to authenticated;

-- ---------- offline mutation kinds ----------

create or replace function public.sync_handle_platform(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare tenant uuid;
begin
  case kind
    when 'message.attach' then
      select t.tenant_id into tenant from threads t where t.id = (p ->> 'threadId')::uuid;
      if tenant is null then raise exception 'This conversation isn’t available.' using errcode = 'P0002'; end if;
      insert into messages (id, tenant_id, thread_id, sender_id, kind, body, media_path, duration_ms, link, sent_at, client_mutation_id)
      values ((p ->> 'messageId')::uuid, tenant, (p ->> 'threadId')::uuid, uid, p ->> 'kind', p ->> 'body', p ->> 'mediaPath',
              (p ->> 'durationMs')::int, p -> 'link', (p ->> 'sentAt')::timestamptz, mid)
      on conflict (id) do nothing;
      return tenant;
    when 'message.read' then
      select t.tenant_id into tenant from threads t where t.id = (p ->> 'threadId')::uuid;
      if tenant is null then raise exception 'This conversation isn’t available.' using errcode = 'P0002'; end if;
      perform public.mark_thread_read((p ->> 'threadId')::uuid, (p ->> 'upTo')::timestamptz);
      return tenant;
    when 'consent.record' then
      select m.tenant_id into tenant from memberships m where m.profile_id = uid order by m.created_at desc limit 1;
      if tenant is null then raise exception 'Join a coach before recording consent.' using errcode = 'P0002'; end if;
      insert into consents (id, tenant_id, profile_id, kind, granted, version, recorded_at)
      values ((p ->> 'consentId')::uuid, tenant, uid, p ->> 'kind', (p ->> 'granted')::boolean, p ->> 'version', (p ->> 'recordedAt')::timestamptz)
      on conflict (id) do nothing;
      return tenant;
    else
      return null;
  end case;
end $$;

-- ---------- RLS ----------

alter table public.invites enable row level security;
alter table public.notification_settings enable row level security;
alter table public.push_outbox enable row level security;
alter table public.consents enable row level security;
alter table public.coach_assignments enable row level security;
alter table public.saved_replies enable row level security;
alter table public.platform_admins enable row level security;
alter table public.support_grants enable row level security;

-- Coaches see their tenant's invites; only the owner can invite assistants.
create policy invites_read on public.invites for select using (public.is_coach(tenant_id));
create policy invites_insert on public.invites for insert with check (
  invited_by = auth.uid() and public.is_coach(tenant_id) and (role = 'client' or public.is_owner(tenant_id))
);
create policy invites_revoke on public.invites for update using (public.is_coach(tenant_id)) with check (public.is_coach(tenant_id));

create policy notification_settings_self on public.notification_settings for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.is_member(tenant_id));
create policy push_outbox_self_read on public.push_outbox for select using (profile_id = auth.uid());

create policy consents_self on public.consents for select using (profile_id = auth.uid() or public.is_owner(tenant_id));
create policy consents_insert on public.consents for insert with check (profile_id = auth.uid() and public.is_member(tenant_id));

create policy coach_assignments_read on public.coach_assignments for select using (public.can_see_client(tenant_id, client_id));

create policy saved_replies_own on public.saved_replies for all
  using (coach_id = auth.uid() and public.is_coach(tenant_id)) with check (coach_id = auth.uid() and public.is_coach(tenant_id));

create policy platform_admins_self on public.platform_admins for select using (profile_id = auth.uid());
create policy support_grants_read on public.support_grants for select using (admin_id = auth.uid() or public.is_owner(tenant_id));

do $$
declare t text;
begin
  foreach t in array array['invites','notification_settings','push_outbox','consents','coach_assignments','saved_replies','platform_admins','support_grants']
  loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Realtime: messages and triage changes are broadcast to subscribers (RLS still applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.triage_items;
  end if;
end $$;
