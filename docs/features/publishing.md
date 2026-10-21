# White-label brand setup and publishing (W-1 to W-4)

## What's built

**W-1 Brand setup**
- Web dashboard `/dashboard/brand`: app name (≤ 30), short name (≤ 12), accent colour with a live WCAG AA check against paper, a one-tap "use the nearest readable shade" fix, and the derived dark-mode shade. Also splash background, welcome message, support email, privacy link, units, tab renames from a fixed list, and module switches (Nutrition, Check-ins, Form checks, Habits, Storefront).
- Icon upload is checked in the browser: PNG, exactly 1024 × 1024, no transparent pixels (read from canvas). Logo upload accepts SVG, or PNG ≥ 1024 px; without one, the monogram is used.
- Live preview: HTML/CSS sketches of the welcome, Today and logger screens, in light and dark, labelled as a preview.
- Coach app `Me → Brand`: the same fields except uploads, plus a small preview.
- Client app: tab labels come from the tenant (`tabLabels`); `moduleOn(tenant, module)` is the switch other features should check before showing an entry point. A saved brand applies at startup (`src/runtimeTenant.ts`).

**W-2 Build pipeline**
- `apps/client/app.config.ts` takes the tenant from `TENANT_CONFIG_PATH` (written by the build script from the `tenants` row), from `TENANT_ID=spotter` (shared app), or from a demo slug. It sets name, slug, bundle IDs, icon, splash, scheme, the EAS project ID, the `appVersion` runtime version and the update channel.
- `apps/client/eas.json` has development, preview, production and shared profiles, plus a submit profile.
- `scripts/tenant-build.mjs`: `--tenant x | --all`, `--kind build|update|submit`, `--platform`, `--batch-size`, `--dry-run`, and `--worker`, which claims queued `publish_jobs`. Native rebuilds run in batches. Store keys are decrypted only inside the worker. Android submissions run one at a time through a temporary gitignored key file.
- Edge Functions:
  - `tenants-publish` re-checks brand, icon, keys and listing, then queues jobs.
  - `store-credentials` validates the upload with the shared Zod schema and seals it.
- Encryption: envelope encryption in the function, not Vault or pgsodium. Each key gets a random AES-256-GCM data key, which is wrapped with AES-KW using `CREDENTIALS_KEK` (32 bytes, base64, function secret only; `CREDENTIALS_KEK_ID` labels it for rotation). The table stores only ciphertext and the wrapped key. Column grants stop signed-in users, owners included, from reading them back; owners see a fingerprint and non-secret metadata.
- Listing kit:
  - A description template with `[[PLACEHOLDERS]]` that must be replaced before the listing can be confirmed (enforced in the UI and by a DB check).
  - A screenshot plan from real screens, filtered by the modules that are switched on.
  - App Store privacy-label and Play data-safety answers derived from `DATA_USE`, an explicit manifest in `packages/core/src/branding.ts`. Update that manifest when a feature starts collecting new data.

**W-3 Publishing assistant**
- `/dashboard/publish`:
  - A checklist: accounts (Apple $99/yr, Google $25 one-time), keys, listing, submit.
  - Per-store status Draft → Building → In review → Live / Rejected. A rejection shows the store's own words plus fix guidance.
  - Guided key upload, and blocked-submit reasons covering missing assets, missing keys and listing gaps.
- Coach app `Me → Publish`: the status and checklist (read-only).
- Shared-app fallback: built with `TENANT_ID=spotter`, the client app asks for a trainer code (the RPC `tenant_by_code` returns public branding only) and re-themes at runtime. Invite links can carry `?code=`. Me shows a "Trainer · change" row. The web preview serves it at `/shared` (demo codes `MAYA`, `NSB2026`).

**W-4 Leaving**
- "Revoke Spotter's access" (web and coach app) maps to `revoke_spotter_access()`: it deletes the stored keys, cancels queued jobs and writes `audit_log`. Store listings stay with the trainer. Export is owned by the data-portability build.

**DB**
- `20261021060001_publishing.sql`: branding columns and `join_code`, `tenant_by_code`, `store_credentials`, `publish_jobs` plus the `publish_status` view, `listing_kits`, and `revoke_spotter_access`.
- Tests: `tests/60_publishing.test.sql` (19 checks).

## Mocked in this build
- There's no sign-in, so the web dashboard and coach app edit the demo tenant in browser storage (`spotter.brand.<slug>`, `spotter.publish.<slug>`). On the web preview the client app reads the saved brand from the same origin.
- In the demo, a key upload is validated and fingerprinted in the browser, and the secret is not kept. Submitting only sets the status, and a "Demo: show state" control shows each status.
- Native (iOS/Android) builds don't share brand edits between the coach and client apps until Supabase is wired in.

## Still needs real accounts and services
- Apple Developer and Google Play accounts per trainer; an App Store Connect API key and a Play service account.
- An `EXPO_TOKEN` and an EAS project per tenant (`eas_project_id`). Run `eas init` once per tenant, or create projects with the EAS API.
- A `CREDENTIALS_KEK` secret on the functions and on the worker.
- A scheduled runner for `tenant-build.mjs --worker`.
- Moving from In review to Live or Rejected needs App Store Connect and Play status polling or webhooks; this isn't built.
- The client app on the web preview shares browser storage between `/` and `/shared`, so onboarding progress carries over between them in the demo.
