-- Spotter core schema: tenancy, programs, logging, messaging, triage, AI audit.
-- Phases 1–3 of the build plan. Nutrition, video/form checks, check-ins, payments and Grow
-- tables arrive with their phases.
--
-- Rules (requirements doc, Data model):
--  * every table except tenants and profiles has tenant_id not null, created_at, updated_at
--  * IDs are UUIDv7 generated on device, so offline-created rows keep their IDs
--  * RLS on every table

create extension if not exists pgcrypto;

-- ---------- helpers ----------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- tenancy ----------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  app_name text not null check (char_length(app_name) between 1 and 30),
  short_name text not null,
  brand_color text not null check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text,
  icon_url text,
  units text not null default 'kg' check (units in ('kg', 'lb')),
  weight_increment numeric not null default 2.5 check (weight_increment > 0),
  coach_profile jsonb not null default '{}'::jsonb,   -- name, monogram, welcome message, rest-day line
  modules jsonb not null default '{"nutrition":true,"checkIns":true,"formChecks":true,"habits":true,"storefront":false}'::jsonb,
  bundle_ids jsonb not null default '{}'::jsonb,
  support_email text,
  privacy_policy_url text,
  stripe_account_id text,
  publish_status text not null default 'draft' check (publish_status in ('draft', 'building', 'in_review', 'live', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key,                       -- = auth.users.id
  full_name text not null default '',
  avatar_url text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'assistant', 'client', 'buyer');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  status text not null default 'active' check (status in ('invited', 'active', 'paused', 'ended')),
  assigned_coach_id uuid references public.profiles (id),
  revenue_split numeric check (revenue_split between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, profile_id)
);
create index on public.memberships (profile_id);
create index on public.memberships (tenant_id, assigned_coach_id);

-- Membership checks. SECURITY DEFINER so policies on memberships don't recurse; each one
-- only ever answers about the calling user (auth.uid()).
create or replace function public.has_role(t uuid, roles public.member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.tenant_id = t and m.profile_id = auth.uid() and m.status in ('active', 'paused') and m.role = any (roles)
  )
$$;

create or replace function public.is_member(t uuid) returns boolean
language sql stable as $$ select public.has_role(t, array['owner', 'assistant', 'client', 'buyer']::public.member_role[]) $$;

create or replace function public.is_coach(t uuid) returns boolean
language sql stable as $$ select public.has_role(t, array['owner', 'assistant']::public.member_role[]) $$;

create or replace function public.is_owner(t uuid) returns boolean
language sql stable as $$ select public.has_role(t, array['owner']::public.member_role[]) $$;

-- The client themself, the tenant owner, or the assistant coach assigned to that client.
create or replace function public.can_see_client(t uuid, client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select client = auth.uid()
      or public.is_owner(t)
      or exists (
        select 1 from memberships m
        where m.tenant_id = t and m.profile_id = client and m.assigned_coach_id = auth.uid()
          and public.has_role(t, array['assistant']::public.member_role[])
      )
$$;

-- ---------- onboarding ----------

create table public.intake_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  schema jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.intake_responses (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  form_key text not null,
  answers jsonb not null,
  parq_flag boolean not null default false,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.waivers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  version int not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version)
);

create table public.waiver_signatures (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  client_id uuid not null references public.profiles (id) on delete restrict,
  waiver_version int not null,
  signed_name text not null,
  signature_svg text not null,
  ip inet,                 -- recorded at upload (may differ from where it was signed offline)
  app_version text not null,
  pdf_url text,
  signed_at timestamptz not null,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A signed copy is immutable. Only the PDF link may be filled in once, by the renderer.
create or replace function public.waiver_signature_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'signed waivers cannot be deleted' using errcode = '42501';
  end if;
  if (new.signed_name, new.signature_svg, new.signed_at, new.client_id, new.waiver_version)
     is distinct from (old.signed_name, old.signature_svg, old.signed_at, old.client_id, old.waiver_version)
     or (old.pdf_url is not null and new.pdf_url is distinct from old.pdf_url) then
    raise exception 'signed waivers are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger waiver_signature_immutable before update or delete on public.waiver_signatures
  for each row execute function public.waiver_signature_immutable();

-- ---------- programs ----------

create table public.exercises (
  id text primary key,                         -- slug, e.g. 'back-squat'; custom: '<tenant-slug>/<slug>'
  tenant_id uuid references public.tenants (id) on delete cascade,  -- null = built-in starter library
  name text not null,
  tags text[] not null default '{}',
  equipment text[] not null default '{}',
  default_metric text not null default 'weight_reps' check (default_metric in ('weight_reps', 'bodyweight_reps', 'time', 'distance')),
  demo_video_id uuid,
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  is_template boolean not null default true,
  source_program_id uuid references public.programs (id),
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_weeks (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  week_index int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, week_index)
);

create table public.program_days (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  week_id uuid not null references public.program_weeks (id) on delete cascade,
  day_index int not null,
  title text not null,
  coach_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_exercises (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  program_day_id uuid not null references public.program_days (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  position int not null,
  superset_group text,
  metric text not null check (metric in ('weight_reps', 'bodyweight_reps', 'time', 'distance')),
  rest_s int not null default 90,
  tempo text,
  note text,
  track_rpe boolean not null default false,
  alternatives text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prescribed_sets (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  program_exercise_id uuid not null references public.program_exercises (id) on delete cascade,
  set_index int not null,
  reps_min int,
  reps_max int,
  load_type text not null default 'absolute' check (load_type in ('absolute', 'pct_1rm', 'rpe', 'bodyweight')),
  load_value numeric,          -- kg for absolute, 0–1 for pct_1rm, RPE for rpe
  rpe numeric check (rpe between 1 and 10),
  rest_s int,
  tempo text,
  duration_s int,
  distance_m numeric,
  amrap boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_exercise_id, set_index)
);

create table public.progression_rules (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  program_exercise_id uuid not null references public.program_exercises (id) on delete cascade,
  condition jsonb not null,            -- {"maxRpe": 8}
  increment numeric not null check (increment > 0),
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  sessions_required int not null default 2 check (sessions_required between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.assignments (client_id, status);

create or replace function public.is_assigned(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignments a where a.program_id = p and a.client_id = auth.uid() and a.status <> 'ended')
$$;

-- ---------- logging ----------

create table public.sessions (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  program_day_id uuid references public.program_days (id) on delete set null,
  scheduled_date date,
  started_at timestamptz not null,
  finished_at timestamptz,
  feel smallint check (feel between 1 and 5),
  note text,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sessions (client_id, started_at desc);

create table public.logged_sets (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  program_exercise_id uuid not null,
  exercise_id text not null references public.exercises (id),
  set_index int not null,
  weight numeric check (weight >= 0),       -- kg
  reps int check (reps >= 0),
  rpe numeric check (rpe between 1 and 10),
  duration_s int,
  distance_m numeric,
  logged_at timestamptz not null,
  voided_at timestamptz,                    -- "Undo"; rows are never deleted by the client
  client_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, program_exercise_id, set_index)
);
create index on public.logged_sets (client_id, exercise_id, logged_at);

create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  type text not null check (type in ('heaviest', 'e1rm', 'most_reps')),
  value numeric not null,
  previous numeric not null,
  session_id uuid not null references public.sessions (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, exercise_id, type)
);

-- Epley estimate, trusted for 1–12 reps only (matches estimatedOneRepMax in packages/core).
create or replace function public.e1rm(w numeric, r int) returns numeric
language sql immutable as $$
  select case when r is null or w is null or w <= 0 or r < 1 or r > 12 then null
              when r = 1 then w
              else w * (1 + r / 30.0) end
$$;

-- PRs are derived, never entered. Same rules as packages/core/src/records.ts:
-- no earlier history → no PR; an e1RM PR is skipped when it coincides with a heaviest-weight PR.
create or replace function public.derive_personal_records() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prev_heaviest numeric; prev_e1rm numeric; prev_reps int;
  cur_heaviest numeric; cur_e1rm numeric; cur_reps int;
  metric text;
begin
  select pe.metric into metric from program_exercises pe where pe.id = new.program_exercise_id;
  metric := coalesce(metric, case when new.weight is null then 'bodyweight_reps' else 'weight_reps' end);

  select max(weight), max(public.e1rm(weight, reps)), max(reps)
    into prev_heaviest, prev_e1rm, prev_reps
    from logged_sets
   where client_id = new.client_id and exercise_id = new.exercise_id and session_id <> new.session_id and voided_at is null;

  select max(weight), max(public.e1rm(weight, reps)), max(reps)
    into cur_heaviest, cur_e1rm, cur_reps
    from logged_sets
   where session_id = new.session_id and exercise_id = new.exercise_id and voided_at is null;

  delete from personal_records where session_id = new.session_id and exercise_id = new.exercise_id;

  if metric = 'weight_reps' then
    if prev_heaviest is not null and cur_heaviest > prev_heaviest then
      insert into personal_records (tenant_id, client_id, exercise_id, type, value, previous, session_id)
      values (new.tenant_id, new.client_id, new.exercise_id, 'heaviest', cur_heaviest, prev_heaviest, new.session_id);
    elsif prev_e1rm is not null and cur_e1rm > prev_e1rm + 0.000001 then
      insert into personal_records (tenant_id, client_id, exercise_id, type, value, previous, session_id)
      values (new.tenant_id, new.client_id, new.exercise_id, 'e1rm', round(cur_e1rm, 3), round(prev_e1rm, 3), new.session_id);
    end if;
  elsif metric = 'bodyweight_reps' and prev_reps is not null and cur_reps > prev_reps then
    insert into personal_records (tenant_id, client_id, exercise_id, type, value, previous, session_id)
    values (new.tenant_id, new.client_id, new.exercise_id, 'most_reps', cur_reps, prev_reps, new.session_id);
  end if;
  return new;
end $$;
create trigger derive_personal_records after insert or update on public.logged_sets
  for each row execute function public.derive_personal_records();

-- ---------- messaging & triage ----------

create table public.threads (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_id)
);

create table public.messages (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  thread_id uuid not null references public.threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  kind text not null default 'text' check (kind in ('text', 'voice', 'image', 'video', 'link')),
  body text,
  media_id uuid,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.messages (thread_id, sent_at);

create table public.triage_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  reason_code text not null check (reason_code in ('payment_failed', 'parq_flag', 'form_check_waiting', 'check_in_submitted', 'unread_message', 'missed_sessions', 'churn_risk', 'new_client')),
  detail jsonb not null default '{}'::jsonb,
  priority int not null,
  since timestamptz not null default now(),
  snoozed_until timestamptz,
  handled_at timestamptz,
  handled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.triage_items (tenant_id, handled_at, priority desc);

-- PAR-Q "yes" flags the client for the coach (C-2); it never blocks the client.
create or replace function public.flag_parq() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parq_flag then
    insert into triage_items (tenant_id, client_id, reason_code, priority) values (new.tenant_id, new.client_id, 'parq_flag', 80);
  end if;
  return new;
end $$;
create trigger flag_parq after insert on public.intake_responses for each row execute function public.flag_parq();

-- ---------- AI audit, devices, audit log ----------

create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('check_in_summary', 'program', 'triage')),
  input_ref jsonb not null,
  output jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'edited', 'discarded')),
  model text not null,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Nothing AI-generated reaches a client without a coach tap (K-2).
  check (status in ('draft', 'discarded') or (approved_by is not null and approved_at is not null))
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, expo_push_token)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_id uuid,
  action text not null,
  target text,
  reason text,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency ledger for POST /sync/push.
create table public.applied_mutations (
  client_mutation_id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  profile_id uuid not null,
  kind text not null,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['tenants','profiles','memberships','intake_forms','intake_responses','waivers','waiver_signatures',
    'exercises','programs','program_weeks','program_days','program_exercises','prescribed_sets','progression_rules',
    'assignments','sessions','logged_sets','personal_records','threads','messages','triage_items','ai_drafts','devices',
    'audit_log','applied_mutations']
  loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
