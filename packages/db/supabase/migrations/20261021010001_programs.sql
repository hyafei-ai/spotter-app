-- Program builder and assignment (K-4, K-3).
--  * programs get a version and a source ('ai_draft' marks an AI program draft awaiting review)
--  * days are scheduled on a weekday (1 = Monday … 7 = Sunday), one session per weekday per week
--  * "edits to a live program apply to future sessions only": each publish writes a snapshot per
--    active assignment, effective from a date; clients read the snapshot in force for a day
--  * "edit today's session": a one-off replacement day per assignment and date
-- JSON shapes match Program / ProgramDay in packages/core/src/programs.ts.

alter table public.programs
  add column version int not null default 1 check (version >= 1),
  add column source text not null default 'coach' check (source in ('coach', 'ai_draft', 'import'));

alter table public.program_days add column weekday smallint check (weekday between 1 and 7);
create unique index program_days_one_per_weekday on public.program_days (week_id, weekday) where weekday is not null;

create table public.assignment_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  program_version int not null,
  effective_from date not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, effective_from)
);

create table public.session_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  day jsonb not null check (jsonb_typeof(day -> 'exercises') = 'array'),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, date)
);

-- tenant_id and client_id always come from the assignment, so they can't be pointed elsewhere.
create or replace function public.fill_from_assignment() returns trigger
language plpgsql as $$
declare a record;
begin
  select tenant_id, client_id into a from public.assignments where id = new.assignment_id;
  if a is null then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;
  new.tenant_id := a.tenant_id;
  new.client_id := a.client_id;
  return new;
end $$;
create trigger fill_from_assignment before insert or update on public.assignment_versions
  for each row execute function public.fill_from_assignment();
create trigger fill_from_assignment before insert or update on public.session_overrides
  for each row execute function public.fill_from_assignment();

do $$
declare t text;
begin
  foreach t in array array['assignment_versions', 'session_overrides'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('create policy %1$s_read on public.%1$I for select using (public.can_see_client(tenant_id, client_id))', t);
    execute format('create policy %1$s_coach_write on public.%1$I for all using (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id)) with check (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id))', t);
  end loop;
end $$;

-- The whole program as JSON, in the core Program shape.
create or replace function public.program_snapshot(p uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', pr.id, 'name', pr.name, 'status', pr.status, 'isTemplate', pr.is_template, 'version', pr.version,
    'source', pr.source, 'updatedAt', pr.updated_at,
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'days', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id, 'title', d.title, 'weekday', coalesce(d.weekday, d.day_index + 1), 'coachNote', d.coach_note,
          'exercises', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', pe.id, 'exerciseId', pe.exercise_id, 'name', ex.name, 'metric', pe.metric,
              'supersetGroup', pe.superset_group, 'restS', pe.rest_s, 'tempo', pe.tempo, 'note', pe.note,
              'trackRpe', pe.track_rpe,
              'alternatives', coalesce((
                select jsonb_agg(jsonb_build_object('exerciseId', alt.id, 'name', alt.name) order by alt.name)
                  from exercises alt where alt.id = any (pe.alternatives)), '[]'::jsonb),
              'progressionRule', (
                select jsonb_build_object('id', r.id, 'maxRpe', (r.condition ->> 'maxRpe')::numeric,
                                          'sessionsRequired', r.sessions_required, 'incrementKg', r.increment)
                  from progression_rules r where r.program_exercise_id = pe.id limit 1),
              'sets', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'repsMin', s.reps_min, 'repsMax', s.reps_max, 'loadType', s.load_type, 'loadValue', s.load_value,
                  'rpe', s.rpe, 'durationS', s.duration_s, 'distanceM', s.distance_m, 'amrap', s.amrap) order by s.set_index)
                  from prescribed_sets s where s.program_exercise_id = pe.id), '[]'::jsonb)
            ) order by pe.position)
              from program_exercises pe join exercises ex on ex.id = pe.exercise_id
             where pe.program_day_id = d.id), '[]'::jsonb)
        ) order by coalesce(d.weekday, d.day_index + 1))
          from program_days d where d.week_id = w.id), '[]'::jsonb)) order by w.week_index)
        from program_weeks w where w.program_id = pr.id), '[]'::jsonb)
  )
  from programs pr where pr.id = p
$$;

-- Publish a draft, or save edits to a live program. Active assignments get the new version
-- from `effective_from` (the next session not yet started); earlier dates keep what they had.
create or replace function public.publish_program(p uuid, effective_from date) returns int
language plpgsql security invoker set search_path = public as $$
declare
  v int;
  snap jsonb;
  a record;
begin
  update programs
     set version = case when status = 'draft' then version else version + 1 end, status = 'published'
   where id = p and public.is_coach(tenant_id)
  returning version into v;
  if v is null then
    raise exception 'Program not found or not yours to publish.' using errcode = '42501';
  end if;
  snap := public.program_snapshot(p);
  for a in select id, start_date from assignments where program_id = p and status <> 'ended' loop
    delete from assignment_versions where assignment_id = a.id and assignment_versions.effective_from >= greatest(publish_program.effective_from, a.start_date);
    insert into assignment_versions (assignment_id, program_version, effective_from, snapshot, tenant_id, client_id)
    values (a.id, v, greatest(publish_program.effective_from, a.start_date), snap, null, null);
  end loop;
  return v;
end $$;
grant execute on function public.publish_program(uuid, date) to authenticated;

-- A new assignment starts with the program as it is now.
create or replace function public.assignment_initial_version() returns trigger
language plpgsql security invoker set search_path = public as $$
declare v int;
begin
  select version into v from programs where id = new.program_id and status = 'published';
  if v is not null then
    insert into assignment_versions (assignment_id, program_version, effective_from, snapshot, tenant_id, client_id)
    values (new.id, v, new.start_date, public.program_snapshot(new.program_id), new.tenant_id, new.client_id);
  end if;
  return new;
end $$;
create trigger assignment_initial_version after insert on public.assignments
  for each row execute function public.assignment_initial_version();

-- The snapshot in force for a client on a date (what the client app caches for Today).
create or replace function public.assigned_day(asg uuid, on_date date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select o.day from session_overrides o where o.assignment_id = asg and o.date = on_date),
    (select jsonb_build_object('snapshot', v.snapshot, 'programVersion', v.program_version)
       from assignment_versions v where v.assignment_id = asg and v.effective_from <= on_date
      order by v.effective_from desc limit 1)
  )
$$;
