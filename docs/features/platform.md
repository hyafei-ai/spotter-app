# Platform: auth, sync, messaging, push, team, portability

Built on branch `feat/platform` (builder G). Covers spec C-1, the realtime parts of C-6, K-1 (swipe and inbox tools), K-8, K-9, the rest of phases 1, 3 and 9, and the non-functional requirements.

Every feature runs in two modes:

- **Demo** (no `EXPO_PUBLIC_SUPABASE_URL`): the web preview and local builds. Data is mock (marked `MOCK` in code) and kept on the device.
- **Connected**: the same screens talk to Supabase.

Nothing needs a code change to switch modes, only env.

## What was built

### Auth and onboarding (C-1)

- **Sign-in methods** (`packages/ui/src/platform/`): magic link with PKCE, Sign in with Apple on iOS (SHA-256 nonce), and Google (native id-token flow, or a redirect on web).
- **Session storage:** SecureStore, chunked under the 2 KB limit; localStorage on web.
- **Expired sessions:** the app remembers the screen you were on, shows "Sign in again", and returns you there afterwards.
- **Demo mode** is used only when Supabase isn't configured.
- **Invites:**
  - Links look like `/join?t=&tenant=&e=&r=`. Coaches can share them as a QR code; `packages/core/src/qr.ts` is a dependency-free encoder, verified by decoding its output with zxing.
  - The welcome screen pre-fills the email from the invite. It also shows a "this invite is for another coach's app" state when the tenant doesn't match.
  - The `invites` Edge Function stores only a sha256 of each token and emails the link.
  - `accept_invite()` creates the membership, the thread, the coach assignment and a "new client" triage item.
- **GDPR consent:** a checkbox on welcome gates "Get started". Consent is recorded through the `consent.record` mutation into `consents`, with `CONSENT_VERSION` set.

### Sync

- **Pull:** the `sync-pull` Edge Function calls the `sync_pull(since)` RPC. The client store (`apps/client/src/platform/pull.ts`) folds the result in. The first pull after each launch is a full pull; later pulls are deltas. Today's plan comes from `nextPlanFromPull` (core, tested).
- **Push:** the transport now sends the real access token. Without one, it throws "Sign in again to sync".
- **New mutation kinds:** `message.attach`, `message.read` and `consent.record`, handled by `sync_handle_platform`.

### Messaging (C-6, K-1)

- **Realtime threads:** live messages, a typing indicator (broadcast), and read receipts ("· Seen", via `mark_thread_read`).
- **Attachments:**
  - Voice notes up to 2 minutes, photos, and links to a workout, form check or program.
  - Uploads go to the `message-media` bucket under `<tenant>/<thread>/…`.
  - An upload that fails offline is queued and retried.
- **Coach inbox:**
  - Saved replies, with three `MOCK` starters in demo.
  - Bulk message to the current filter, through `send_bulk_message`.
  - Live triage over realtime.
- **Swipe actions on triage rows:** swipe right to Reply; swipe left to Snooze or mark Handled. The ⋯ actions sheet stays as the button alternative, and Undo is kept.

### Push notifications

- **Device registration** after permission is granted (`devices` table).
- **`notify` Edge Function:** called with `INTERNAL_FUNCTION_SECRET`. It applies each user's categories and quiet hours (`deliveryDecision` in core: rest timers ignore quiet hours, other categories are held). It disables devices that report `DeviceNotRegistered`. `{flush:true}` sends held items.
- **Notification settings screens** in both apps.

### Team (K-8)

- **Coach app:**
  - Team list; invite an assistant by link or QR.
  - Per-coach revenue split.
  - Assign clients.
  - Hand off a client with a note. History stays intact (`coach_assignments` rows are closed, never deleted; `hand_off_client` writes `audit_log`).
- **Assistant restrictions:** assistants see only their own clients. They don't see the Grow tab, Brand, Client app or Team/Import rows. Billing is reserved to owners by `can_see_billing()`.
- **Web:** `/dashboard/team`.

### Portability (K-9)

- **CSV import** of clients and programs, with a downloadable template, a preview and per-row errors (row numbers match the spreadsheet). The parsers and validators are in core and tested.
- **`export` Edge Function:** builds a zip (CSV and JSON per table, plus the signed waiver PDFs), uploads it to the `exports` bucket and emails a signed link valid for 24 hours.
- **Client Me rows:** "Export my data" and "Delete account". Delete calls `delete_my_account()`, which removes sessions, health answers and devices, blanks message bodies and anonymizes the profile. Signed waivers are kept as a legal record.
- **Web:** `/dashboard/data`.

### Support access

`open_support_session(t, reason, minutes)` gives platform admins read-only access for at most 60 minutes. It requires a reason of at least 10 characters and writes `audit_log`. The `*_support_read` RLS policies check `has_support_access(t)`.

### Observability

- Sentry and PostHog initialise only when their env vars are set. Events carry tenant tags.
- Both are no-ops on web.

### Accessibility pass

Checked with axe-core (WCAG 2.2 AA) on 15 client and coach screens, plus a reflow check at 200% zoom.

Fixed:

- Radios and checkboxes now report checked state.
- The stepper exposes min, max and now values.
- No nested controls: the list row's trailing button and the welcome privacy link were moved outside their parent controls.
- Monograms without a label are decorative.
- The signature pad has a role.

All 15 screens are now clean, with no horizontal scroll at 200%.

### Tests

- **Core:** QR, invites, quiet hours, CSV, splits and pull planning (`packages/core/test/`).
- **SQL:** 34 checks in `packages/db/supabase/tests/70_platform.test.sql`. They cover:
  - invite acceptance, and an assistant's visibility of clients;
  - handoff history and bulk send;
  - support grant expiry and audit;
  - account deletion;
  - `sync_pull` and `sync_handle_platform`.
- **Maestro** (`.maestro/`):
  - `onboarding.yaml`
  - `offline-logging.yaml`
  - `coach-triage.yaml`
  - `form-check.yaml`, a stub for the form-check builder.

  CI only checks that the flows parse (`scripts/check-maestro.mjs`). Run them yourself with `maestro test .maestro/` against a simulator build.

## What is mocked (demo mode)

| Area | Mock | Where |
|---|---|---|
| Team | Owner plus a fictional assistant, Leo Park (60% split); every third demo client assigned to Leo | `apps/coach/src/platform/team.ts` |
| Demo viewer | "View the app as Owner/Assistant" switch, stored in `spotter.demoViewer` | coach Me |
| Saved replies | Three starters | `apps/coach/src/platform/inbox.ts` |
| Invites | Local link with a random token; no email | `apps/coach/src/platform/invite.ts` |
| Import | Programs saved to localStorage `spotter.importedPrograms` | `apps/coach/src/platform/data.ts` |
| Client export | Built in the browser as a zip of local data | `apps/client/src/platform/account.ts` |
| Web dashboard | Coaches and clients | `apps/web/src/platformDemo.ts` |
| Push, realtime, uploads | No-ops; messages stay local | `packages/ui/src/platform/` |

## What needs real credentials or services

| Env var | Used by |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Both apps; switches off demo mode |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `_ANDROID_CLIENT_ID`, `_WEB_CLIENT_ID` | Google sign-in. Also enable Google in Supabase Auth. |
| Apple Services ID and key in Supabase Auth | Sign in with Apple (`usesAppleSignIn` is already set in the app config) |
| `EXPO_PUBLIC_SENTRY_DSN` | Crash reporting |
| `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` | Product analytics |
| EAS `projectId` (app config `extra.eas.projectId`) | Expo push tokens |
| `EXPO_ACCESS_TOKEN` (function secret) | `notify`, if push security is enabled on the Expo project |
| `INTERNAL_FUNCTION_SECRET` | Lets server jobs call `notify` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Invite and export emails. Without them, functions return the link instead. |
| `INVITE_BASE_URL` | Invite link host. Defaults to `https://{slug}.spotter.app`. |

Also needed:

- **Supabase setup:**
  - Add `messages` and `triage_items` to the realtime publication. The migration does this when the publication exists.
  - Create the storage buckets. `20261021070002_platform_storage.sql` creates them when the storage schema is present.
  - Add the auth redirect URLs `<scheme>://auth/callback` and the web `/auth/callback`.
- **A scheduler for held notifications:** call `notify` with `{flush:true}` every 15 minutes, for example with pg_cron or a Supabase scheduled function.

## Notes for merging

- **Billing tables and screens** should gate on `can_see_billing(t)` in SQL and `useRole().isOwner` in the coach app.
- **Owner-only Me rows** added by other builders should check `useRole().isOwner`.
- **`nutrition_targets`** and other new tables are not in `sync_pull` yet. Add them there if the client needs them offline.
- **Program library:** imported programs in demo mode are in localStorage `spotter.importedPrograms`, for the library to read.
- **Dependencies:** `packages/ui/package.json` gained peer dependencies (expo-auth-session, expo-apple-authentication, expo-secure-store, expo-notifications, expo-audio, expo-file-system, expo-sharing, Sentry, PostHog, supabase-js, and others) that the apps already had. `pnpm-lock.yaml` changed as a result. No new packages were added to the tree.
- **Shared UI changes:**
  - `ListRow` now renders `right` outside its button when the row is pressable.
  - `SegmentedControl` and `ChoiceList` emit `aria-checked`.
  - `Stepper` exposes value ranges.
  - `Monogram` without a label is hidden from assistive tech.
