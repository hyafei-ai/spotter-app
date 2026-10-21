# Form checks, video pipeline and weekly check-ins

Build phase 4: spec C-5 (client form check), K-5 (coach review), C-7 (check-ins) and the coach-side check-in review.

## What's built

### Client app
- **Send a form check** (`/form-check/new`): from the video button on any exercise in the logger (attaches to the set in progress, or the last logged one), from the Coach tab header, or from a "Requested" row on Today.
  - Record up to 60 s (system camera with a 60 s cap) or pick from the library.
  - Camera and photo permissions are asked at the moment of use. The denied state explains the Settings path, with "Open Settings" and "Pick from library".
  - Clips over 60 s are refused with their actual length ("This video is 1:24…"). The length is checked from the picker and again from the player, because web pickers don't always report it.
  - Preview with transport controls, an optional note, then "Send to coach".
- **Upload**: resumable (tus, 6 MB chunks), with states Waiting → Uploading n% → Paused (offline, or by the user) / Upload failed + Try again → Sent · processing → Sent · waiting for Maya → Maya replied.
  - An upload interrupted by an app kill resumes on the next launch (`afterRestart` in core).
  - The create mutation goes through the offline queue (`formcheck.create`).
- **Reply playback** (`/form-check/[id]`):
  - Drawings (line, angle with degrees, circle) overlay the video around their timestamp, and notes show as captions.
  - A timestamped list seeks the video.
  - The coach's voice-over plays from its own control.
  - Side-by-side compare with the previous video of the same lift, both played in step.
- **Weekly check-in** (`/check-in/[dueDate]`): only the fields the coach turned on.
  - Fields: bodyweight in the tenant unit, measurements in cm, sleep, stress 1–5, how much of the plan was done, and free text.
  - Optional front/side/back photos, private, with a photo-permission denied state.
  - An overdue banner shows when it's late, and a read-only "Check-in sent" view after submitting (says whether the coach has read it).
  - Required fields show inline errors.
- **Today → Due rows**: weekly check-in (due today / n days late), "Form check: <lift>" when the coach asked for one, and "Maya replied: <lift>" until the reply is opened.
- **Reminders**: a local notification is scheduled for the morning the check-in is due (native).

### Coach app
- **Form-check review** (`/form-check/[id]/review`):
  - The drawing tools (Note, Line, Angle, Circle) sit directly above the video, and you tap to place points: 2 for a line or circle, 3 for an angle. Taps are the button alternative to dragging.
  - Frame-step, 0.25× / 0.5× / 1× speed, and a seek bar that is adjustable for VoiceOver and TalkBack.
  - Voice-over recording, with a microphone-denied state.
  - Side-by-side compare, a timestamped list with remove, and an optional summary.
  - "Send feedback" takes the client out of triage. States: video still processing, playback error with Try again, video not on this device.
- **Client detail sections**:
  - Form checks: the latest 5, with "Ask for one", which puts a "Requested" row on the client's Today.
  - Check-ins: the latest 4, with "Not read yet".
- **Check-in review** (`/check-in/[id]`):
  - Values with the change since last week, where both weeks have a number.
  - The client's note and a photo timeline by week.
  - "Mark as read", which takes the client out of triage.
- **Me → Weekly check-in**: choose the fields, measurements, due weekday and reminder hour.

### Shared
- `packages/core`:
  - `formchecks.ts`: duration rule, annotation types, aspect-corrected angle maths, drawing builder, visibility window, upload state machine and labels, compare lookup.
  - `checkins.ts`: template, answers, due/overdue/submitted logic (never "overdue" for a date before the client joined), reminder time, missing fields, deltas.
  - New offline kinds `formcheck.create` and `checkin.submit`, plus media request schemas.
- `packages/ui`:
  - `VideoStage`: expo-video with an SVG annotation layer, fixed 9:16 stage, optional `maxHeight`.
  - `PlaybackControls`: drives one or two players.
  - `AnnotationList` and `VoiceOver`.
  - `useMediaPlayer`, with retry.
  - `mediaStore`: copies media into the documents folder on native; IndexedDB on web.

### Database (`packages/db`)
- `20261021020001_formchecks_checkins.sql`:
  - Tables: `videos` (60 s cap for form checks), `form_checks`, `form_check_annotations`, `check_in_templates`, `check_ins` (one per client per due date), `progress_photos`.
  - RLS: the client and the coaches who can see that client only. Clients upload form-check videos only.
  - Guard triggers: only coaches reply or mark read; coaches can't edit answers; a check-in the coach has read can't be changed.
  - Triage triggers for `form_check_waiting` and `check_in_submitted`.
  - `sync_handle_formchecks` and `sync_handle_checkins`.
- `20261021020002_media_storage.sql`: private `form-checks` and `progress-photos` buckets, with folder-based policies (`<tenant>/<client>/…`). This runs on hosted Supabase only and is skipped by the local harness.
- Edge Functions:
  - `videos-upload-url`: start an upload; on complete, create the Mux asset from a signed URL.
  - `webhooks-mux`: verifies `Mux-Signature`; marks ready or errored.
  - `media-signed-url`: RLS-checked; Mux signed playback token or Storage signed URL, ≤ 1 h.
  - `checkins-reminders`: hourly; in each client's time zone; one push per due date via `/notify`.
- Tests:
  - `tests/20_formchecks_checkins.test.sql`: 23 checks.
  - `functions/_shared/mux.test.ts`: signature checks, run with Node.

## What's mocked (demo build, no server)
- **Uploads**: `MockUploader` advances progress on a timer and pauses while "Simulate no signal" is on. Real tus is used when `EXPO_PUBLIC_SUPABASE_URL` is set.
- **Sharing between apps**: on the web preview, form checks, coach replies, requests, check-ins, reviews and the template go through `localStorage` (`spotter.formchecks.*`, `spotter.checkins.*`). Videos, photos and voice-overs are stored in IndexedDB, so the coach app on the same origin can play what the client sent. On native, each app keeps its own copy.
- **Seed data**:
  - The video is a labelled sample clip ("Sample clip (demo)", an animated bar path generated by `scripts/make-sample-clip.sh`), not a person.
  - Seeded form checks: one replied a week ago, with sample coach notes, and one waiting.
  - Two check-ins for Mei Tanaka, numbers only; no photos are invented.
- **Recording on web**: not possible in the browser preview, so the button is disabled with a reason and "Pick from library" works.

## Needs real credentials or services
- **Supabase**: project URL and keys, and `supabase db push` (including the storage migration).
- **Upload auth**: the auth layer must register the user's JWT with `setUploadAuth` (`apps/client/src/formchecks/uploader.ts`).
- **Mux**: `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET`, a webhook pointing at `webhooks-mux` with `MUX_WEBHOOK_SECRET`, and a signing key (`MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE`) for signed playback.
- **Reminders**: a schedule that calls `checkins-reminders` hourly with `CRON_SECRET`, and the `/notify` function from the push work.
- **Coach app writes**: the coach app's reply, request, review and template writes need wiring to Supabase (`form_check_annotations`, `form_checks.status`, `check_ins.coach_reviewed_at`, `check_in_templates`). The demo store is the seam, in `apps/coach/src/media/store.ts`.
- **True background upload**: needs a native background upload session (dev build). Today the JS upload pauses while the app is suspended and resumes from the server's offset on return.
