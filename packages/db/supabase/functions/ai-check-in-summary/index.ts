// POST /ai/check-in-summary (K-2): drafts a 3–5 line weekly summary for one client.
// Runs as the calling coach (RLS), sends the model aggregates only, and stores the result in
// ai_drafts as a draft. Nothing is sent to the client here: approve_ai_draft does that after a coach tap.
import { z } from 'zod';
import {
  CHECK_IN_SUMMARY_JSON_SCHEMA,
  CheckInSummaryOutput,
  buildCheckInSummaryInput,
  checkInForSummary,
  checkInSummaryPrompt,
  type CheckInSummarySource,
} from '../_shared/core/ai.ts';
import type { LoggedSet } from '../_shared/core/schemas.ts';
import {
  MODEL,
  aiErrorResponse,
  callStructured,
  checkCap,
  cors,
  json,
  userClient,
} from '../_shared/ai-runtime.ts';

const Body = z.object({
  clientId: z.string().uuid(),
  /** Monday of the week to summarise (YYYY-MM-DD). Defaults to the last 7 days. */
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const day = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Send a clientId.', issues: parsed.error.issues });
  const { clientId } = parsed.data;

  const db = userClient(req);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json(401, { error: 'Sign in again.' });

  // RLS only returns the membership if this coach can see the client.
  const { data: membership } = await db
    .from('memberships')
    .select('tenant_id, created_at')
    .eq('profile_id', clientId)
    .eq('role', 'client')
    .maybeSingle();
  if (!membership) return json(404, { error: 'This client isn’t in your list.' });
  const tenantId = membership.tenant_id as string;
  const { data: coach } = await db.rpc('is_coach', { t: tenantId });
  if (!coach) return json(403, { error: 'Only coaches can draft summaries.' });

  try {
    const cap = await checkCap(db, tenantId);
    if (!cap.ok) return json(429, { error: cap.message, code: 'cap_reached' });

    const end = parsed.data.weekStart ? new Date(`${parsed.data.weekStart}T00:00:00Z`) : new Date();
    const start = parsed.data.weekStart ? end : new Date(end.getTime() - 7 * 86_400_000);
    const stop = parsed.data.weekStart ? new Date(start.getTime() + 7 * 86_400_000) : end;

    const { data: sessions, error: sErr } = await db
      .from('sessions')
      .select('id, program_day_id, scheduled_date, started_at, feel, note, program_days(title)')
      .eq('client_id', clientId)
      .gte('started_at', start.toISOString())
      .lt('started_at', stop.toISOString())
      .not('finished_at', 'is', null)
      .order('started_at');
    if (sErr) throw sErr;
    const ids = (sessions ?? []).map((s) => s.id as string);

    const { data: sets, error: setErr } = ids.length
      ? await db
          .from('logged_sets')
          .select(
            'id, session_id, program_exercise_id, exercise_id, set_index, weight, reps, rpe, duration_s, distance_m, logged_at',
          )
          .in('session_id', ids)
          .is('voided_at', null)
      : { data: [], error: null };
    if (setErr) throw setErr;

    const exerciseIds = [...new Set((sets ?? []).map((s) => s.exercise_id as string))];
    const { data: exercises } = exerciseIds.length
      ? await db.from('exercises').select('id, name, default_metric').in('id', exerciseIds)
      : { data: [] };
    const { data: records } = ids.length
      ? await db
          .from('personal_records')
          .select('exercise_id, type, value, previous')
          .in('session_id', ids)
      : { data: [] };

    // Planned sessions: days in the program week the client is on, else what they did.
    let planned = ids.length;
    const { data: assignment } = await db
      .from('assignments')
      .select('program_id, start_date')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assignment) {
      const weekIndex = Math.floor(
        (start.getTime() - Date.parse(`${assignment.start_date}T00:00:00Z`)) / (7 * 86_400_000),
      );
      const { data: week } = await db
        .from('program_weeks')
        .select('id, program_days(id)')
        .eq('program_id', assignment.program_id)
        .eq('week_index', Math.max(0, weekIndex))
        .maybeSingle();
      const days = (week?.program_days as unknown[] | undefined)?.length;
      if (days) planned = days;
    }

    // Check-ins live in the check-ins feature's table; answers are read defensively by key.
    const { data: checkIn } = await db
      .from('check_ins')
      .select('id, submitted_at, answers, photo_ids')
      .eq('client_id', clientId)
      .gte('due_date', day(start))
      .lt('due_date', day(stop))
      .order('due_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: prevCheckIn } = checkIn
      ? await db
          .from('check_ins')
          .select('answers')
          .eq('client_id', clientId)
          .lt('due_date', day(start))
          .not('submitted_at', 'is', null)
          .order('due_date', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const toSet = (s: Record<string, unknown>): LoggedSet => ({
      id: s.id as string,
      sessionId: s.session_id as string,
      programExerciseId: s.program_exercise_id as string,
      exerciseId: s.exercise_id as string,
      setIndex: s.set_index as number,
      weightKg: s.weight == null ? null : Number(s.weight),
      reps: s.reps as number | null,
      rpe: s.rpe == null ? null : Number(s.rpe),
      durationS: s.duration_s as number | null,
      distanceM: s.distance_m == null ? null : Number(s.distance_m),
      loggedAt: s.logged_at as string,
    });

    const source: CheckInSummarySource = {
      client: { id: clientId, fullName: '' },
      weekStart: day(start),
      weekEnd: day(new Date(stop.getTime() - 86_400_000)),
      sessionsPlanned: planned,
      sessions: (sessions ?? []).map((s) => ({
        title: ((s.program_days as { title?: string } | null)?.title ?? 'Session') as string,
        date: (s.scheduled_date ?? String(s.started_at).slice(0, 10)) as string,
        feel: s.feel as number | null,
        note: s.note as string | null,
        sets: (sets ?? []).filter((x) => x.session_id === s.id).map(toSet),
      })),
      exerciseNames: Object.fromEntries((exercises ?? []).map((e) => [e.id, e.name])),
      exerciseMetrics: Object.fromEntries((exercises ?? []).map((e) => [e.id, e.default_metric])),
      records: (records ?? []).map((r) => ({
        exerciseId: r.exercise_id,
        type: r.type,
        value: Number(r.value),
        previous: Number(r.previous),
      })),
      checkIn: checkInForSummary(
        checkIn
          ? {
              submittedAt: checkIn.submitted_at as string | null,
              answers: checkIn.answers,
              photoIds: (checkIn.photo_ids as string[] | null) ?? [],
            }
          : null,
        prevCheckIn?.answers,
      ),
    };

    const input = buildCheckInSummaryInput(source);
    const { system, user } = checkInSummaryPrompt(input);
    const out = await callStructured({
      system,
      user,
      jsonSchema: CHECK_IN_SUMMARY_JSON_SCHEMA,
      schema: CheckInSummaryOutput,
      effort: 'medium',
    });
    const text = out.lines.join('\n');

    const { data: draft, error: dErr } = await db
      .from('ai_drafts')
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        kind: 'check_in_summary',
        input_ref: {
          weekStart: source.weekStart,
          weekEnd: source.weekEnd,
          sessionIds: ids,
          checkInId: checkIn?.id ?? null,
        },
        output: { lines: out.lines, text },
        model: MODEL,
      })
      .select('id, status, output, created_at')
      .single();
    if (dErr) throw dErr;
    return json(200, {
      draft,
      basedOn: {
        sessionsDone: ids.length,
        sessionsPlanned: planned,
        sets: sets?.length ?? 0,
        checkInSubmitted: !!checkIn?.submitted_at,
      },
    });
  } catch (err) {
    return aiErrorResponse(err);
  }
});
