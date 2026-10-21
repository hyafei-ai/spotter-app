// POST /progression/evaluate (C-4): called by the DB trigger after a session finishes. Applies the
// coach's progression rules with the same evaluateProgression the logger uses on device, and writes a
// pending suggestion the client sees next time ("Suggested — your coach approved this rule").
import { z } from 'zod';
import { evaluateSessionProgressions, type ProgressionJobExercise } from '../_shared/core/ai.ts';
import { cors, isCron, json, serviceClient } from '../_shared/ai-runtime.ts';

const Body = z.object({ sessionId: z.string().uuid() });
const LB = 0.45359237;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!isCron(req)) return json(401, { error: 'Called by the database after a session finishes.' });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Send a sessionId.' });

  const db = serviceClient();
  const { data: session } = await db
    .from('sessions')
    .select('id, tenant_id, client_id, program_day_id, finished_at')
    .eq('id', parsed.data.sessionId)
    .maybeSingle();
  if (!session?.program_day_id || !session.finished_at) return json(200, { suggestions: 0, reason: 'not a finished program session' });

  const { data: rows, error } = await db
    .from('program_exercises')
    .select('id, progression_rules(id, condition, increment, unit, sessions_required), prescribed_sets(set_index, reps_min, reps_max, load_type, load_value, rpe, duration_s, distance_m, amrap)')
    .eq('program_day_id', session.program_day_id);
  if (error) return json(500, { error: error.message });

  const exercises: ProgressionJobExercise[] = [];
  for (const r of rows ?? []) {
    const rule = (r.progression_rules as Record<string, unknown>[] | null)?.[0];
    const sets = ((r.prescribed_sets as Record<string, unknown>[] | null) ?? []).sort((a, b) => Number(a.set_index) - Number(b.set_index));
    const first = sets[0];
    if (!rule || !first || first.load_type !== 'absolute' || first.load_value == null) continue;

    // The load the client is on now: the prescription, or a suggestion they already accepted.
    const { data: accepted } = await db
      .from('progression_suggestions')
      .select('suggested_load_kg')
      .eq('client_id', session.client_id)
      .eq('program_exercise_id', r.id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const prescribed = Number(first.load_value);
    const current = Math.max(prescribed, accepted ? Number(accepted.suggested_load_kg) : 0);
    const cond = (rule.condition ?? {}) as { maxRpe?: number | null };
    const increment = Number(rule.increment) * (rule.unit === 'lb' ? LB : 1);

    exercises.push({
      programExerciseId: r.id as string,
      currentLoadKg: current,
      rule: { id: rule.id as string, maxRpe: cond.maxRpe ?? null, sessionsRequired: Number(rule.sessions_required), incrementKg: Math.round(increment * 1000) / 1000 },
      prescribed: sets.map((s) => ({
        index: Number(s.set_index),
        repsMin: (s.reps_min as number | null) ?? null,
        repsMax: (s.reps_max as number | null) ?? null,
        loadKg: s.load_type === 'absolute' && s.load_value != null ? Number(s.load_value) : null,
        rpe: s.rpe == null ? null : Number(s.rpe),
        durationS: (s.duration_s as number | null) ?? null,
        distanceM: s.distance_m == null ? null : Number(s.distance_m),
        amrap: !!s.amrap,
      })),
    });
  }
  if (exercises.length === 0) return json(200, { suggestions: 0 });

  const { data: history, error: hErr } = await db
    .from('logged_sets')
    .select('session_id, program_exercise_id, set_index, weight, reps, rpe, logged_at')
    .eq('client_id', session.client_id)
    .in('program_exercise_id', exercises.map((e) => e.programExerciseId))
    .is('voided_at', null);
  if (hErr) return json(500, { error: hErr.message });

  const results = evaluateSessionProgressions(
    exercises,
    (history ?? []).map((h) => ({
      sessionId: h.session_id,
      programExerciseId: h.program_exercise_id,
      setIndex: h.set_index,
      weightKg: h.weight == null ? null : Number(h.weight),
      reps: h.reps,
      rpe: h.rpe == null ? null : Number(h.rpe),
      loggedAt: h.logged_at,
    })),
  );

  for (const s of results) {
    await db
      .from('progression_suggestions')
      .update({ status: 'superseded' })
      .eq('client_id', session.client_id)
      .eq('program_exercise_id', s.programExerciseId)
      .eq('status', 'pending');
    const { error: insErr } = await db.from('progression_suggestions').insert({
      tenant_id: session.tenant_id,
      client_id: session.client_id,
      program_exercise_id: s.programExerciseId,
      rule_id: s.ruleId,
      source_session_id: session.id,
      previous_load_kg: s.previousLoadKg,
      suggested_load_kg: s.suggestedLoadKg,
      reason: s.reason,
    });
    if (insErr) return json(500, { error: insErr.message });
  }
  return json(200, { suggestions: results.length });
});
