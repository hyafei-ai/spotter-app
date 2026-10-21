// Shared runtime for the AI Edge Functions: HTTP helpers, Supabase clients, the Claude call and the
// monthly cap. Secrets come from env only (ANTHROPIC_API_KEY, SUPABASE_*), never from the request.
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import { usageState, capMessage } from './core/ai.ts';

export const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-client-info, apikey, x-cron-secret',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

/** Client acting as the caller: every read and write goes through their RLS policies. */
export function userClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false },
  });
}

/** Service role, only for scheduled jobs that act for no single user (nightly triage, progression). */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

/** Jobs invoked by pg_cron / pg_net carry a shared secret instead of a user token. */
export function isCron(req: Request): boolean {
  const secret = Deno.env.get('CRON_SECRET');
  return !!secret && req.headers.get('x-cron-secret') === secret;
}

/* ---------- model ---------- */

/** The provider is an open question in the spec; Claude is the default. Override with AI_MODEL. */
export const MODEL = Deno.env.get('AI_MODEL') ?? 'claude-opus-5-5';

export class AiUnavailable extends Error {}
export class AiRefused extends Error {}
export class AiInvalidOutput extends Error {}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!Deno.env.get('ANTHROPIC_API_KEY')) throw new AiUnavailable('AI isn’t set up for this workspace yet.');
  client ??= new Anthropic();
  return client;
}

/**
 * One structured-output call. The response is constrained to `jsonSchema` and then validated with the
 * full Zod schema (plus any `refine` check); on invalid output the call is retried once with the
 * validation error appended. Declines fall back server-side (`fallbacks: "default"`).
 */
export async function callStructured<T>(opts: {
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  refine?: (value: T) => void; // throw to reject
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}): Promise<T> {
  const api = anthropic();
  let feedback: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: opts.user }];
    if (feedback) {
      messages.push({ role: 'user', content: `Your previous answer was rejected: ${feedback}. Return a corrected answer.` });
    }
    const stream = api.beta.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: opts.system,
      messages,
      output_config: { effort: opts.effort ?? 'medium', format: { type: 'json_schema', schema: opts.jsonSchema } },
    });
    const res = await stream.finalMessage();
    if (res.stop_reason === 'refusal') throw new AiRefused('The model declined this request.');
    if (res.stop_reason === 'max_tokens') {
      feedback = 'it was cut off; keep it shorter';
      continue;
    }
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    try {
      const value = opts.schema.parse(JSON.parse(text));
      opts.refine?.(value);
      return value;
    } catch (err) {
      feedback = err instanceof Error ? err.message.slice(0, 500) : 'invalid JSON';
    }
  }
  throw new AiInvalidOutput('The draft came back in an unexpected shape twice.');
}

/* ---------- monthly cap ---------- */

/** Per-tenant monthly cap on model drafts (AI_MONTHLY_DRAFT_CAP, default 200). */
export async function checkCap(db: SupabaseClient, tenantId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const cap = Number(Deno.env.get('AI_MONTHLY_DRAFT_CAP') ?? 200);
  const { data, error } = await db.rpc('ai_drafts_this_month', { t: tenantId });
  if (error) throw error;
  const state = usageState(Number(data ?? 0), cap);
  return state.allowed ? { ok: true } : { ok: false, message: capMessage(state) };
}

/** Maps runtime failures to responses the coach app shows as "generation failed, Retry". */
export function aiErrorResponse(err: unknown): Response {
  if (err instanceof AiUnavailable) return json(503, { error: err.message, code: 'ai_unavailable' });
  if (err instanceof AiRefused) return json(422, { error: 'This one couldn’t be drafted. Write it yourself, or try again.', code: 'refused' });
  if (err instanceof AiInvalidOutput) return json(502, { error: err.message, code: 'invalid_output' });
  if (err instanceof Anthropic.RateLimitError) return json(429, { error: 'Busy right now. Try again in a minute.', code: 'rate_limited' });
  if (err instanceof Anthropic.APIError) return json(502, { error: 'The AI service had a problem. Try again.', code: 'upstream' });
  console.error(err);
  return json(500, { error: 'Something went wrong drafting this. Try again.', code: 'internal' });
}
