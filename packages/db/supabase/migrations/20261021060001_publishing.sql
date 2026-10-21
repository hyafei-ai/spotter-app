-- White-label branding and publishing (W-1 to W-4).
--
-- Store credentials are encrypted before they reach the database: the store-credentials Edge Function
-- uses envelope encryption (a random AES-256-GCM data key per credential, wrapped with the
-- CREDENTIALS_KEK key held only in function secrets). The database stores ciphertext and the wrapped
-- key. Column privileges make the ciphertext unreadable to signed-in users, owners included; only
-- the service role (the build worker) can read it.

-- ---------- tenant branding fields ----------

alter table public.tenants
  add column splash_background text check (splash_background ~ '^#[0-9A-Fa-f]{6}$'),
  add column tab_labels jsonb not null default '{}'::jsonb,
  add column join_code text unique check (join_code ~ '^[A-Z0-9]{4,12}$'),
  add column eas_project_id text,
  add column update_channel text,
  add constraint tenants_app_name_len check (char_length(app_name) <= 30),
  add constraint tenants_short_name_len check (char_length(short_name) between 1 and 12);

-- Shared-app fallback: a client types their trainer's code into the shared Spotter app.
-- Returns public branding only (never Stripe ids, credentials or publish state).
create or replace function public.tenant_by_code(code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'appName', t.app_name, 'shortName', t.short_name, 'brandColor', t.brand_color,
    'units', t.units, 'weightIncrement', t.weight_increment, 'coach', t.coach_profile, 'modules', t.modules,
    'tabs', nullif(t.tab_labels, '{}'::jsonb), 'logoUrl', t.logo_url, 'supportEmail', t.support_email,
    'privacyPolicyUrl', t.privacy_policy_url, 'splashBackground', t.splash_background
  )
  from tenants t
  where t.join_code = upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'))
$$;
revoke all on function public.tenant_by_code(text) from public;
grant execute on function public.tenant_by_code(text) to anon, authenticated;

-- ---------- store credentials (encrypted) ----------

create table public.store_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  ciphertext text not null,          -- base64 AES-256-GCM ciphertext
  iv text not null,                  -- base64 nonce
  wrapped_key text not null,         -- base64 data key, wrapped with CREDENTIALS_KEK
  kek_id text not null,              -- which key-encryption key wrapped it (for rotation)
  fingerprint text not null,         -- sha256 of the plaintext, shown so owners can tell keys apart
  meta jsonb not null default '{}'::jsonb, -- non-secret: key id, issuer id, service-account email
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, platform)
);
alter table public.store_credentials enable row level security;
create trigger touch_updated_at before update on public.store_credentials for each row execute function public.touch_updated_at();

-- Owners may see that a key exists, never the key itself.
revoke all on public.store_credentials from anon, authenticated;
grant select (id, tenant_id, platform, fingerprint, meta, created_at, updated_at) on public.store_credentials to authenticated;
grant delete on public.store_credentials to authenticated;
create policy store_credentials_owner_read on public.store_credentials for select using (public.is_owner(tenant_id));
create policy store_credentials_owner_delete on public.store_credentials for delete using (public.is_owner(tenant_id));

-- ---------- publish jobs (admin job queue) ----------

create table public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  kind text not null check (kind in ('build', 'update', 'submit')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  store_status text not null default 'draft' check (store_status in ('draft', 'building', 'in_review', 'live', 'rejected')),
  rejection_code text,
  rejection_message text,              -- the store's own words
  eas_build_id text,
  log_url text,
  requested_by uuid references public.profiles (id),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.publish_jobs (status, created_at);
create index on public.publish_jobs (tenant_id, platform, created_at desc);
alter table public.publish_jobs enable row level security;
create trigger touch_updated_at before update on public.publish_jobs for each row execute function public.touch_updated_at();
create policy publish_jobs_owner_read on public.publish_jobs for select using (public.is_owner(tenant_id));
-- Owners queue jobs; only the worker (service role) changes their status.
create policy publish_jobs_owner_queue on public.publish_jobs for insert
  with check (public.is_owner(tenant_id) and status = 'queued' and requested_by = auth.uid());

-- Latest store status per platform, for the publishing assistant.
create or replace view public.publish_status with (security_invoker = true) as
  select distinct on (tenant_id, platform) tenant_id, platform, store_status, status, rejection_code, rejection_message, created_at
    from public.publish_jobs
   order by tenant_id, platform, created_at desc;

-- ---------- listing kit ----------

create table public.listing_kits (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  description text not null default '',
  screenshots jsonb not null default '[]'::jsonb,
  privacy jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A listing can't be confirmed while template placeholders remain.
  check (confirmed_at is null or description !~ '\[\[[^]]+\]\]')
);
alter table public.listing_kits enable row level security;
create trigger touch_updated_at before update on public.listing_kits for each row execute function public.touch_updated_at();
create policy listing_kits_owner on public.listing_kits for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));

-- ---------- leaving the platform (W-4) ----------

-- Deletes every stored store credential, cancels queued jobs and records it. Owner only.
create or replace function public.revoke_spotter_access(t uuid, reason text default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_owner(t) then
    raise exception 'Only the owner can revoke access.' using errcode = '42501';
  end if;
  delete from store_credentials where tenant_id = t;
  get diagnostics n = row_count;
  update publish_jobs set status = 'cancelled', finished_at = now() where tenant_id = t and status in ('queued', 'running');
  insert into audit_log (tenant_id, actor_id, action, target, reason)
  values (t, auth.uid(), 'revoke_spotter_access', format('%s store credential(s) deleted', n), reason);
  return n;
end $$;
revoke all on function public.revoke_spotter_access(uuid, text) from public;
grant execute on function public.revoke_spotter_access(uuid, text) to authenticated;
