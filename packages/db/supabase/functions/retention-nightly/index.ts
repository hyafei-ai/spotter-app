// POST /retention-nightly (owner job, nightly): writes one member_risk_snapshots row per active member.
// Inputs come from member_risk_inputs() (service role); the rules are core/signals.ts memberRisk, the
// same code the owner's screen runs. Snapshots are owner-only and never shown to coaches or clients.
import { activityFromRow, toSignals, type MemberRiskInputRow } from '../_shared/core/retention.ts';
import { memberRisk } from '../_shared/core/signals.ts';
import { monthlyRevenueCents } from '../_shared/core/grow.ts';
import { cors, isCron, json, serviceClient } from '../_shared/ai-runtime.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!isCron(req)) return json(401, { error: 'Scheduled job only.' });

  const db = serviceClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: tenants, error } = await db.from('tenants').select('id');
  if (error) return json(500, { error: error.message });

  let written = 0;
  for (const t of tenants ?? []) {
    const { data: rows, error: inputsError } = await db.rpc('member_risk_inputs', { t: t.id, today });
    if (inputsError) return json(500, { error: inputsError.message });
    const snapshots = ((rows ?? []) as MemberRiskInputRow[]).map((row) => {
      const a = activityFromRow(row);
      const signals = toSignals(a, today);
      const risk = memberRisk(signals);
      return {
        tenant_id: t.id,
        client_id: a.clientId,
        taken_on: today,
        level: risk.level,
        points: risk.points,
        reasons: risk.reasons,
        monthly_value_cents: a.subscription ? monthlyRevenueCents(a.subscription) : 0,
        inputs: signals,
      };
    });
    if (snapshots.length === 0) continue;
    const { error: writeError } = await db.from('member_risk_snapshots').upsert(snapshots, { onConflict: 'tenant_id,client_id,taken_on' });
    if (writeError) return json(500, { error: writeError.message });
    written += snapshots.length;
  }
  return json(200, { written });
});
