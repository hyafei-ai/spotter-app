-- Multi-sport blocks (docs/features/multisport-core.md, docs/ports.md rows 1, 5, 8). Additive only.
--
--  * program_days.blocks: the day's blocks in order, as JSON in the core `Block` shape (packages/core/src/schemas.ts).
--    A strength block points at the day's program_exercises by id, so those rows keep their meaning and every
--    existing reader still sees every exercise. Null = a day saved before blocks (read as one strength block;
--    core `migrateDay`). program_snapshot (and so assignment versions and Today) now carries `v` and `blocks`.
--  * day_briefs: Strategy & Stimulus per program day. AI drafts and coach edits live here; clients read a row only
--    once the coach approved it (and only for programs assigned to them). The snapshot includes approved text only.
--  * session_block_results: a block's score and splits in a session (mutation block.result / block.void).
--    Training data, shared with the coach like logged sets.
--  * race_goals: one race goal per client, set by the client (race.goal.set / race.goal.clear) or their coach.
--  * ai_drafts.kind gains 'day_brief'.

alter table public.program_days
  add column blocks jsonb check (blocks is null or (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 40));

alter table public.ai_drafts drop constraint if exists ai_drafts_kind_check;
alter table public.ai_drafts add constraint ai_drafts_kind_check check (kind in ('check_in_summary', 'program', 'triage', 'day_brief'));

/* ---------- Strategy & Stimulus ---------- */

create table public.day_briefs (
  program_day_id uuid primary key references public.program_days (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  stimulus text not null check (char_length(stimulus) between 1 and 400),
  strategy text not null check (char_length(strategy) between 1 and 600),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  source text not null check (source in ('ai', 'coach')),
  ai_draft_id uuid references public.ai_drafts (id) on delete set null,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Nothing AI-written reaches a client without a coach tap (K-2): approval is recorded.
  check (status = 'draft' or (approved_by is not null and approved_at is not null))
);

-- tenant and program always come from the day, so a brief can't be pointed at another tenant's program.
create or replace function public.day_brief_fill() returns trigger
language plpgsql as $$
declare d record;
begin
  select tenant_id, program_id into d from public.program_days where id = new.program_day_id;
  if d is null then
    raise exception 'program day not found' using errcode = 'P0002';
  end if;
  new.tenant_id := d.tenant_id;
  new.program_id := d.program_id;
  return new;
end $$;
create trigger day_brief_fill before insert or update on public.day_briefs for each row execute function public.day_brief_fill();
create trigger touch_updated_at before update on public.day_briefs for each row execute function public.touch_updated_at();

alter table public.day_briefs enable row level security;
create policy day_briefs_coach on public.day_briefs for all using (public.is_coach(tenant_id)) with check (public.is_coach(tenant_id));
create policy day_briefs_client_read on public.day_briefs for select using (status = 'approved' and public.is_assigned(program_id));

/* ---------- the snapshot carries blocks and the approved brief ---------- */

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
        )
        || case when d.blocks is not null then jsonb_build_object('v', 2, 'blocks', d.blocks) else '{}'::jsonb end
        || coalesce((
             select jsonb_build_object('brief', jsonb_build_object('stimulus', b.stimulus, 'strategy', b.strategy,
                      'status', b.status, 'source', b.source, 'updatedAt', b.updated_at))
               from day_briefs b where b.program_day_id = d.id and b.status = 'approved'), '{}'::jsonb)
        order by coalesce(d.weekday, d.day_index + 1))
          from program_days d where d.week_id = w.id), '[]'::jsonb)) order by w.week_index)
        from program_weeks w where w.program_id = pr.id), '[]'::jsonb)
  )
  from programs pr where pr.id = p
$$;

/* ---------- block results ---------- */

create table public.session_block_results (
  session_id uuid not null references public.sessions (id) on delete cascade,
  block_id text not null check (char_length(block_id) between 1 and 64),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('strength', 'rounds_for_time', 'amrap', 'interval_amrap', 'emom', 'for_time', 'rep_scheme',
                                     'tabata', 'intervals', 'station_race', 'timed', 'rest', 'note')),
  key text not null check (char_length(key) between 1 and 120),
  label text not null check (char_length(label) between 1 and 80),
  scoring text not null check (scoring in ('time', 'rounds_reps', 'load', 'reps', 'distance', 'calories', 'none')),
  score jsonb not null check (jsonb_typeof(score) = 'object'),
  splits jsonb not null default '[]'::jsonb check (jsonb_typeof(splits) = 'array' and jsonb_array_length(splits) <= 100),
  rpe numeric check (rpe between 1 and 10),
  logged_at timestamptz not null,
  voided_at timestamptz,
  client_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, block_id)
);
create index on public.session_block_results (client_id, key, logged_at desc);
create trigger touch_updated_at before update on public.session_block_results for each row execute function public.touch_updated_at();

alter table public.session_block_results enable row level security;
create policy session_block_results_read on public.session_block_results for select using (public.can_see_client(tenant_id, client_id));
create policy session_block_results_client_insert on public.session_block_results for insert
  with check (client_id = auth.uid() and exists (select 1 from public.sessions s where s.id = session_id and s.client_id = auth.uid() and s.tenant_id = session_block_results.tenant_id));
create policy session_block_results_client_update on public.session_block_results for update
  using (client_id = auth.uid()) with check (client_id = auth.uid());

/* ---------- race goals ---------- */

create table public.race_goals (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  event text not null check (char_length(event) between 1 and 80),
  kind text not null check (kind in ('race_sim', 'run', 'other')),
  race_date date not null,
  target_sec int check (target_sec > 0 and target_sec <= 86400),
  division text check (division in ('open_women', 'open_men', 'pro_women', 'pro_men')),
  format text check (format in ('full', 'half')),
  set_by uuid references public.profiles (id),
  cleared_at timestamptz,
  client_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One live goal per client.
create unique index race_goals_one_live on public.race_goals (client_id) where cleared_at is null;
create trigger touch_updated_at before update on public.race_goals for each row execute function public.touch_updated_at();

alter table public.race_goals enable row level security;
create policy race_goals_read on public.race_goals for select using (public.can_see_client(tenant_id, client_id));
create policy race_goals_client_write on public.race_goals for all
  using (client_id = auth.uid()) with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy race_goals_coach_write on public.race_goals for all
  using (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id))
  with check (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));

/* ---------- offline mutations ---------- */

create or replace function public.sync_handle_blocks(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
  live uuid;
begin
  if kind not in ('block.result', 'block.void', 'race.goal.set', 'race.goal.clear') then
    return null;
  end if;

  if kind in ('race.goal.set', 'race.goal.clear') then
    select m.tenant_id into tenant from memberships m
     where m.profile_id = uid and m.role = 'client' and m.status in ('active', 'paused')
     order by m.created_at desc limit 1;
    if tenant is null then
      raise exception 'You’re not a client of a coach on Spotter.' using errcode = '42501';
    end if;
    if kind = 'race.goal.clear' then
      update race_goals set cleared_at = (p ->> 'clearedAt')::timestamptz
       where id = (p ->> 'goalId')::uuid and client_id = uid and cleared_at is null;
      return tenant;
    end if;
    -- A new goal replaces the live one (append-only: the old row is cleared, not changed).
    select id into live from race_goals where client_id = uid and cleared_at is null;
    if live is not null and live <> (p ->> 'goalId')::uuid then
      update race_goals set cleared_at = (p ->> 'updatedAt')::timestamptz where id = live;
    end if;
    insert into race_goals (id, tenant_id, client_id, event, kind, race_date, target_sec, division, format, set_by, client_mutation_id)
    values ((p ->> 'goalId')::uuid, tenant, uid, p ->> 'event', p ->> 'kind', (p ->> 'date')::date, (p ->> 'targetSec')::int,
            p ->> 'division', p ->> 'format', uid, mid)
    on conflict (id) do update
      set event = excluded.event, kind = excluded.kind, race_date = excluded.race_date, target_sec = excluded.target_sec,
          division = excluded.division, format = excluded.format, cleared_at = null, client_mutation_id = excluded.client_mutation_id
      where race_goals.client_id = uid;
    return tenant;
  end if;

  -- Block results: only for the caller's own session (synced earlier in the same push, in order).
  select s.tenant_id into tenant from sessions s where s.id = (p ->> 'sessionId')::uuid and s.client_id = uid;
  if tenant is null then
    raise exception 'This session isn’t yours or was removed.' using errcode = 'P0002';
  end if;

  if kind = 'block.void' then
    update session_block_results set voided_at = (p ->> 'voidedAt')::timestamptz
     where session_id = (p ->> 'sessionId')::uuid and block_id = p ->> 'blockId' and client_id = uid;
    return tenant;
  end if;

  insert into session_block_results (session_id, block_id, tenant_id, client_id, kind, key, label, scoring, score, splits, rpe, logged_at, client_mutation_id)
  values ((p ->> 'sessionId')::uuid, p ->> 'blockId', tenant, uid, p ->> 'kind', p ->> 'key', p ->> 'label', p ->> 'scoring',
          p -> 'score', coalesce(p -> 'splits', '[]'::jsonb), (p ->> 'rpe')::numeric, (p ->> 'loggedAt')::timestamptz, mid)
  on conflict (session_id, block_id) do update
    set kind = excluded.kind, key = excluded.key, label = excluded.label, scoring = excluded.scoring, score = excluded.score,
        splits = excluded.splits, rpe = excluded.rpe, logged_at = excluded.logged_at, voided_at = null,
        client_mutation_id = excluded.client_mutation_id
    -- A later result replaces an earlier one; an older one arriving late changes nothing.
    where session_block_results.client_id = uid and session_block_results.logged_at <= excluded.logged_at;
  return tenant;
end $$;
grant execute on function public.sync_handle_blocks(text, jsonb, uuid, uuid, inet) to authenticated;

/* ---------- the client's offline cache gets results, approved briefs and the race goal ---------- */

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
    'session_block_results', coalesce((select jsonb_agg(to_jsonb(x)) from session_block_results x where x.updated_at > since and x.client_id = auth.uid() and x.logged_at > now() - interval '30 days'), '[]'),
    'day_briefs', coalesce((select jsonb_agg(to_jsonb(x)) from day_briefs x where x.updated_at > since and x.status = 'approved' and public.is_assigned(x.program_id)), '[]'),
    'race_goals', coalesce((select jsonb_agg(to_jsonb(x)) from race_goals x where x.updated_at > since and x.client_id = auth.uid()), '[]'),
    'messages', coalesce((select jsonb_agg(to_jsonb(x) order by x.sent_at) from (
        select m.* from messages m join threads th on th.id = m.thread_id
         where m.updated_at > since and th.client_id = auth.uid() order by m.sent_at desc limit 200) x), '[]'),
    'intake_forms', coalesce((select jsonb_agg(to_jsonb(x)) from intake_forms x where x.updated_at > since and x.is_default), '[]')
  )
$$;
grant execute on function public.sync_pull(timestamptz) to authenticated;
