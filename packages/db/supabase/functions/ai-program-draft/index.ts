// POST /ai/program-draft (K-2): drafts a 4–8 week block from the client's intake and the coach's own
// exercise library and templates. Saved as an unpublished program (status 'draft') that opens in the
// builder; it is never assigned or shown to the client until the coach publishes and assigns it.
import { z } from 'zod';
import {
  PROGRAM_DRAFT_JSON_SCHEMA,
  ProgramDraftOutput,
  buildProgramDraftInput,
  programDraftPrompt,
  toDraftProgram,
  type DraftProgram,
  type DraftLibraryExercise,
} from '../_shared/core/ai.ts';
import { MODEL, aiErrorResponse, callStructured, checkCap, cors, json, userClient } from '../_shared/ai-runtime.ts';

const Body = z.object({
  clientId: z.string().uuid(),
  weeks: z.number().int().min(4).max(8).default(6),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Send a clientId and 4–8 weeks.', issues: parsed.error.issues });
  const { clientId, weeks } = parsed.data;

  const db = userClient(req);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json(401, { error: 'Sign in again.' });

  const { data: membership } = await db.from('memberships').select('tenant_id').eq('profile_id', clientId).eq('role', 'client').maybeSingle();
  if (!membership) return json(404, { error: 'This client isn’t in your list.' });
  const tenantId = membership.tenant_id as string;
  const { data: coach } = await db.rpc('is_coach', { t: tenantId });
  if (!coach) return json(403, { error: 'Only coaches can draft programs.' });

  try {
    const cap = await checkCap(db, tenantId);
    if (!cap.ok) return json(429, { error: cap.message, code: 'cap_reached' });

    const { data: intake } = await db
      .from('intake_responses')
      .select('id, answers')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!intake) return json(409, { error: 'This client hasn’t finished their intake yet.', code: 'no_intake' });
    const a = intake.answers as Record<string, unknown>;

    const { data: lib, error: libErr } = await db.from('exercises').select('id, name, default_metric, equipment');
    if (libErr) throw libErr;
    const library: DraftLibraryExercise[] = (lib ?? []).map((e) => ({
      exerciseId: e.id,
      name: e.name,
      metric: e.default_metric,
      equipment: e.equipment ?? [],
    }));
    if (library.length < 3) return json(409, { error: 'Add a few exercises to your library first.', code: 'small_library' });

    const { data: templates } = await db
      .from('programs')
      .select('name, program_days(title, day_index)')
      .eq('tenant_id', tenantId)
      .eq('is_template', true)
      .limit(10);

    const input = buildProgramDraftInput({
      client: { id: clientId, fullName: '' },
      intake: {
        goal: (a.goal as string) ?? null,
        daysPerWeek: Number(a.days ?? a.daysPerWeek ?? 3),
        equipment: (a.equipment as string) ?? null,
        injuries: (a.injuries as string) ?? null,
        parq: {},
      },
      weeks,
      library,
      templates: (templates ?? []).map((t) => ({
        name: t.name as string,
        dayTitles: ((t.program_days as { title: string; day_index: number }[]) ?? []).sort((x, y) => x.day_index - y.day_index).map((d) => d.title),
      })),
    });

    const { system, user } = programDraftPrompt(input);
    let program: DraftProgram | null = null;
    const out = await callStructured({
      system,
      user,
      jsonSchema: PROGRAM_DRAFT_JSON_SCHEMA,
      schema: ProgramDraftOutput,
      effort: 'high',
      refine: (o) => {
        // Throws (and so triggers the one retry) on unknown exercises or bad rep ranges.
        program = toDraftProgram(o, library, () => crypto.randomUUID());
      },
    });
    const draft = program ?? toDraftProgram(out, library, () => crypto.randomUUID());

    // Save as an unpublished program. RLS: coaches may write programs in their tenant.
    const ins = async (table: string, rows: unknown[]) => {
      if (rows.length === 0) return;
      const { error } = await db.from(table).insert(rows);
      if (error) throw error;
    };
    await ins('programs', [{ id: draft.id, tenant_id: tenantId, name: draft.name, is_template: false, status: 'draft', created_by: auth.user.id }]);
    const weekRows = draft.weeks.map((w) => ({ id: crypto.randomUUID(), tenant_id: tenantId, program_id: draft.id, week_index: w.weekIndex }));
    await ins('program_weeks', weekRows);
    const dayRows = draft.weeks.flatMap((w, wi) =>
      w.days.map((d, di) => ({ id: crypto.randomUUID(), tenant_id: tenantId, program_id: draft.id, week_id: weekRows[wi]!.id, day_index: di, title: d.title, coach_note: d.coachNote, _d: d })),
    );
    await ins('program_days', dayRows.map(({ _d, ...r }) => r));
    const exRows = dayRows.flatMap((d) =>
      d._d.exercises.map((e, i) => ({
        id: e.id,
        tenant_id: tenantId,
        program_id: draft.id,
        program_day_id: d.id,
        exercise_id: e.exerciseId,
        position: i,
        metric: e.metric,
        rest_s: e.restS,
        note: e.note,
        track_rpe: e.trackRpe,
        _e: e,
      })),
    );
    await ins('program_exercises', exRows.map(({ _e, ...r }) => r));
    await ins(
      'prescribed_sets',
      exRows.flatMap((x) =>
        x._e.sets.map((s) => ({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          program_id: draft.id,
          program_exercise_id: x.id,
          set_index: s.index,
          reps_min: s.repsMin,
          reps_max: s.repsMax,
          load_type: s.rpe != null ? 'rpe' : 'absolute',
          load_value: s.rpe,
          rpe: s.rpe,
          rest_s: x._e.restS,
          duration_s: s.durationS,
          distance_m: s.distanceM,
        })),
      ),
    );

    const { data: row, error: dErr } = await db
      .from('ai_drafts')
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        kind: 'program',
        input_ref: { intakeResponseId: intake.id, weeks, libraryCount: library.length },
        output: { programId: draft.id, name: draft.name, weeks: draft.weeks.length },
        model: MODEL,
      })
      .select('id, status, created_at')
      .single();
    if (dErr) throw dErr;
    return json(200, { draft: row, program: draft });
  } catch (err) {
    return aiErrorResponse(err);
  }
});
