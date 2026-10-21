# Daily check and Today's read (client job)

Serves the client job in `docs/jtbd.md`: *"Help me train around my body's variance and give my coach a shared read so we're not guessing week to week."* Each part below names which half of the acceptance test it passes: **(1) trains around variance** or **(2) shares the read without extra effort**.

All rules come from `packages/core/src/signals.ts` (`dailyRead`, `sharedRead`, `sessionLoad`, `loadTrend`, `fuelStatus`, `LighterRule`, `applyLighter`). Nothing here re-implements a threshold.

## What's built

**Client: the daily check** (`/check-today`), parts (1) and (2)
- Reached from a card at the top of Today, above the coach note, while today's check isn't done. "Skip today" hides the card until tomorrow.
- Sleep last night:
  - prefilled from the health app when it's connected (`HealthRow`'s status)
  - otherwise an "Add last night's sleep" button, so the app never invents a number
  - then a 0.5 h stepper
- Energy, soreness and stress: 1–5 segmented controls, with words at both ends ("Drained … Full of energy").
- Optional note (300 characters).
- Cycle phase, only once the client turns on "Track your cycle (optional, private)" in Me. It sits behind a disclosure with the same label. "Share cycle phase with {coach}" is off every time.
- "Share today's read with {coach}" is on by default (Me can change the default), and is shown on the screen with what the coach will and won't see.
- A live preview of the read, labelled "A read, not a diagnosis."
- Offline first:
  - saved on the phone straight away
  - queued as `daily_check.submit`, carrying the coach-visible projection (`sharedRead`)
  - editing later the same day updates the day; the newest edit wins
- States:
  - loading (skeleton)
  - offline (SyncBanner)
  - save error (banner)
  - already done today ("Update today's check")

**Client: Today's read** (Today, above the coach note), part (1)
- Shows the tone in words ("Steady", "Keep an eye on it", "Easier day"), the headline and the factors in plain words. There are no scores, rings or colour-only meaning.
- Inputs:
  - load from finished sessions (minutes × feel → `sessionLoad` → `loadTrend`)
  - fuelling from logged kcal against the target, only when nutrition is on and in macros mode
- Caption: "Shared with Maya", "Kept private", or "From the last few nights. Check in to add today."
- When `suggestLighter` is true, the session view also offers:
  - "Easier version: {describeLighter(rule)}". This uses the coach's per-client rule (default 10% lighter, 1 fewer set), runs the logger on `applyLighter(plan)`, and turns off load-jump suggestions for that session.
  - "Do {coach}'s recovery session instead", only if the coach wrote a program day titled "recovery". The option is coach-owned only: no third-party content.
  - The planned session stays below. Nothing is swapped automatically.
- The chosen version is stored on the session (`variant`) and queued as `session.variant`. History tags it "Easier version" or "Recovery".
- Rest-day and done views show the read without options.

**Client: Me → Daily check** (`/settings/daily-check`), part (2)
- Settings:
  - morning reminder on or off, with a time; a local daily notification on native
  - default sharing
  - cycle tracking
- A plain list of exactly what the coach sees and doesn't see.

**Coach: client detail → Today's read** (`ReadSection`), part (2)
- Read only:
  - the shared read and when it was submitted
  - or "Jordan kept today's read private. Checked in at 7:10 AM."
  - or "No check-in yet today", with the last one
- The last three sessions the client did as the easier or recovery version.
- The "Easier version Jordan can pick" control: lighter loads 0–20% and 0–2 fewer sets. It's the client's `LighterRule`.

**Database**: `20261022010001_daily_checks.sql`
- `daily_checks` is client-owned. RLS covers the client's own rows only, with no coach policy. Constraints:
  - one row per day
  - a private day can't store a shared read
- `shared_reads_for_coach(client)` is security definer and checks `is_coach` + `can_see_client`. It returns:
  - the date, the time and whether the day was shared
  - the shared read, with cycle-phase factors stripped unless that day's `share_cycle` is on
  - `cycle_phase` only when shared
- `sessions.session_variant` takes `'planned' | 'lighter' | 'recovery'`, and coaches see it through the existing sessions policy.
- `sync_handle_daily` handles `daily_check.submit` (upsert; an older edit never overwrites a newer one) and `session.variant` (own sessions only).
- Tests: `tests/80_daily_checks.test.sql`. They check that:
  - the coach can't select the table
  - the coach can't see a private read or an unshared cycle phase, not even inside the factors
  - another tenant sees nothing
  - another client can't mark someone's session

## Mocks
- `packages/core/src/demo/daily.ts`: 14 days of MOCK checks for Jordan, ending in two short nights, so the first open reads "Keep an eye on it".
- The demo apps pass reads, variants and the lighter rule through `readShared`/`writeShared` under `spotter.reads.<tenant>` and `spotter.lighter.<tenant>`, standing in for the RPC and a coach-settings table.
- Before the client app has been opened, the coach sees reads derived from the same sample checks.

## Gaps
- The lighter rule has no table yet. Real builds need a coach-owned `client_lighter_rules` row that is pulled to the client.
- The demo program has no recovery day, so the recovery option only appears once a coach adds a day titled "Recovery".
- Reminder notifications are native only. The web build relies on the Today card.
- The client sends the shared read it computed. The RPC strips cycle factors server-side, but other factor text is trusted as sent.
