# Coach memory, 30-second prep and follow-ups

**Job (docs/jtbd.md, Coach):** "Help me remember what's going on with each of my athletes so I don't drop the ball."
Acceptance test: does it help the coach (1) remember something they'd otherwise forget about a specific athlete, or
(2) prep for a real conversation in under 30 seconds? Every piece below is held to that test, in coach language, with
no churn or retention wording, no scores and no AI.

| Piece | Where | JTBD test it passes |
|---|---|---|
| Memory timeline, grouped by week | `/client/[id]/memory` | (1) remember |
| "Remember" section (top four items) | client detail, `ClientSections` | (1) remember |
| 30-second prep card (≤ 5 lines) | top of client detail; **Prep** in each Clients row's action sheet | (2) prep |
| Follow-ups ("Remind me") | client detail, memory screen, thread header bell | (1) and (2) |
| Triage reasons `follow_up_due`, `sleep_short_streak`, `load_spike` | Clients list | (1) remember |

## What memory remembers

`packages/core/src/memory.ts` → `buildMemory(input)` is a pure function from typed inputs to `MemoryItem { id, kind, date, text, important }`,
newest first. Each item is one plain sentence and a date.

- **Short sleep** and **load spikes** from shared daily reads (`signals.ts` factors `sleep_short`, `load_spike`), plus runs
  of "take it easier" reads. Consecutive days collapse into one item: "Short sleep reported 3 days running (19 Oct–21 Oct)".
- **Lighter or recovery sessions** the athlete chose.
- **Real PRs** only: each session is compared with the ones before it (`detectRecords`), so a first session is never a "best".
- **Missed sessions**, one line per week.
- **Check-in changes**: bodyweight moving 1 kg or more over 3+ weeks; self-rated adherence of "some" or "little".
- **The last thing they said**, flagged as **unanswered** when it's a question with no reply after it.
- **Injury notes**, **form checks waiting**, the coach's **dated private notes** and **open follow-ups**.

Duplicates (the same fact arriving twice) are dropped by id. `groupByWeek` labels weeks "This week", "Last week",
"Week of 28 Sept", and "Coming up" for future follow-ups.

## The prep card

`buildPrep` builds 2 to 5 lines from memory, deterministically, in this order:

1. How the week went: "2 of 3 sessions done this week, 1 of them lighter."
2. Body read trend from shared reads: "Body: 1 easy-day read and 2 to keep an eye on in 7 shared reads, mostly short sleep."
3. The one thing to ask about: a due follow-up, else an unanswered question, else an injury, else a waiting form check,
   else missed sessions or low adherence this week.
4. The last thing they said, and when.
5. Something worth a mention (a real PR this week).

A unit test runs it against growing inputs and asserts it never exceeds `PREP_MAX_LINES` (5).

## Follow-ups

The coach writes what to ask ("Ask about knee") and picks Tomorrow, Monday, In a week or a date. On that day the client
shows up in Clients as **"Follow-up: Ask about knee"**. Marking the row handled completes the follow-up (Undo reopens it);
"Done" on the memory screen does the same from the other side.

## Triage reasons and wording

`TriageReason` gains `follow_up_due` (priority 65), `sleep_short_streak` (45) and `load_spike` (42), with `reasonText`
reading "Follow-up: …", "Short sleep 3 nights running" and "Training load this week is 1.6× their recent average". The
existing `churn_risk` code keeps its name but now reads **"Quiet for a week: worth a check-in"**, and the AI section's
"Churn risk" title is now "Quiet lately". `TriageItem` gains an optional `detail` (mapped from `triage_items.detail.text`).

## Database (`20261022020001_coach_memory.sql`)

- `follow_ups (coach_id, client_id, text, due_on, done_at)` and `coach_notes (coach_id, client_id, body)`. There was no
  private-notes table before (the app kept one note per client on the device), so `coach_notes` is new.
- RLS: readable by the coach who wrote it (while they can still see the client) and by the business owner; writable only
  by its writer; **never** visible to the client. Tested in `tests/81_coach_memory.test.sql`.
- Triggers: a follow-up due today or earlier opens a `follow_up_due` triage item with its text; completing the follow-up
  closes the item; handling the item completes the follow-up.
- Nightly job (service role only; execute is revoked from `authenticated`):

  ```sql
  select public.raise_due_follow_ups(current_date);
  select public.raise_load_spikes(current_date);   -- sRPE × minutes, 7-day vs 28-day, ≥ 1.5×, needs 21 days
  select public.raise_sleep_streaks(current_date); -- under 6.5 h on each of the last 3 days, shared checks only
  ```

  Each returns how many items it opened and never opens a second while one is open.

## States

| Screen | States |
|---|---|
| Prep card | loading (skeleton), error + Try again, offline note, sparse ("No daily reads shared this week.") |
| Remember section | loading, error + Try again, empty ("Nothing to remember yet…") |
| Memory screen | loading, error + Try again, empty, offline banner, removed client |
| Remind me sheet | empty text (button disabled with reason), invalid date, saving, save failed |

## Mocks and integration notes

- **`apps/coach/src/reads.ts` is a stub** of the shared-read contract (`getSharedReads(clientId) → { date, read, submittedAt }[]`)
  with MOCK reads for Jordan (three short nights in a row). The athlete daily-check build replaces it.
- `raise_sleep_streaks` reads `public.daily_checks (client_id, date, sleep_hours, share_with_coach)` when that table exists
  and returns 0 until then; align the column names when the daily-check migration lands.
- MOCK demo data: Jordan's follow-up and two notes, and the question behind Jordan's "unread message"
  ("Squats felt heavy on the last set. Is that normal?"). Demo state lives in `spotter.memory.<tenant>`.
- The demo raises the new triage items client-side (`useMemoryTriage`); connected builds get them from `triage_items`.
