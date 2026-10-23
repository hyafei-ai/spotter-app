-- Coach owns the business (docs/jtbd.md, Oct 2026 correction). Spotter has two roles: the client and
-- the coach. The tenant "owner" role is the coach who owns their coaching business; assistant coaches
-- are an optional team feature. No schema change: names like members_at_risk and memberships stay.
--
-- New: log_check_in, so any coach logs "I checked in" from client detail (message, call, session,
-- other) and "kept after a check-in" counts it. hand_to_coach is recreated with client wording; it is
-- the team-only "Ask {assistant} to check in".

-- ---------- log a check-in ----------

-- The coach who checked in records it. Callable by the business's coach (owner role) or the assistant
-- assigned to the client (can_see_client). An open request for the client is completed by the coach it
-- was addressed to or the owner; otherwise a new, already-done check-in is recorded.
create or replace function public.log_check_in(t uuid, client uuid, reason text, how text, how_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r interventions;
  iv uuid;
begin
  if not (public.is_coach(t) and public.can_see_client(t, client)) then
    raise exception 'Only this client’s coach can log a check-in.' using errcode = '42501';
  end if;
  if not exists (select 1 from memberships where tenant_id = t and profile_id = client and role = 'client') then
    raise exception 'That client isn’t in your business.' using errcode = 'P0002';
  end if;
  if how not in ('message', 'call', 'session', 'other') then raise exception 'Pick how you checked in.' using errcode = '22023'; end if;
  reason := btrim(coalesce(reason, ''));
  if char_length(reason) not between 1 and 200 then reason := 'Checked in'; end if;
  if reason ~* '(churn|at[ -]risk)' then raise exception 'Use the plain reason, like “No session in 12 days”.' using errcode = '22023'; end if;
  how_note := nullif(btrim(coalesce(how_note, '')), '');

  select * into r from interventions where tenant_id = t and client_id = client and done_at is null;
  if found then
    if not (r.coach_id = auth.uid() or public.is_owner(t)) then
      raise exception 'Another coach was asked to check in with this client.' using errcode = '42501';
    end if;
    update interventions set done_at = now(), done_by = auth.uid(), action = how, action_note = how_note, updated_at = now()
     where id = r.id;
    update triage_items set handled_at = now(), handled_by = auth.uid() where id = r.triage_item_id and handled_at is null;
    iv := r.id;
  else
    insert into interventions (tenant_id, client_id, requested_by, coach_id, reason, done_at, done_by, action, action_note)
    values (t, client, auth.uid(), auth.uid(), reason, now(), auth.uid(), how, how_note)
    returning id into iv;
  end if;
  insert into audit_log (tenant_id, actor_id, action, target, reason) values (t, auth.uid(), 'member.check_in_logged', client::text, null);
  return iv;
end $$;
revoke execute on function public.log_check_in(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.log_check_in(uuid, uuid, text, text, text) to authenticated;
comment on function public.log_check_in(uuid, uuid, text, text, text) is
  'A coach logs a check-in from client detail. Feeds kept after a check-in on the business view.';

-- ---------- teams: ask another coach to check in ----------

-- Same behaviour as 20261022030001_retention.sql; only the wording changed (client, head coach).
create or replace function public.hand_to_coach(t uuid, client uuid, coach uuid, reason text, note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  owner_first text;
  client_name text;
  line text;
  iv uuid;
  item uuid;
begin
  if not public.is_owner(t) then raise exception 'Only the head coach can ask another coach to check in.' using errcode = '42501'; end if;
  if not exists (select 1 from memberships where tenant_id = t and profile_id = coach and role in ('owner', 'assistant') and status = 'active') then
    raise exception 'That coach isn’t on your team.' using errcode = 'P0002';
  end if;
  select p.full_name into client_name from memberships m join profiles p on p.id = m.profile_id
   where m.tenant_id = t and m.profile_id = client and m.role = 'client';
  if not found then raise exception 'That client isn’t in your business.' using errcode = 'P0002'; end if;
  reason := btrim(coalesce(reason, ''));
  if char_length(reason) not between 1 and 200 then raise exception 'Say why in a few words.' using errcode = '22023'; end if;
  -- Coaches see this line; keep it to plain facts.
  if reason ~* '(churn|at[ -]risk)' then raise exception 'Use the plain reason, like “No session in 12 days”.' using errcode = '22023'; end if;
  note := nullif(btrim(coalesce(note, '')), '');

  select split_part(coalesce(nullif(full_name, ''), 'Your head coach'), ' ', 1) into owner_first from profiles where id = auth.uid();
  line := coalesce(owner_first, 'Your head coach') || ' asked you to check in: ' || lower(left(reason, 1)) || substr(reason, 2);

  -- One open request per client: asking again moves it to the new coach.
  select id, triage_item_id into iv, item from interventions where tenant_id = t and client_id = client and done_at is null;
  if iv is not null then
    update triage_items set handled_at = now(), handled_by = auth.uid() where id = item and handled_at is null;
  end if;
  insert into triage_items (tenant_id, client_id, reason_code, detail, priority, coach_id)
  values (t, client, 'check_in_request', jsonb_build_object('text', line, 'note', note, 'clientName', client_name), 75, coach)
  returning id into item;
  if iv is null then
    insert into interventions (tenant_id, client_id, requested_by, coach_id, reason, note, triage_item_id)
    values (t, client, auth.uid(), coach, reason, note, item) returning id into iv;
  else
    update interventions set coach_id = coach, reason = hand_to_coach.reason, note = hand_to_coach.note, triage_item_id = item,
           requested_at = now(), updated_at = now() where id = iv;
  end if;
  update triage_items set detail = detail || jsonb_build_object('interventionId', iv) where id = item;
  insert into audit_log (tenant_id, actor_id, action, target, reason) values (t, auth.uid(), 'member.check_in_requested', client::text, null);
  return iv;
end $$;
revoke execute on function public.hand_to_coach(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.hand_to_coach(uuid, uuid, uuid, text, text) to authenticated;

-- ---------- comments: who these are for ----------

comment on function public.members_at_risk(uuid) is
  'The business view''s client list with engagement inputs and plan values. Owner role only: the coach who owns the business.';
comment on function public.kept_summary(uuid, int) is
  'Check-ins this year and whether each client stayed 60 days later. Owner role only: the coach who owns the business.';
comment on function public.mrr_at_risk(uuid) is
  'Monthly income at risk per currency for the business view. Owner role only (the coach who owns the business); engagement only, no health tables.';
comment on function public.hand_to_coach(uuid, uuid, uuid, text, text) is
  'Teams only: the head coach asks another coach to check in with a client.';
comment on function public.complete_check_in(uuid, text, text) is
  'Teams only: the coach who was asked says how they checked in.';
comment on function public.client_engagement_inputs(uuid) is
  'Engagement inputs for a coach''s Needs attention list: only clients they can see, no prices, no health data.';
