-- AI assistant (K-2) and server-side progression (C-4).
--
-- ai_drafts already exists (core migration) and already refuses approved/edited without approved_by
-- and approved_at. This adds "sent": a draft can only reach a client after a coach approved it.

-- ---------- sending approved drafts ----------

alter table public.ai_drafts
  add column sent_at timestamptz,
  add column sent_message_id uuid references public.messages (id) on delete set null,
  add column final_text text,
  add constraint ai_drafts_sent_requires_approval check (
    sent_at is null or (status in ('approved', 'edited') and approved_by is not null and approved_at is not null)
  );

create index ai_drafts_tenant_month on public.ai_drafts (tenant_id, created_at);

-- Approve a draft (optionally edited) and, for a check-in summary, post it to the client's thread
-- as the coach. SECURITY INVOKER: RLS on ai_drafts and messages decides whether the caller may.
create or replace function public.approve_ai_draft(draft_id uuid, final_text text default null, send boolean default true)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  d ai_drafts;
  body text;
  thread uuid;
  msg uuid;
  edited boolean;
begin
  select * into d from ai_drafts where id = draft_id for update;
  if d.id is null then
    raise exception 'This draft isn’t available.' using errcode = 'P0002';
  end if;
  if d.status = 'discarded' then
    raise exception 'This draft was discarded.' using errcode = '22023';
  end if;
  if d.sent_at is not null then
    return jsonb_build_object('id', d.id, 'status', d.status, 'sentMessageId', d.sent_message_id);
  end if;

  body := coalesce(nullif(btrim(final_text), ''), d.output ->> 'text');
  if body is null then
    raise exception 'Nothing to send.' using errcode = '22023';
  end if;
  edited := body is distinct from (d.output ->> 'text');

  update ai_drafts
     set status = case when edited then 'edited' else 'approved' end,
         approved_by = auth.uid(),
         approved_at = now(),
         final_text = body
   where id = d.id;

  if send and d.kind = 'check_in_summary' then
    select t.id into thread from threads t where t.tenant_id = d.tenant_id and t.client_id = d.client_id;
    if thread is null then
      raise exception 'This client has no message thread yet.' using errcode = 'P0002';
    end if;
    msg := gen_random_uuid();
    insert into messages (id, tenant_id, thread_id, sender_id, kind, body) values (msg, d.tenant_id, thread, auth.uid(), 'text', body);
    update ai_drafts set sent_at = now(), sent_message_id = msg where id = d.id;
  end if;

  return jsonb_build_object('id', d.id, 'status', case when edited then 'edited' else 'approved' end, 'sentMessageId', msg);
end $$;

grant execute on function public.approve_ai_draft(uuid, text, boolean) to authenticated;

-- ---------- usage cap ----------

-- Model-generated drafts this calendar month (UTC). Rule-based triage rows don't count.
create or replace function public.ai_drafts_this_month(t uuid)
returns int
language sql stable security invoker set search_path = public as $$
  select count(*)::int from ai_drafts
   where tenant_id = t and kind <> 'triage' and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
$$;

create or replace view public.ai_usage_monthly with (security_invoker = true) as
  select tenant_id, date_trunc('month', created_at at time zone 'utc')::date as month, kind, count(*)::int as drafts,
         count(*) filter (where sent_at is not null)::int as sent
    from public.ai_drafts
   group by 1, 2, 3;

-- ---------- progression suggestions (C-4) ----------

create table public.progression_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  program_exercise_id uuid not null references public.program_exercises (id) on delete cascade,
  rule_id uuid not null references public.progression_rules (id) on delete cascade,
  source_session_id uuid references public.sessions (id) on delete set null,
  previous_load_kg numeric not null,
  suggested_load_kg numeric not null check (suggested_load_kg > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'kept', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one open suggestion per client and exercise.
create unique index progression_suggestions_one_pending on public.progression_suggestions (client_id, program_exercise_id) where status = 'pending';
create trigger touch_updated_at before update on public.progression_suggestions for each row execute function public.touch_updated_at();

alter table public.progression_suggestions enable row level security;
create policy progression_suggestions_read on public.progression_suggestions for select using (public.can_see_client(tenant_id, client_id));
-- The client answers a suggestion (accept or keep); only the status can change.
create policy progression_suggestions_client_answer on public.progression_suggestions for update
  using (client_id = auth.uid()) with check (client_id = auth.uid() and status in ('accepted', 'kept'));
-- Writes come from POST /progression/evaluate with the service role.

create or replace function public.progression_suggestion_status_only() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and (new.suggested_load_kg, new.previous_load_kg, new.reason, new.client_id, new.program_exercise_id)
     is distinct from (old.suggested_load_kg, old.previous_load_kg, old.reason, old.client_id, old.program_exercise_id) then
    raise exception 'Only the answer to a suggestion can change.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger progression_suggestion_status_only before update on public.progression_suggestions
  for each row execute function public.progression_suggestion_status_only();

-- After a session finishes, ask POST /progression/evaluate to apply the coach's rules.
-- Uses pg_net when it is installed (hosted Supabase); set the target once per project with
--   alter database postgres set app.functions_url = 'https://<ref>.supabase.co/functions/v1';
--   alter database postgres set app.functions_secret = '<CRON_SECRET>';
create or replace function public.request_progression_evaluate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  url text := current_setting('app.functions_url', true);
  secret text := current_setting('app.functions_secret', true);
begin
  if new.finished_at is null or old.finished_at is not null or url is null then
    return new;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'select net.http_post(url := $1, headers := $2, body := $3)'
      using url || '/progression-evaluate',
            jsonb_build_object('content-type', 'application/json', 'x-cron-secret', coalesce(secret, '')),
            jsonb_build_object('sessionId', new.id);
  end if;
  return new;
end $$;
create trigger request_progression_evaluate after update of finished_at on public.sessions
  for each row execute function public.request_progression_evaluate();

-- ---------- churn signals (nightly ai-triage) ----------

-- Last time the client opened the app (sent by the app at most every few hours via app.open).
alter table public.memberships add column last_app_open_at timestamptz;

create or replace function public.sync_handle_ai(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  t uuid;
begin
  if kind <> 'app.open' then
    return null;
  end if;
  update memberships set last_app_open_at = greatest(coalesce(last_app_open_at, '-infinity'), (p ->> 'openedAt')::timestamptz)
   where profile_id = uid and role = 'client'
  returning tenant_id into t;
  if t is null then
    raise exception 'No client membership for this account.' using errcode = 'P0002';
  end if;
  return t;
end $$;

-- A client may update only their own last_app_open_at through sync; memberships writes are otherwise owner-only.
create policy memberships_client_open on public.memberships for update
  using (profile_id = auth.uid() and role = 'client') with check (profile_id = auth.uid() and role = 'client');

create or replace function public.membership_client_update_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() = old.profile_id and not public.is_owner(old.tenant_id)
     and (new.role, new.status, new.assigned_coach_id, new.revenue_split, new.tenant_id, new.profile_id)
         is distinct from (old.role, old.status, old.assigned_coach_id, old.revenue_split, old.tenant_id, old.profile_id) then
    raise exception 'Clients can’t change their membership.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger membership_client_update_guard before update on public.memberships
  for each row execute function public.membership_client_update_guard();

-- Nightly churn check. On hosted Supabase with pg_cron + pg_net:
--   select cron.schedule('ai-triage-nightly', '17 3 * * *', $$
--     select net.http_post(url := current_setting('app.functions_url') || '/ai-triage',
--                          headers := jsonb_build_object('x-cron-secret', current_setting('app.functions_secret')),
--                          body := '{}'::jsonb) $$);
