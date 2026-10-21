# AI assistant and server-side progression (K-2, C-4, build phase 5)

The assistant drafts and the coach decides. Every output is a **draft**: nothing reaches a client until a coach taps **Approve and send**. The database enforces this (see below), so it doesn't rely on the apps behaving.

## What's built

### Core (`packages/core/src/ai.ts`, tests in `packages/core/test/ai.test.ts`)
- **Minimum-field input builders.**
  - `buildCheckInSummaryInput` sends aggregates only: adherence, per-exercise set counts and best set, real PRs, session feel, redacted notes, check-in numbers, and a `photosSubmitted` flag.
  - `buildProgramDraftInput` sends goal, days per week, equipment, redacted injuries, the library and template day names.
  - Neither sends names, emails, photo URLs or ids, PAR-Q answers, or other intake answers. `redact` strips emails, links and phone numbers from free text. A test asserts none of these reach the prompt.
- **Output schemas and prompts.** Zod schemas, plain JSON schemas for structured outputs, and system prompts. The prompts tell the model to use only the data and never estimate.
- **`toDraftProgram`.** Turns model output into weeks → days → `ProgramExercise[]`, the existing core shape. It sets no loads, and it rejects exercises outside the library or bad rep ranges so the caller can retry once.
- **`usageState` / `capMessage`.** The per-tenant monthly cap.
- **`churnRisk`.** Rule-based, no model: no app opens for 7 days, or adherence halved over three weeks.
- **`evaluateSessionProgressions`.** The server job, built on the same `evaluateProgression` the logger uses on device. A test checks it gives the same +2.5 kg suggestion as the logger.
- **MOCK stand-ins** (`mockCheckInSummary`, `mockProgramDraft`) for demo builds. They are deterministic and built only from the input's own numbers.

### Edge Functions (`packages/db/supabase/functions/`)
- **`_shared/ai-runtime.ts`.**
  - Calls Claude through the Anthropic SDK. The model comes from `AI_MODEL`, default `claude-opus-5-5`.
  - Uses structured outputs (`output_config.format`), then full Zod validation, with one retry on invalid output.
  - Opts into server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) and handles `stop_reason: "refusal"`.
  - Maps errors to coach-facing messages and enforces the monthly cap via `ai_drafts_this_month`.
- **`ai-check-in-summary`.** Runs as the calling coach (RLS). It gathers the week, writes an `ai_drafts` row with status `draft`, and returns it.
- **`ai-program-draft`.** Reads the intake, the coach's library and templates. It saves an unpublished program (`programs.status = 'draft'`, weeks/days/exercises/sets) and logs it in `ai_drafts`.
- **`ai-triage`.** Nightly, authenticated by `x-cron-secret`, using the service role. Writes `churn_risk` triage items (coach-only) and logs each one in `ai_drafts` (kind `triage`, model `rules:churn-v1`).
- **`progression-evaluate`.** Called by the `request_progression_evaluate` trigger when a session finishes (via pg_net). Writes a pending `progression_suggestions` row and supersedes any older pending one.

### Database (`migrations/20261021030001_ai.sql`, tests `tests/30_ai.test.sql`)
- **Sending drafts.**
  - `ai_drafts` gains `sent_at`, `sent_message_id` and `final_text`, plus a check that a draft can't be sent without an approved status, approver and time.
  - `approve_ai_draft(draft_id, final_text, send)` approves the draft (marking it `edited` if the coach changed it) and posts it to the client's thread as the coach. It runs under RLS.
- **Usage.** `ai_drafts_this_month(tenant)` and the `ai_usage_monthly` view (security invoker).
- **Progression suggestions.**
  - `progression_suggestions` has at most one pending row per client and exercise.
  - The client can read it and answer it (`accepted` or `kept`); no other field can change.
  - Coaches who can see the client can read it.
- **App opens.**
  - `memberships.last_app_open_at` is set through the new `app.open` offline mutation, via `sync_handle_ai`.
  - A guard trigger stops clients changing anything else on their membership.

### Coach app
- **Client detail → Assistant section.** Shows a churn-risk line when flagged ("Only you see this"), plus **Summarise this week** and **Draft a program with AI**.
- **`/client/[id]/ai-summary`.** States: drafting, failed with Try again, nothing logged, cap reached, draft (editable, with an **Edited** tag), sending, and sent. It also shows a "Based on" line, an offline banner, and Redraft and Discard actions. Approved text appears in the coach thread.
- **`/client/[id]/ai-program`.**
  - Shows the intake inputs and a 4–8 week length picker.
  - States: drafting, failed with Try again, no intake, cap reached, and a ready preview (weeks expand to days and exercises).
  - **Save as unpublished draft** saves it; the program is labelled as a draft throughout.
- **Me → AI drafts usage.** A demo switch, "Demo: make AI drafts fail", shows the failure state.

### Client app
- `src/appOpen.ts` sends `app.open` at most every 6 hours on launch and foreground.

## What's mocked (demo builds, no `EXPO_PUBLIC_SUPABASE_URL`)
- Summaries and program drafts come from the deterministic MOCK functions, using the sample data. Only Jordan Ellis has logged sets, so the other demo clients show "Nothing was logged this week".
- Intake answers and the exercise library on the program screen are MOCK sample data (`apps/coach/src/ai/demoSource.ts`).
- The monthly cap in the demo is 20, counted in memory. Saved program drafts go to `localStorage` under `spotter.programDrafts`.
- The "This week 2 of 3" line on client detail is older sample data. The summary counts only logged sessions, so for Jordan it says 1 of 3.

## Needs real credentials or services
- **Function secrets:** `ANTHROPIC_API_KEY`, `AI_MODEL` (optional), `AI_MONTHLY_DRAFT_CAP` (default 200), `CRON_SECRET`, and `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
- **pg_net and pg_cron.** Set `app.functions_url` and `app.functions_secret`, and schedule `ai-triage` (the SQL is in the migration comment).
- **Auth.** The coach app's live calls need an access token. The auth feature should call `setAccessTokenGetter` in `apps/coach/src/ai/store.ts` and provide `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- **Not verified here.** The functions typecheck against the real `@anthropic-ai/sdk` 0.137 and supabase-js types, but there's no Deno runtime or API key in this environment, so they haven't been run end to end.

## Integration notes
- **Program builder.** `DraftProgram` (core) is `{ id, name, status: 'draft', weeks: [{ weekIndex, days: [{ title, coachNote, exercises: ProgramExercise[] }] }] }`. Wire **Save as unpublished draft** and the saved-state screen to open `/program/[id]` in the builder, and map `DraftProgram` onto its model.
- **Check-ins.** `ai-check-in-summary` reads `check_ins` (`due_date`, `submitted_at`, `answers`, `photo_ids`) and expects these answer keys: `bodyweightKg`, `sleepHours`, `stress`, `adherence`, `note`/`freeText`. If the table or keys differ, adjust the mapping in that function.
- **Messaging.** Approved summaries are kept in `useAi().sent` and merged into the coach thread screen. Real builds post via `approve_ai_draft`.
- **Client suggestions.** The client still computes suggestions on device. To prefer server rows, read pending `progression_suggestions` and update their status on Accept or Keep.
