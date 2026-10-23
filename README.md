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
bash scripts/build-web.sh   # Expo web preview: client at /, coach at /coach-app, shared app at /shared
pnpm web                    # Next.js trainer pages + coach dashboard on :3001
```

Without `EXPO_PUBLIC_SUPABASE_URL` the apps run in demo mode: sample data, a demo sync transport, and **Me → Demo controls** to show the screen states (offline, rest day, no program, payment problem).

`TENANT_ID` selects the tenant in `apps/client/app.config.ts` (name, slug, bundle IDs, icon, scheme, update channel). Placeholder icons are generated with `pnpm icons`.

## What's built (against the build plan)

Every phase of the build plan has a working implementation. Each one runs fully in demo mode (sample data, no server) and is wired to Supabase, Stripe, Mux and the AI API for when credentials are set. Per-area detail, including exactly what is mocked and which credentials each part needs, is in `docs/features/`.

| Phase | What's in place | Details |
|---|---|---|
| 1 Foundation | Monorepo, both apps, design system, light/dark, per-tenant config, RLS on every table, ESLint, CI | this README |
| 2 Client core loop | Invite/consent/intake (coach-editable)/waiver, Today, offline logger with the chalk strike, finish, history, sync queue | `docs/design/` |
| 3 Coach core loop | Triage (live, swipe + buttons), client detail, program builder and assignment, exercise library, messaging with voice/photos, push | `programs.md`, `platform.md` |
| 4 Form checks and check-ins | Record/pick video, resumable upload, coach review with drawing tools, voice-over and compare; weekly check-ins with photos | `formchecks-checkins.md` |
| 5 AI and progression | Check-in summaries, program drafts and churn flags, all coach-approved and logged; server-side progression | `ai.md` |
| 6 Nutrition | Macros or portions or off, food search, barcode scan, meal plans, habits, Apple Health / Health Connect | `nutrition.md` |
| 7 Payments and Grow | Stripe Connect, plans, coupons, trials, session packs, landing pages, storefront, leads, referrals, real-data stats | `grow.md` |
| 8 White-label publishing | Brand setup with preview, per-tenant EAS builds, encrypted store credentials, publishing checklist and status, shared app with trainer code | `publishing.md` |
| 9 Team, portability, hardening | Assistants and hand-offs, CSV import, export and account deletion, support access audit, Sentry/PostHog, Maestro flows, accessibility pass | `platform.md` |

**Not verified here** (no credentials or devices in the build environment): real calls to Supabase, Stripe, Mux, the AI API, Expo push and email; native-only features (HealthKit, Health Connect, background upload, camera recording); Maestro flows on a simulator; App Store / Play submission. These need a configured environment and a device build.

**Web apps.** The Expo web preview (client at `/`, coach at `/coach-app`, shared app at `/shared`) deploys from `vercel.json`. The trainer pages and coach dashboard in `apps/web` (Next.js) deploy as a separate Vercel project with root `apps/web` (see `docs/features/grow.md`).

## Backend

`packages/db/supabase/migrations`: tenancy, versioned intake forms (only the coach who owns the business edits them, one live form per tenant), programs, sessions/sets, PRs (derived by trigger), messaging, triage, AI-draft audit, devices, audit log, plus RLS on every table. `sync_apply(mutations, client_ip)` applies offline batches under the caller's RLS: idempotent by `client_mutation_id`, newest `logged_at` wins per (session, exercise, set index), and one bad mutation never blocks the batch. The Edge Function `sync-push` validates with the shared Zod schemas (`pnpm --filter @spotter/db sync-schemas` copies them in) and calls it.

Deploy: `supabase link`, `supabase db push`, `supabase functions deploy sync-push`.
