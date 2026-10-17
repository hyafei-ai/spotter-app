# Spotter — UX validation pass

This is a validation pass on the art direction in `art-direction.md`, not an audit of a live product. The personas and walkthroughs below are **design hypotheses**, not findings from user research. They should be checked with the 3–5 pilot trainers and their clients.

## 1. Personas (behavioural)

| Persona | Goal | Context | Abandons when |
|---|---|---|---|
| **The in-gym client** (primary) | Do the prescribed session, log it, have the coach see it | One hand, 60–180 s rests, patchy signal, gloves or chalk | Logging takes longer than the rest; a logged set disappears; the app asks questions before the workout |
| **The remote solo coach** (primary) | Keep 30–60 clients feeling seen | Between in-person sessions, 2–5 min windows | Needs a laptop to do something small; can't tell who needs attention |
| **The assistant coach** (secondary) | Handle assigned clients without touching billing | Same as the coach, with fewer permissions | Sees controls they can't use |
| **Program buyer** (secondary, later) | Follow a bought program alone | Like the client, but with no coach thread | Coach-only UI shows up empty |

## 2. Jobs to be done

- Client, functional: "When I finish a set, I want to record it without thinking, so I can rest."
- Client, emotional: "When I train alone, I want to feel my coach is with me, so I stick with it."
- Coach, functional: "When I open the app, I want the next person who needs me at the top, with the reason."
- Coach, emotional: "When the AI drafts something, I want to know nothing goes out under my name without me."

## 3. Critical tasks (ranked)

| # | User | Task | Frequency | Cost of failure | Type |
|---|---|---|---|---|---|
| 1 | Client | Log a set | 15–30× a session | Lost data destroys trust | Primary |
| 2 | Client | Start today's session | Daily | Wrong session wastes a day | Primary |
| 3 | Coach | Clear "needs you" | Daily | A client churns from silence | Primary |
| 4 | Client | Finish onboarding to first set | Once | Never comes back | Primary |
| 5 | Client | Recover after the OS kills the app mid-session | Weekly | Re-entering sets, or losing them | Exception |
| 6 | Coach | Review and reply to a form check | Several times a week | Delayed feedback | Secondary |

## 4. Flagship journey: first open to first set (goal ≤ 3 min)

| Stage | User question | Designed response | Risk found |
|---|---|---|---|
| Invite link | "Is this really my coach?" | Welcome shows the coach's monogram/photo, name and their own message | — |
| Intake | "How long is this going to take?" | **Fix C1:** "Step 1 of 2 · about 2 min" plus short defaults | Spec default intake (goals, history, equipment, injuries, PAR-Q) could take 5+ min |
| PAR-Q | "Will a 'yes' lock me out?" | Plain message: "Your coach will see this. If you haven't, check with a doctor before training hard." The app is not blocked. | — |
| Waiver | "Do I need signal?" | **Fix H3:** signature saved on the phone and uploaded later; the workout is not blocked | The spec lists an offline state but not whether it blocks |
| Notification ask | "Why?" | Reason line first ("so you hear when Maya replies"), then the system prompt | — |
| First set | "What do I press?" | **Fix C2:** entry fields prefilled with the target, so "Log set" is one tap | Empty steppers mean 4+ taps per set |

## 5. Cognitive walkthrough: logger

1. *Will the client know which set is next?* The next unlogged row is highlighted with the brand left rule, and earlier rows show strikes. ✔
2. *Can they log a set that's different from the target?* Yes, with the steppers on that row. The "Previous" column shows last session's real numbers. ✔
3. *Mis-tapped "Log set"?* The spec has no undo. **Fix H1:** a toast says "Set 3 logged · Undo" for 5 s, and tapping a logged row reopens it for editing. Both are a new mutation with the same key, so the conflict rule (last write from the same client wins) still holds.
4. *Rest timer covers the next set?* **Fix H2:** the timer is a slim bar above the action button with "Skip rest". It never blocks logging.
5. *Offline?* A quiet banner says "Saved on phone, will sync", with no modal. If sync fails: "2 sets haven't synced yet · Retry" plus a warning haptic. ✔

## 6. Heuristic evaluation (selected)

| Heuristic | Issue | Sev. | Fix |
|---|---|---|---|
| Visibility of status | The client can't tell whether the coach has seen a session | 2 | Medium: show "Seen by Maya" on History rows (follow-up) |
| Error prevention | "Finish session" with unlogged sets | 3 | **Fix H4:** finish screen lists "2 sets not logged" with "Go back" |
| User control | Coach "Mark handled" swipe can't be undone | 3 | **Fix H5:** Undo toast on the triage list |
| Recognition vs recall | Load in kg vs lb when a client travels | 2 | Unit shown on every number column header |
| Consistency | Some screens say "Submit" | 2 | Microcopy rule enforced: verbs say what happens |
| Aesthetic/minimal | Due items as cards versus rows | 1 | Rows with a tag ("Due today"); cards only for tappable groups |

## 7. Information architecture

The tabs (Today · History · Coach · Me) hold up. Nutrition and check-ins are reached from Today's due list, which matches where they come up (things due today). **Medium:** when the Nutrition module is on, clients who log food several times a day will want a faster entry point. Revisit in phase 6, with an app shortcut or a "Log food" row pinned on Today.

The coach tabs hold up. **Fix M1:** assistants should not see Grow or the billing rows. Hide them rather than disable them.

## 8. Edge cases & failure states

| Trigger | What the user sees | Recovery |
|---|---|---|
| OS kills the app mid-session | On reopen, Today shows "Lower A in progress · 6 of 18 sets" with "Resume session" | Logger reopens at the next unlogged set; the queue keeps any unsynced sets |
| Server rejects a mutation (e.g. session deleted by the coach) | Banner: "1 set couldn't sync: this session was removed by your coach" | Set kept locally in "Unsynced" history; never silently dropped |
| Duplicate tap on "Log set" | Nothing extra; the mutation is idempotent by `client_mutation_id` and keyed by set index | — |
| Coach edits the program while the client is mid-session | The current session is unchanged; edits apply to future sessions (spec rule) | — |
| Invite expired | "This invite has expired. Ask Maya for a new link." | "Email Maya" button (mailto: support email) |
| No program assigned | Today: "Maya is building your program. You'll get a notification when it's ready." | "Message Maya" |
| First session for an exercise | No PR shown, because there's no earlier set to beat | — |
| Signature empty | "Sign waiver" disabled, with a reason underneath ("Type your name and sign to continue") | — |

## 9. Consolidated findings

### A. Structural UX

| ID | Priority | Change | Status |
|---|---|---|---|
| C1 | Critical | Default intake trimmed to required fields; extended sections marked "optional, finish later"; time estimate shown | Applied |
| C2 | Critical | Logger entry fields prefilled with the target (or suggested load), making "Log set" one tap | Applied |
| H1 | High | Undo toast plus editable logged rows | Applied |
| H2 | High | Rest timer never blocks logging; "Skip rest" | Applied |
| H3 | High | Waiver can be signed offline and uploaded later; the first workout is not blocked | Applied (legal check: IP is recorded at upload time. **CLIENT INPUT REQUIRED**: confirm with counsel) |
| H4 | High | Finish warns about unlogged sets | Applied |
| H5 | High | Undo for coach "Mark handled" | Applied |
| H6 | High | Resume-in-progress state on Today | Applied |
| M1 | Medium | Hide (not disable) owner-only tabs for assistants | Follow-up (phase 9, team) |
| M2 | Medium | "Seen by coach" on History | Follow-up |
| M3 | Medium | Faster nutrition entry point | Follow-up (phase 6) |

### B. Visual/UI

| ID | Priority | Change | Status |
|---|---|---|---|
| V1 | High | At the largest font scale, the set row stacks target/previous above the steppers instead of truncating | Applied |
| V2 | Medium | Unit shown in column headers | Applied |
| V3 | Low | Tag style for due items instead of cards | Applied |
