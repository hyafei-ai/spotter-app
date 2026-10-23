# Mobility capture: "Did mobility?" on Today

Internal working note (Oct 2026), app-ux-improvement pass for the one UI change in the patterns build. The job and
flow are design hypotheses, not research findings: nothing here has been tested with clients yet.

## Job

*When I've just done some stretching, yoga or the routine my coach set, I want to mark it in a second, so my coach
knows and it counts toward what works for me, without opening another screen.*

Why it matters to the product: mobility feeds the personal pattern "less sore in weeks with 2+ mobility sessions"
(`docs/features/patterns.md`). The pattern is only as good as the logging, so the log has to be nearly free.

## Where it lives, and why

On **Today**, in two views only:

| View | Shown | Why |
|---|---|---|
| Rest day | Yes, under "Optional", defaulting to the coach's suggested routine (MOCK: "Hip and ankle mobility", 10 min) | Rest days are when mobility happens and the client already opens Today to see the plan. |
| Session done | Yes, under the read | Cool-down stretching happens right after a session, and Today is where the client lands. |
| Session planned / in progress | No | Today has one primary action ("Start …"); a second log would compete with it. |
| No program / paused | No | Nothing to fit it into yet. |

Not a new tab, not a new screen, not inside the daily check: the check is a morning task, mobility is often an evening
one. Yoga, Pilates and stretching recorded on the watch arrive through Apple Health / Health Connect without any tap
(`flexibility` and `mind_and_body` were added to the imported activities).

## Flow

1. Today (rest day) → **Mobility** section → "Did mobility today? {Coach} sees it with your sessions."
2. **One tap:** "✓ Log 10 min · Hip and ankle mobility" logs the suggestion. On a done day, without a suggestion, the
   button says "Log 10 min · Stretching".
3. Optional: **Something else** opens minutes (5, 10, 15, 20, 30, 45) and type (Stretch, Routine, Yoga, Pilates,
   Other), then "Log {n} min · {type}", or Cancel.
4. Logged: "Done today: 10 min · Hip and ankle mobility" with **Undo**, and a quiet "Log more" for a second session.

Saved on the phone first and queued as `mobility.log` / `mobility.delete` (offline-safe, like pain logs). Undo sends
`mobility.delete`.

## States

| State | What the client sees |
|---|---|
| Nothing logged today | Prompt line, the one-tap button, "Something else" |
| Choosing | Minutes and type controls, the log button naming exactly what will be saved, Cancel |
| Saving | Button spinner (the write is local, so this is brief) |
| Logged | "Done today: …" + Undo per log; "Log more" |
| Offline | Same as online; the sync banner at the top already covers pending changes |
| Imported from the watch | Not shown here (it's in History with the other imported workouts); counts the same in patterns |

## Privacy

Mobility is training data, shared with the coach by default like sessions (the prompt line says so). Only the client's
coach reads it (RLS: `is_coach` + `can_see_client`); it's deleted with the account.

## Review against the screenshots (390 × 844)

Screenshots: `docs/ux/mobility-capture/` (light and dark: default, choosing, logged).

Fixed after looking:
- The prompt line sat tight under the section rule: added top spacing so it reads like the rows around it.
- After logging, a second full-width "Log more" button with a check icon looked like the same action again: now a
  quiet text button, so "Done today" is the clear state.
- "Something else" opened with Stretch selected on a rest day whose suggestion was the coach's routine: the type now
  starts on the suggestion's type.

Still open (small):
- The "Done today" line wraps on long routine names at 390 pt; acceptable, the Undo stays aligned.
- The suggestion is MOCK until programs carry a rest-day mobility routine (`MobilityRoutine` in core).
