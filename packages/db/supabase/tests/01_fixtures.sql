-- Two tenants, each with an owner; tenant A also has an assistant and two clients
-- (client A1 assigned to the assistant). Runs as superuser, so RLS doesn't apply here.
--
-- Id scheme: a…/b… = tenant; last block: a1 owner, a2 assistant, c1/c2 clients, 1xx program rows, 2xx threads.
insert into tenants (id, slug, app_name, short_name, brand_color) values
  ('a0000000-0000-7000-8000-000000000000', 'tenant-a', 'Tenant A', 'A', '#C2410C'),
  ('b0000000-0000-7000-8000-000000000000', 'tenant-b', 'Tenant B', 'B', '#1D5C63');

insert into profiles (id, full_name) values
  ('a0000000-0000-7000-8000-0000000000a1', 'Owner A'),
  ('a0000000-0000-7000-8000-0000000000a2', 'Assistant A'),
  ('a0000000-0000-7000-8000-0000000000c1', 'Client A1'),
  ('a0000000-0000-7000-8000-0000000000c2', 'Client A2'),
  ('b0000000-0000-7000-8000-0000000000b1', 'Owner B'),
  ('b0000000-0000-7000-8000-0000000000c1', 'Client B1');

insert into memberships (tenant_id, profile_id, role, assigned_coach_id) values
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000a1', 'owner', null),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000a2', 'assistant', null),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'client', 'a0000000-0000-7000-8000-0000000000a2'),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c2', 'client', 'a0000000-0000-7000-8000-0000000000a1'),
  ('b0000000-0000-7000-8000-000000000000', 'b0000000-0000-7000-8000-0000000000b1', 'owner', null),
  ('b0000000-0000-7000-8000-000000000000', 'b0000000-0000-7000-8000-0000000000c1', 'client', 'b0000000-0000-7000-8000-0000000000b1');

insert into exercises (id, name, default_metric) values ('back-squat', 'Back Squat', 'weight_reps'), ('pull-up', 'Pull-up', 'bodyweight_reps');

-- One program day in tenant A, assigned to client A1 only.
insert into programs (id, tenant_id, name, is_template) values
  ('a0000000-0000-7000-8000-000000000101', 'a0000000-0000-7000-8000-000000000000', 'Strength Base', false);
insert into program_weeks (id, tenant_id, program_id, week_index) values
  ('a0000000-0000-7000-8000-000000000102', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000101', 0);
insert into program_days (id, tenant_id, program_id, week_id, day_index, title) values
  ('a0000000-0000-7000-8000-000000000103', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000101', 'a0000000-0000-7000-8000-000000000102', 0, 'Lower A');
insert into program_exercises (id, tenant_id, program_id, program_day_id, exercise_id, position, metric) values
  ('a0000000-0000-7000-8000-000000000104', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000101', 'a0000000-0000-7000-8000-000000000103', 'back-squat', 0, 'weight_reps'),
  ('a0000000-0000-7000-8000-000000000105', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-000000000101', 'a0000000-0000-7000-8000-000000000103', 'pull-up', 1, 'bodyweight_reps');
insert into assignments (id, tenant_id, client_id, program_id, start_date) values
  ('a0000000-0000-7000-8000-000000000106', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'a0000000-0000-7000-8000-000000000101', current_date);

-- Threads for both tenant-A clients.
insert into threads (id, tenant_id, client_id) values
  ('a0000000-0000-7000-8000-000000000201', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1'),
  ('a0000000-0000-7000-8000-000000000202', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c2');

-- Client A2 already has a session; client B1 has one in tenant B.
insert into sessions (id, tenant_id, client_id, started_at) values
  ('a0000000-0000-7000-8000-000000000301', 'a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c2', now() - interval '2 days'),
  ('b0000000-0000-7000-8000-000000000301', 'b0000000-0000-7000-8000-000000000000', 'b0000000-0000-7000-8000-0000000000c1', now() - interval '2 days');

insert into triage_items (tenant_id, client_id, reason_code, priority) values
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c1', 'unread_message', 55),
  ('a0000000-0000-7000-8000-000000000000', 'a0000000-0000-7000-8000-0000000000c2', 'missed_sessions', 50);
