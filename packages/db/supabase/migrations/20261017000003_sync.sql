-- POST /sync/push applies a batch of offline mutations through this function.
-- SECURITY INVOKER: every write goes through the caller's RLS policies.
-- Each mutation runs in its own subtransaction, so one rejection never blocks the rest.
-- Idempotent by client_mutation_id (applied_mutations ledger).
-- Conflict rule for sets: keyed by (session, program exercise, set index); the newest logged_at wins.

create or replace function public.sync_apply(mutations jsonb, client_ip inet default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  m jsonb;
  p jsonb;
  mid uuid;
  kind text;
  uid uuid := auth.uid();
  tenant uuid;
  accepted jsonb := '[]'::jsonb;
  rejected jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  for m in select * from jsonb_array_elements(mutations) loop
    mid := (m ->> 'clientMutationId')::uuid;
    kind := m ->> 'kind';
    p := m -> 'payload';

    if exists (select 1 from applied_mutations a where a.client_mutation_id = mid) then
      accepted := accepted || to_jsonb(mid);
      continue;
    end if;

    begin
      case kind
        when 'session.start' then
          select d.tenant_id into tenant from program_days d where d.id = (p ->> 'programDayId')::uuid;
          if tenant is null then
            raise exception 'This session isn’t in your program any more.' using errcode = 'P0002';
          end if;
          insert into sessions (id, tenant_id, client_id, program_day_id, scheduled_date, started_at, client_mutation_id)
          values ((p ->> 'sessionId')::uuid, tenant, uid, (p ->> 'programDayId')::uuid, (p ->> 'scheduledDate')::date,
                  (p ->> 'startedAt')::timestamptz, mid)
          on conflict (id) do nothing;

        when 'set.log' then
          select s.tenant_id into tenant from sessions s where s.id = (p ->> 'sessionId')::uuid and s.client_id = uid;
          if tenant is null then
            raise exception 'This session was removed by your coach.' using errcode = 'P0002';
          end if;
          insert into logged_sets (id, tenant_id, client_id, session_id, program_exercise_id, exercise_id, set_index,
                                   weight, reps, rpe, duration_s, distance_m, logged_at, client_mutation_id)
          values ((p ->> 'id')::uuid, tenant, uid, (p ->> 'sessionId')::uuid, (p ->> 'programExerciseId')::uuid,
                  p ->> 'exerciseId', (p ->> 'setIndex')::int, (p ->> 'weightKg')::numeric, (p ->> 'reps')::int,
                  (p ->> 'rpe')::numeric, (p ->> 'durationS')::int, (p ->> 'distanceM')::numeric,
                  (p ->> 'loggedAt')::timestamptz, mid)
          on conflict (session_id, program_exercise_id, set_index) do update
            set weight = excluded.weight, reps = excluded.reps, rpe = excluded.rpe, duration_s = excluded.duration_s,
                distance_m = excluded.distance_m, exercise_id = excluded.exercise_id, logged_at = excluded.logged_at,
                voided_at = null, client_mutation_id = excluded.client_mutation_id
            where logged_sets.logged_at <= excluded.logged_at;

        when 'set.void' then
          update logged_sets set voided_at = (p ->> 'voidedAt')::timestamptz
           where session_id = (p ->> 'sessionId')::uuid and program_exercise_id = (p ->> 'programExerciseId')::uuid
             and set_index = (p ->> 'setIndex')::int and client_id = uid and logged_at <= (p ->> 'voidedAt')::timestamptz;
          select s.tenant_id into tenant from sessions s where s.id = (p ->> 'sessionId')::uuid and s.client_id = uid;
          if tenant is null then
            raise exception 'This session was removed by your coach.' using errcode = 'P0002';
          end if;

        when 'session.finish' then
          update sessions set finished_at = (p ->> 'finishedAt')::timestamptz, feel = (p ->> 'feel')::smallint, note = p ->> 'note'
           where id = (p ->> 'sessionId')::uuid and client_id = uid
          returning tenant_id into tenant;
          if tenant is null then
            raise exception 'This session was removed by your coach.' using errcode = 'P0002';
          end if;

        when 'message.send' then
          select t.tenant_id into tenant from threads t where t.id = (p ->> 'threadId')::uuid;
          if tenant is null then
            raise exception 'This conversation isn’t available.' using errcode = 'P0002';
          end if;
          insert into messages (id, tenant_id, thread_id, sender_id, kind, body, sent_at, client_mutation_id)
          values ((p ->> 'messageId')::uuid, tenant, (p ->> 'threadId')::uuid, uid, 'text', p ->> 'body', (p ->> 'sentAt')::timestamptz, mid)
          on conflict (id) do nothing;

        when 'intake.submit' then
          select mm.tenant_id into tenant from memberships mm where mm.profile_id = uid and mm.role = 'client' order by mm.created_at desc limit 1;
          insert into intake_responses (id, tenant_id, client_id, form_key, answers, parq_flag, client_mutation_id)
          values ((p ->> 'responseId')::uuid, tenant, uid, p ->> 'formId', p -> 'answers', (p ->> 'parqFlag')::boolean, mid)
          on conflict (id) do nothing;

        when 'waiver.sign' then
          select mm.tenant_id into tenant from memberships mm where mm.profile_id = uid and mm.role = 'client' order by mm.created_at desc limit 1;
          insert into waiver_signatures (id, tenant_id, client_id, waiver_version, signed_name, signature_svg, ip, app_version, signed_at, client_mutation_id)
          values ((p ->> 'signatureId')::uuid, tenant, uid, (p ->> 'waiverVersion')::int, p ->> 'signedName', p ->> 'signatureSvg',
                  client_ip, p ->> 'appVersion', (p ->> 'signedAt')::timestamptz, mid)
          on conflict (id) do nothing;

        else
          raise exception 'Unknown change type %', kind using errcode = '22023';
      end case;

      insert into applied_mutations (client_mutation_id, tenant_id, profile_id, kind) values (mid, tenant, uid, kind);
      accepted := accepted || to_jsonb(mid);
    exception
      when insufficient_privilege then
        rejected := rejected || jsonb_build_object('clientMutationId', mid, 'reason', 'forbidden', 'message', 'You don’t have access to this.');
      when no_data_found then
        rejected := rejected || jsonb_build_object('clientMutationId', mid, 'reason', 'not_found', 'message', sqlerrm);
      when others then
        rejected := rejected || jsonb_build_object('clientMutationId', mid, 'reason', 'invalid', 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('accepted', accepted, 'rejected', rejected);
end $$;

grant execute on function public.sync_apply(jsonb, inet) to authenticated;
