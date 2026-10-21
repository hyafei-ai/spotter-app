# Programs, exercise library and assignment

Spec: K-4 (program builder), K-3 actions (assign/adjust program, edit today's session, set progression rules), and the client app reading its assigned program (C-3, C-4).

## What's built

**Model (`packages/core/src/programs.ts`, `library.ts`)**
- Program → weeks → days (scheduled on a weekday) → exercises → sets. A set's prescription is reps or a range, AMRAP, time or distance, with load as absolute kg, % of 1RM, RPE or bodyweight, an optional target RPE, plus rest, tempo, a coaching cue and approved alternatives per exercise.
- Editing helpers: copy a week, copy a day into another week, reorder, join or split supersets, apply one set to all, progress loads across weeks, and validation in plain words.
- Assignment with version snapshots. Saving a live program applies from the client's next session that hasn't started; earlier dates keep the version they had. One-day overrides cover "Edit today's session".
- % of 1RM loads are worked out from each client's best real logged set (Epley e1RM) and rounded to the plate increment. With no history, the client picks the weight.
- Exercise library: 40 built-in starter exercises (names, metrics, tags and equipment; no videos), plus the coach's own exercises. Search by word start, filter by tag or equipment. Bulk demo-video matching by file name, which leaves ties and unclear names for the coach.
- Tests: `packages/core/test/programs.test.ts` (23 tests).

**Coach app**
- **Programs tab:** programs grouped as Drafts, In use and Ready to assign; AI drafts are tagged. A second segment holds the exercise library with search, tag chips, "Add your own" and "Match videos".
- **Program editor** (`/program/[id]`): name, status, weeks with move, copy and delete, days by weekday, add a day, add an empty week or copy the last one. Drafts get "Save draft" and "Publish"; live programs get "Save changes", with a banner explaining it applies from the next session. Validation problems are listed before publishing. Duplicate and delete are available, and delete is blocked while the program is assigned.
- **Day editor:** name, weekday (days already used are disabled), client note, exercises with up/down, superset link/split and remove, add from the library, copy to another week, and delete the day.
- **Exercise editor:** load type, set table (reps range, AMRAP, weight / % 1RM / RPE, seconds or metres), add a set or use set 1 for all, rest, tempo, cue, "Ask for RPE", approved alternatives, and a progression rule (increment, max RPE, sessions in a row) with a plain-language summary.
- **Assign:** pick clients (each shown with their current program), and a start date of Today, Next Monday or In 2 weeks. An existing program is replaced; history stays.
- **Client detail section:** current program, week N of M, today's session, "Change program", and "Edit today's session" (or "Add a session today" on a rest day). Edits change that date only and can be reverted.
- **Library screens:** add your own exercise, exercise detail (built-ins read-only apart from the demo video), and bulk video matching.

**Client app**
- Today and the logger read the assignment for today (`apps/client/src/programs.ts`). New states: program not started yet, finished, and paused. Overrides show up as the day's session.
- "Last time" and progression history now match by exercise rather than program-exercise row, so they carry across weeks and programs.
- Finished sessions keep the plan they were run against, so History shows the right targets after the program changes.

**Web dashboard** (`/dashboard/programs`)
- A table editor for a whole week: sets, reps (or seconds/metres), load type and value, RPE, rest, tempo and note.
- Add a session or an exercise, copy a week, and "Progress loads across weeks" (builds later weeks from the chosen week).
- Save draft, Publish, or Save changes, with validation.

**Database** (`20261021010001_programs.sql`)
- `programs.version` and `programs.source`; `program_days.weekday` with one session per weekday per week.
- `assignment_versions` (snapshots) and `session_overrides`. Their tenant and client always come from the assignment.
- `program_snapshot()` builds JSON in the core Program shape.
- `publish_program(program, effective_from)` bumps the version and snapshots it to active assignments from that date.
- A trigger gives each new assignment its first snapshot; `assigned_day()` returns what's in force on a date.
- RLS: coaches write for clients they can see, and clients read only their own.
- Tests: `packages/db/supabase/tests/10_programs.test.sql` (19 checks).

## Mocked

- Coach and client share programs through `localStorage` key `spotter.programs.<tenant>` on the web preview (same origin), and the library through `spotter.programs.<tenant>.library`. On native, the coach app keeps them in memory and the client app uses its SQLite key-value store. Real builds use the tables above and `GET /sync/pull`.
- The seeded "Strength Base" program and "Beginner Full Body" template (`packages/core/src/demo/programs.ts`) are sample data, laid out so Jordan has Lower A today.
- "Has the client started today's session?" (which decides whether an edit starts today or tomorrow) is read from the client app's saved state on the same origin. Real builds ask the server.
- Demo videos store the file name only.
- The web dashboard keeps its own copy in that browser's `localStorage`.

## Needs real services

- Supabase: write program edits to the program tables and call `publish_program()` on save; have the client cache `assigned_day()` / `assignment_versions` through `/sync/pull`.
- Video upload for demo videos: resumable upload to Storage, then a Mux asset (owned by the form-check/video work).
