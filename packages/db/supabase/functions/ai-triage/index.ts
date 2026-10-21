// POST /ai/triage (K-2, nightly): flags clients at risk of churning as a coach-only triage item.
// Rule-based (no model call): no app opens for 7 days, or adherence that halved over three weeks.
// Each flag is logged in ai_drafts (kind 'triage') like every other assistant output. Never shown to clients.
import { churnRisk } from '../_shared/core/ai.ts';
import { cors, isCron, json, serviceClient } from '../_shared/ai-runtime.ts';

const WEEK = 7 * 86_400_000;
const PAGE = 500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!isCron(req)) return json(401, { error: 'Scheduled job only.' });

  const db = serviceClient();
  const now = new Date();
  let flagged = 0;
  let checked = 0;

  for (let from = 0; ; from += PAGE) {
    const { data: clients, error } = await db
      .from('memberships')
      .select('tenant_id, profile_id, last_app_open_at, created_at')
      .eq('role', 'client')
      .eq('status', 'active')
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) return json(500, { error: error.message });
    if (!clients?.length) break;

    for (const c of clients) {
      checked++;
      // New clients get a week before they can be flagged.
      if (now.getTime() - Date.parse(c.created_at) < WEEK) continue;

      const since = new Date(now.getTime() - 3 * WEEK);
      const { data: sessions } = await db
        .from('sessions')
        .select('started_at')
        .eq('client_id', c.profile_id)
        .gte('started_at', since.toISOString())
        .not('finished_at', 'is', null);
      const { data: assignment } = await db
        .from('assignments')
        .select('program_id, start_date')
        .eq('client_id', c.profile_id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      let weekly: number[] = [];
      if (assignment) {
        const { data: weeks } = await db.from('program_weeks').select('week_index, program_days(id)').eq('program_id', assignment.program_id);
        const daysIn = (i: number) => (weeks?.find((w) => w.week_index === i)?.program_days as unknown[] | undefined)?.length ?? 0;
        weekly = [2, 1, 0].map((ago) => {
          const ws = now.getTime() - (ago + 1) * WEEK;
          const we = ws + WEEK;
          const done = (sessions ?? []).filter((s) => Date.parse(s.started_at) >= ws && Date.parse(s.started_at) < we).length;
          const idx = Math.floor((ws - Date.parse(`${assignment.start_date}T00:00:00Z`)) / WEEK);
          const planned = idx >= 0 ? daysIn(idx) : 0;
          return planned > 0 ? Math.min(1, done / planned) : 1;
        });
      }

      const result = churnRisk({ weeklyAdherence: weekly, lastOpenAt: c.last_app_open_at, now: now.toISOString() });
      if (!result.flag) continue;

      const { count } = await db
        .from('triage_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', c.tenant_id)
        .eq('client_id', c.profile_id)
        .eq('reason_code', 'churn_risk')
        .is('handled_at', null);
      if (count) continue;

      await db.from('triage_items').insert({
        tenant_id: c.tenant_id,
        client_id: c.profile_id,
        reason_code: 'churn_risk',
        detail: { reasons: result.reasons, weeklyAdherence: weekly, lastAppOpenAt: c.last_app_open_at },
        priority: 40,
      });
      await db.from('ai_drafts').insert({
        tenant_id: c.tenant_id,
        client_id: c.profile_id,
        kind: 'triage',
        input_ref: { weeklyAdherence: weekly, lastAppOpenAt: c.last_app_open_at, at: now.toISOString() },
        output: { reasons: result.reasons },
        model: 'rules:churn-v1',
      });
      flagged++;
    }
    if (clients.length < PAGE) break;
  }
  return json(200, { checked, flagged });
});
