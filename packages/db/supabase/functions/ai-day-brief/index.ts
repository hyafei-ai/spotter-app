// POST /ai/day-brief (docs/ports.md row 8): a "Strategy & Stimulus" draft for one program day, written from the day's
// blocks only (no client, name, age, sex or health data; free text redacted). Saved in day_briefs as a draft the
// coach edits and approves in the builder. Clients only ever read approved rows (RLS), and the program snapshot
// only carries approved text.
import { z } from 'zod';
import { DAY_BRIEF_JSON_SCHEMA, DayBriefOutput, buildDayBriefInput, dayBriefPrompt } from '../_shared/core/ai.ts';
import { Block } from '../_shared/core/schemas.ts';
import { MODEL, aiErrorResponse, callStructured, checkCap, cors, json, userClient } from '../_shared/ai-runtime.ts';

const Body = z.object({ programDayId: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Send a programDayId.', issues: parsed.error.issues });

  const db = userClient(req);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json(401, { error: 'Sign in again.' });

  // RLS: only a coach of the tenant (or an assigned client) can read the day; only a coach may draft.
  const { data: day } = await db
    .from('program_days')
    .select('id, tenant_id, title, coach_note, blocks')
    .eq('id', parsed.data.programDayId)
    .maybeSingle();
  if (!day) return json(404, { error: 'This session isn’t in your programs.' });
  const tenantId = day.tenant_id as string;
  const { data: coach } = await db.rpc('is_coach', { t: tenantId });
  if (!coach) return json(403, { error: 'Only coaches can draft this.' });

  const blocks = z.array(Block).safeParse(day.blocks ?? []);
  if (!blocks.success || !blocks.data.some((b) => b.kind !== 'strength' && b.kind !== 'note' && b.kind !== 'rest')) {
    return json(409, { error: 'Strategy & Stimulus is drafted for conditioning, intervals and race work. Add one first.', code: 'no_blocks' });
  }

  try {
    const cap = await checkCap(db, tenantId);
    if (!cap.ok) return json(429, { error: cap.message, code: 'cap_reached' });

    const { data: ex } = await db
      .from('program_exercises')
      .select('id, exercises(name), prescribed_sets(reps_max, load_type, load_value, rpe)')
      .eq('program_day_id', day.id);
    const exercises: Record<string, { name: string; prescription: string }> = {};
    for (const e of ex ?? []) {
      const sets = (e.prescribed_sets as { reps_max: number | null; load_type: string; load_value: number | null; rpe: number | null }[]) ?? [];
      const first = sets[0];
      const load = first?.load_type === 'pct_1rm' && first.load_value != null ? ` @ ${Math.round(first.load_value * 100)}% of max` : first?.rpe != null ? ` @ RPE ${first.rpe}` : '';
      exercises[e.id as string] = { name: ((e.exercises as { name: string } | null)?.name ?? 'Exercise'), prescription: `${sets.length} × ${first?.reps_max ?? '?'}${load}` };
    }
    const { data: tenant } = await db.from('tenants').select('units').eq('id', tenantId).maybeSingle();

    const input = buildDayBriefInput({
      title: day.title as string,
      coachNote: (day.coach_note as string | null) ?? null,
      blocks: blocks.data,
      exercises,
      units: (tenant?.units as 'kg' | 'lb' | undefined) ?? 'kg',
    });
    const { system, user } = dayBriefPrompt(input);
    const out = await callStructured({ system, user, jsonSchema: DAY_BRIEF_JSON_SCHEMA, schema: DayBriefOutput, effort: 'medium', maxTokens: 2000 });

    const { data: draft, error: dErr } = await db
      .from('ai_drafts')
      .insert({ tenant_id: tenantId, kind: 'day_brief', input_ref: { programDayId: day.id, blocks: input.blocks.length }, output: out, model: MODEL })
      .select('id, status, created_at')
      .single();
    if (dErr) throw dErr;
    // Always a draft: a new draft replaces an unapproved one and never overwrites approved text silently.
    const { data: existing } = await db.from('day_briefs').select('status').eq('program_day_id', day.id).maybeSingle();
    if (existing?.status === 'approved') return json(200, { draft, brief: { ...out, status: 'draft', source: 'ai' }, kept: 'approved' });
    const { error: bErr } = await db
      .from('day_briefs')
      .upsert({ program_day_id: day.id, tenant_id: tenantId, stimulus: out.stimulus, strategy: out.strategy, status: 'draft', source: 'ai', ai_draft_id: draft.id });
    if (bErr) throw bErr;
    return json(200, { draft, brief: { ...out, status: 'draft', source: 'ai' } });
  } catch (err) {
    return aiErrorResponse(err);
  }
});
