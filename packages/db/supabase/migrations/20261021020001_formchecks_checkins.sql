-- Form checks, video pipeline and weekly check-ins (C-5, K-5, C-7; build phase 4).
-- Private media: form-check videos and progress photos are visible only to the client and the
-- coaches who can see that client (can_see_client); files are served through signed URLs (≤ 1 h).

-- ---------- videos ----------

create table public.videos (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('form_check', 'voice_over', 'demo')),
  storage_path text not null unique,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_ms int check (duration_ms > 0),
  status text not null default 'uploading' check (status in ('uploading', 'processing', 'ready', 'errored')),
  mux_asset_id text unique,
  mux_playback_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Form checks are capped at 60 s (with slack for container rounding).
  check (kind <> 'form_check' or duration_ms is null or duration_ms <= 60500)
);
create index on public.videos (tenant_id, owner_id);

-- ---------- form checks ----------

create table public.form_checks (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete restrict,
  exercise_id text not null references public.exercises (id),
  session_id uuid references public.sessions (id) on delete set null,
  program_exercise_id uuid,
  set_index int check (set_index >= 0),
  logged_set_id uuid references public.logged_sets (id) on delete set null,
  client_note text check (char_length(client_note) <= 1000),
  status text not null default 'waiting' check (status in ('waiting', 'replied')),
  reply_summary text check (char_length(reply_summary) <= 2000),
  voice_over_video_id uuid references public.videos (id) on delete set null,
  replied_at timestamptz,
  replied_by uuid references public.profiles (id),
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'replied') = (replied_at is not null))
);
create index on public.form_checks (tenant_id, client_id, created_at desc);
create index on public.form_checks (client_id, exercise_id, created_at desc);

create table public.form_check_annotations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  form_check_id uuid not null references public.form_checks (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  at_ms int not null check (at_ms >= 0),
  kind text not null check (kind in ('note', 'line', 'angle', 'circle', 'voice')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.form_check_annotations (form_check_id, at_ms);

-- ---------- check-ins ----------

create table public.check_in_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- null = the tenant's default; a client-specific template overrides it.
  client_id uuid references public.profiles (id) on delete cascade,
  fields jsonb not null,
  cadence jsonb not null default '{"dueWeekday": 0, "reminderHour": 8}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(fields) = 'object'),
  check ((cadence ->> 'dueWeekday')::int between 0 and 6 and (cadence ->> 'reminderHour')::int between 5 and 12)
);
create unique index check_in_templates_one_default on public.check_in_templates (tenant_id) where client_id is null;
create unique index check_in_templates_one_per_client on public.check_in_templates (tenant_id, client_id) where client_id is not null;

create table public.check_ins (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  due_date date not null,
  answers jsonb not null,
  photo_ids uuid[] not null default '{}' check (cardinality(photo_ids) <= 3),
  submitted_at timestamptz not null,
  ai_summary_draft text,
  coach_reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, due_date)
);
create index on public.check_ins (tenant_id, client_id, due_date desc);

create table public.progress_photos (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  check_in_id uuid references public.check_ins (id) on delete cascade,
  pose text not null check (pose in ('front', 'side', 'back')),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Coaches can mark a check-in read but never change what the client answered; clients can't mark it read.
create or replace function public.check_in_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() = old.client_id then
    if new.coach_reviewed_at is distinct from old.coach_reviewed_at or new.reviewed_by is distinct from old.reviewed_by
       or new.ai_summary_draft is distinct from old.ai_summary_draft then
      raise exception 'only the coach can mark a check-in read' using errcode = '42501';
    end if;
    if old.coach_reviewed_at is not null then
      raise exception 'this check-in has already been read by your coach' using errcode = '42501';
    end if;
  elsif new.answers is distinct from old.answers or new.photo_ids is distinct from old.photo_ids
        or new.due_date is distinct from old.due_date or new.client_id is distinct from old.client_id then
    raise exception 'coaches cannot change a client''s answers' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger check_in_guard before update on public.check_ins for each row execute function public.check_in_guard();

-- Replying is the coach's job: clients can't mark their own form check replied.
create or replace function public.form_check_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() = old.client_id and (new.status, new.reply_summary, new.replied_at, new.replied_by)
     is distinct from (old.status, old.reply_summary, old.replied_at, old.replied_by) then
    raise exception 'only the coach can reply to a form check' using errcode = '42501';
  end if;
  if new.client_id is distinct from old.client_id or new.video_id is distinct from old.video_id then
    raise exception 'a form check''s client and video are fixed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger form_check_guard before update on public.form_checks for each row execute function public.form_check_guard();

-- ---------- triage (K-1) ----------

create or replace function public.form_check_triage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'waiting' then
    if not exists (select 1 from triage_items t where t.client_id = new.client_id and t.tenant_id = new.tenant_id
                   and t.reason_code = 'form_check_waiting' and t.handled_at is null) then
      insert into triage_items (tenant_id, client_id, reason_code, priority, detail, since)
      values (new.tenant_id, new.client_id, 'form_check_waiting', 70, jsonb_build_object('form_check_id', new.id), new.created_at);
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'replied' and old.status <> 'replied' then
    -- Close the triage item once nothing from this client is waiting any more.
    if not exists (select 1 from form_checks f where f.client_id = new.client_id and f.status = 'waiting' and f.id <> new.id) then
      update triage_items set handled_at = now(), handled_by = new.replied_by
       where client_id = new.client_id and tenant_id = new.tenant_id and reason_code = 'form_check_waiting' and handled_at is null;
    end if;
  end if;
  return new;
end $$;
create trigger form_check_triage after insert or update on public.form_checks for each row execute function public.form_check_triage();

create or replace function public.check_in_triage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from triage_items t where t.client_id = new.client_id and t.tenant_id = new.tenant_id
                   and t.reason_code = 'check_in_submitted' and t.handled_at is null) then
      insert into triage_items (tenant_id, client_id, reason_code, priority, detail, since)
      values (new.tenant_id, new.client_id, 'check_in_submitted', 60, jsonb_build_object('check_in_id', new.id), new.submitted_at);
    end if;
  elsif new.coach_reviewed_at is not null and old.coach_reviewed_at is null then
    if not exists (select 1 from check_ins c where c.client_id = new.client_id and c.coach_reviewed_at is null and c.id <> new.id) then
      update triage_items set handled_at = now(), handled_by = new.reviewed_by
       where client_id = new.client_id and tenant_id = new.tenant_id and reason_code = 'check_in_submitted' and handled_at is null;
    end if;
  end if;
  return new;
end $$;
create trigger check_in_triage after insert or update on public.check_ins for each row execute function public.check_in_triage();

-- ---------- RLS ----------

alter table public.videos enable row level security;
alter table public.form_checks enable row level security;
alter table public.form_check_annotations enable row level security;
alter table public.check_in_templates enable row level security;
alter table public.check_ins enable row level security;
alter table public.progress_photos enable row level security;

-- Videos: the uploader owns theirs; coaches who can see the owner can watch them; demo videos are tenant-wide.
create policy videos_read on public.videos for select using (
  owner_id = auth.uid() or public.can_see_client(tenant_id, owner_id)
  or (kind = 'demo' and public.is_member(tenant_id))
  -- A client can watch a coach's voice-over attached to their own form check.
  or (kind = 'voice_over' and exists (select 1 from public.form_checks f where f.voice_over_video_id = videos.id and f.client_id = auth.uid()))
);
create policy videos_insert on public.videos for insert with check (
  owner_id = auth.uid() and public.is_member(tenant_id)
  and (kind = 'form_check' or public.is_coach(tenant_id))
);
-- Status/playback ids are set by the Mux webhook with the service role, not by users.

create policy form_checks_read on public.form_checks for select using (public.can_see_client(tenant_id, client_id));
create policy form_checks_client_insert on public.form_checks for insert with check (
  client_id = auth.uid() and status = 'waiting'
  and exists (select 1 from public.videos v where v.id = video_id and v.owner_id = auth.uid() and v.tenant_id = form_checks.tenant_id)
);
create policy form_checks_coach_update on public.form_checks for update
  using (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id))
  with check (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));

create policy annotations_read on public.form_check_annotations for select using (
  exists (select 1 from public.form_checks f where f.id = form_check_id and public.can_see_client(f.tenant_id, f.client_id))
);
create policy annotations_coach_write on public.form_check_annotations for all
  using (exists (select 1 from public.form_checks f where f.id = form_check_id and public.is_coach(f.tenant_id) and public.can_see_client(f.tenant_id, f.client_id)))
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.form_checks f where f.id = form_check_id and f.tenant_id = form_check_annotations.tenant_id
                and public.is_coach(f.tenant_id) and public.can_see_client(f.tenant_id, f.client_id))
  );

create policy templates_read on public.check_in_templates for select using (
  public.is_member(tenant_id) and (client_id is null or public.can_see_client(tenant_id, client_id))
);
create policy templates_owner_default on public.check_in_templates for all
  using (client_id is null and public.is_owner(tenant_id))
  with check (client_id is null and public.is_owner(tenant_id));
create policy templates_coach_client on public.check_in_templates for all
  using (client_id is not null and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id))
  with check (client_id is not null and public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));

create policy check_ins_read on public.check_ins for select using (public.can_see_client(tenant_id, client_id));
create policy check_ins_client_insert on public.check_ins for insert with check (client_id = auth.uid() and public.is_member(tenant_id) and coach_reviewed_at is null);
create policy check_ins_update on public.check_ins for update
  using (client_id = auth.uid() or (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id)))
  with check (client_id = auth.uid() or (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id)));

create policy photos_read on public.progress_photos for select using (public.can_see_client(tenant_id, client_id));
create policy photos_client_insert on public.progress_photos for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy photos_client_delete on public.progress_photos for delete using (client_id = auth.uid());

-- updated_at
create trigger touch_updated_at before update on public.videos for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.form_checks for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.form_check_annotations for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.check_in_templates for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.check_ins for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.progress_photos for each row execute function public.touch_updated_at();

-- ---------- offline mutations (POST /sync/push via sync_dispatch) ----------

create or replace function public.sync_handle_formchecks(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
begin
  if kind <> 'formcheck.create' then return null; end if;
  select v.tenant_id into tenant from videos v where v.id = (p ->> 'videoId')::uuid and v.owner_id = uid;
  if tenant is null then
    raise exception 'The video for this form check hasn’t finished uploading.' using errcode = 'P0002';
  end if;
  insert into form_checks (id, tenant_id, client_id, video_id, exercise_id, session_id, program_exercise_id, set_index, client_note, created_at, client_mutation_id)
  values ((p ->> 'formCheckId')::uuid, tenant, uid, (p ->> 'videoId')::uuid, p ->> 'exerciseId',
          (select s.id from sessions s where s.id = (p ->> 'sessionId')::uuid and s.client_id = uid),
          (p ->> 'programExerciseId')::uuid, (p ->> 'setIndex')::int, p ->> 'clientNote', (p ->> 'createdAt')::timestamptz, mid)
  on conflict (id) do nothing;
  return tenant;
end $$;

create or replace function public.sync_handle_checkins(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
begin
  if kind <> 'checkin.submit' then return null; end if;
  select m.tenant_id into tenant from memberships m where m.profile_id = uid and m.role = 'client' order by m.created_at desc limit 1;
  if tenant is null then
    raise exception 'You’re not a client of a coach on Spotter.' using errcode = '42501';
  end if;
  -- One check-in per due date; resubmitting before the coach reads it replaces the answers.
  -- After the coach has read it, a resubmission is refused (with a reason) rather than silently dropped.
  if exists (select 1 from check_ins c where c.client_id = uid and c.due_date = (p ->> 'dueDate')::date
             and c.coach_reviewed_at is not null and c.id <> (p ->> 'checkInId')::uuid) then
    raise exception 'Your coach has already read this week’s check-in. Send changes as a message.' using errcode = 'P0001';
  end if;
  insert into check_ins (id, tenant_id, client_id, due_date, answers, photo_ids, submitted_at, client_mutation_id)
  values ((p ->> 'checkInId')::uuid, tenant, uid, (p ->> 'dueDate')::date, p -> 'answers',
          coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p -> 'photoIds') x), '{}'),
          (p ->> 'submittedAt')::timestamptz, mid)
  on conflict (client_id, due_date) do update
    set answers = excluded.answers, photo_ids = excluded.photo_ids, submitted_at = excluded.submitted_at
    where check_ins.coach_reviewed_at is null;
  return tenant;
end $$;

grant execute on function public.sync_handle_formchecks(text, jsonb, uuid, uuid, inet) to authenticated;
grant execute on function public.sync_handle_checkins(text, jsonb, uuid, uuid, inet) to authenticated;
