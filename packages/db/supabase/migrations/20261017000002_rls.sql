-- Row-level security. Every table is locked down; access is granted per role:
--   client     : own rows, plus the programs assigned to them
--   assistant  : only clients assigned to them; no tenant settings
--   owner      : everything in their tenant
-- Platform admins use the service role from audited, time-boxed Edge Functions (not here).

do $$
declare t text;
begin
  foreach t in array array['tenants','profiles','memberships','intake_forms','intake_responses','waivers','waiver_signatures',
    'exercises','programs','program_weeks','program_days','program_exercises','prescribed_sets','progression_rules',
    'assignments','sessions','logged_sets','personal_records','threads','messages','triage_items','ai_drafts','devices',
    'audit_log','applied_mutations']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- tenants
create policy tenants_read on public.tenants for select using (public.is_member(id));
create policy tenants_owner_update on public.tenants for update using (public.is_owner(id)) with check (public.is_owner(id));

-- profiles: yourself, or a client you're allowed to see
create policy profiles_self on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_coach_read on public.profiles for select using (
  exists (select 1 from public.memberships m where m.profile_id = profiles.id and public.can_see_client(m.tenant_id, m.profile_id))
);

-- memberships
create policy memberships_read on public.memberships for select using (
  profile_id = auth.uid() or public.can_see_client(tenant_id, profile_id)
);
create policy memberships_owner_write on public.memberships for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));

-- intake
create policy intake_forms_read on public.intake_forms for select using (public.is_member(tenant_id));
create policy intake_forms_write on public.intake_forms for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));
create policy intake_responses_read on public.intake_responses for select using (public.can_see_client(tenant_id, client_id));
create policy intake_responses_insert on public.intake_responses for insert with check (client_id = auth.uid() and public.is_member(tenant_id));

-- waivers (signed copies are insert-only; see trigger)
create policy waivers_read on public.waivers for select using (public.is_member(tenant_id));
create policy waivers_write on public.waivers for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));
create policy waiver_signatures_read on public.waiver_signatures for select using (public.can_see_client(tenant_id, client_id));
create policy waiver_signatures_insert on public.waiver_signatures for insert with check (client_id = auth.uid() and public.is_member(tenant_id));

-- exercise library: built-ins are public to signed-in users; custom ones belong to a tenant
create policy exercises_read on public.exercises for select using (tenant_id is null or public.is_member(tenant_id));
create policy exercises_write on public.exercises for all using (tenant_id is not null and public.is_coach(tenant_id))
  with check (tenant_id is not null and public.is_coach(tenant_id));

-- programs and children: coaches edit; clients read what's assigned to them
do $$
declare t text;
begin
  foreach t in array array['program_weeks','program_days','program_exercises','prescribed_sets','progression_rules']
  loop
    execute format('create policy %1$s_coach on public.%1$I for all using (public.is_coach(tenant_id)) with check (public.is_coach(tenant_id))', t);
    execute format('create policy %1$s_client_read on public.%1$I for select using (public.is_assigned(program_id))', t);
  end loop;
end $$;
create policy programs_coach on public.programs for all using (public.is_coach(tenant_id)) with check (public.is_coach(tenant_id));
create policy programs_client_read on public.programs for select using (public.is_assigned(id));

create policy assignments_read on public.assignments for select using (public.can_see_client(tenant_id, client_id));
create policy assignments_write on public.assignments for all
  using (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id))
  with check (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));

-- sessions and sets: the client writes their own; coaches who can see the client read them
create policy sessions_read on public.sessions for select using (public.can_see_client(tenant_id, client_id));
create policy sessions_client_insert on public.sessions for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy sessions_client_update on public.sessions for update using (client_id = auth.uid()) with check (client_id = auth.uid());

create policy logged_sets_read on public.logged_sets for select using (public.can_see_client(tenant_id, client_id));
create policy logged_sets_client_insert on public.logged_sets for insert with check (
  client_id = auth.uid() and exists (select 1 from public.sessions s where s.id = session_id and s.client_id = auth.uid() and s.tenant_id = logged_sets.tenant_id)
);
create policy logged_sets_client_update on public.logged_sets for update using (client_id = auth.uid()) with check (client_id = auth.uid());

create policy personal_records_read on public.personal_records for select using (public.can_see_client(tenant_id, client_id));

-- messaging
create policy threads_read on public.threads for select using (public.can_see_client(tenant_id, client_id));
create policy threads_insert on public.threads for insert with check (public.can_see_client(tenant_id, client_id));
create policy messages_read on public.messages for select using (
  exists (select 1 from public.threads t where t.id = thread_id and public.can_see_client(t.tenant_id, t.client_id))
);
create policy messages_insert on public.messages for insert with check (
  sender_id = auth.uid()
  and exists (select 1 from public.threads t where t.id = thread_id and t.tenant_id = messages.tenant_id and public.can_see_client(t.tenant_id, t.client_id))
);
create policy messages_mark_read on public.messages for update using (
  exists (select 1 from public.threads t where t.id = thread_id and public.can_see_client(t.tenant_id, t.client_id))
);

-- coach-only tables (never visible to clients)
create policy triage_coach on public.triage_items for all
  using (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id))
  with check (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));
create policy ai_drafts_coach on public.ai_drafts for all
  using (public.is_coach(tenant_id) and (client_id is null or public.can_see_client(tenant_id, client_id)))
  with check (public.is_coach(tenant_id) and (client_id is null or public.can_see_client(tenant_id, client_id)));

create policy devices_self on public.devices for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy audit_owner_read on public.audit_log for select using (public.is_owner(tenant_id));
create policy applied_mutations_self on public.applied_mutations for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
