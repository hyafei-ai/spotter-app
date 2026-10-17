# Spotter

A white-label coaching platform: one codebase that each personal trainer ships as their own branded client app, plus a shared coach app. The demo tenant is a fictional trainer, **Maya Reyes Strength**. All demo data is invented and marked `MOCK DATA` in code.

- Requirements: *Spotter — Product & Engineering Requirements* (Oct 17, 2026)
- Design decisions: [`docs/design/art-direction.md`](docs/design/art-direction.md), [`docs/design/ux-validation.md`](docs/design/ux-validation.md)

## Repo

```
apps/client     Expo SDK 58 + Expo Router: the branded client app (one build per tenant)
apps/coach      Expo SDK 58 + Expo Router: the shared Spotter Coach app
packages/core   Pure TypeScript: Zod schemas, offline sync queue, progression rules, PRs, triage, brand checks, tenant config
packages/ui     Design tokens + components (SetRow with the chalk strike, Stepper, Banner, Toast, Sheet, …)
packages/db     Supabase: SQL migrations, RLS, sync_apply(), Edge Function sync-push, SQL tests
```

## Run it

```bash
pnpm install
pnpm client            # Expo dev server for the client app (TENANT_ID=north-shore-barbell pnpm client to switch tenant)
pnpm coach             # coach app
pnpm test              # core unit tests (Vitest) + SQL migrations/RLS tests on a throwaway local Postgres
pnpm typecheck
bash scripts/build-web.sh   # web preview: client at /, coach at /coach (what Vercel deploys)
```

Without `EXPO_PUBLIC_SUPABASE_URL` the apps run in demo mode: sample data, a demo sync transport, and **Me → Demo controls** to show the screen states (offline, rest day, no program, payment problem).

`TENANT_ID` selects the tenant in `apps/client/app.config.ts` (name, slug, bundle IDs, icon, scheme, update channel). Placeholder icons are generated with `pnpm icons`.

## What's built (against the build plan)

| Phase | Status |
|---|---|
| 1 Foundation | Monorepo, both apps on Expo Router, tokens + components, fonts, light/dark, tenant switching via `TENANT_ID`, brand AA check, schema + RLS with SQL tests. **Not yet:** Supabase Auth wiring (magic link / Apple / Google), ESLint config. |
| 2 Client core loop | Welcome (incl. expired invite), intake with PAR-Q flag and resume-later draft, waiver with drawn signature (works offline), notification ask, Today (session / rest / no program / done / resume / skeleton), logger (prefilled one-tap logging, chalk strike + haptic, Undo, edit a logged set, rest timer with local notification, supersets, distance/time/bodyweight, swap to approved alternative, smart-progression suggestion with "Keep"), finish (real PRs only, unlogged-set warning), History + read-only log. Persistent SQLite queue with backoff, idempotency, reject handling and a sync banner. **Not yet:** exercise demo video, AMRAP-specific UI, Maestro E2E. |
| 3 Coach core loop | Triage list with reasons, filters, search, actions sheet (Reply, Mark handled with Undo, Snooze), client detail, read-only program view, thread. **Not yet:** program builder/assignment, realtime, push, swipe gestures (the action sheet is the button alternative). |
| 4–9 | Not started: form checks/video, check-ins, AI drafts (table + approval constraint exist), nutrition, payments/Grow, publishing pipeline, team, import/export. |

## Backend

`packages/db/supabase/migrations`: tenancy, programs, sessions/sets, PRs (derived by trigger), messaging, triage, AI-draft audit, devices, audit log, plus RLS on every table. `sync_apply(mutations, client_ip)` applies offline batches under the caller's RLS: idempotent by `client_mutation_id`, newest `logged_at` wins per (session, exercise, set index), and one bad mutation never blocks the batch. The Edge Function `sync-push` validates with the shared Zod schemas (`pnpm --filter @spotter/db sync-schemas` copies them in) and calls it.

Deploy: `supabase link`, `supabase db push`, `supabase functions deploy sync-push`.
