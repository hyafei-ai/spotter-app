# Spotter — Jobs to be done

Adapted from the *Station Zero — Jobs To Be Done* frame (reviewed 2026-07-15) to Spotter's roles:
athlete = **client**, coach = **coach / assistant coach**, gym owner = **tenant owner**.

Every new feature must cite which job it serves and pass that job's acceptance test. If it serves none,
re-frame it or drop it. If a feature keeps failing but can't be dropped, update this doc first.

## Client (athlete)

**Job:** "Help me train around my body's variance and give my coach a shared read so we're not guessing week to week."

Acceptance test: does it help the client (1) train around body variance (short sleep, cycle phase, load spike), or
(2) share their read with their coach without extra effort? If no to both, don't ship it.

Avoid: "log my workouts", "predict my PRs", "track my HRV", "AI coach", "daily fitness journal".

## Coach

**Job:** "Help me remember what's going on with each of my athletes so I don't drop the ball."

Acceptance test: does it help the coach (1) remember something they'd otherwise forget about a specific athlete, or
(2) prep for a real conversation (class, 1:1, DM) in under 30 seconds? If no to both, don't ship it.

Avoid: churn or retention language to coaches, "analytics dashboard", "AI coaching assistant", "automate your coaching".

## Owner

**Job:** "Save me preventable member churn by showing my coaches who to intervene with, before it's too late."

Acceptance test: does it help the owner (1) predict and prevent a specific member cancellation, or (2) show that a
member was kept, with a dollar amount? If no to both, don't ship it.

Avoid: "analytics for your gym", "business intelligence", "member engagement platform", "AI insights".

## Features built against this frame (Oct 2026)

| Feature | Job | Test it passes |
|---|---|---|
| Daily check (30 s) and **Today's read** on the client's Today | Client | Trains around variance: sleep, soreness, energy, stress, load, fuelling, optional cycle phase |
| **Lighter option** on easy days (coach-set rule: lighter loads, fewer sets, or the coach's recovery session) | Client | Trains around variance, inside the coach's plan |
| Read **shared with the coach by default**; cycle phase private unless the client shares it | Client | Shares the read without extra effort |
| Per-client **memory** timeline (sleep streaks, load spikes, what they last said, PRs, notes) | Coach | Remembers what they'd forget |
| **30-second prep** card on client detail; **follow-ups** that resurface in Clients | Coach | Preps a conversation in under 30 s |
| Body-variance triage reasons ("Short sleep 3 nights") in coach language | Coach | Remembers; never says "churn" |
| Owner-only **members to talk to** with plain reasons and yearly value at stake | Owner | Predicts a specific cancellation |
| **Hand to a coach**: shows up in that coach's Clients list as a check-in | Owner | Prevents it through the coach |
| **Kept after a check-in**: still active 60 days later, with the dollar value | Owner | Shows a member was kept, with a dollar amount |

Signals and rules: `packages/core/src/signals.ts` (rule-based and explainable; no scores shown to clients, no
medical claims). "Kept" means still active 60 days after the coach stepped in. It's a correlation shown to the
owner as such, not proof that the check-in caused it.

## Physiology layer: needs attention and MRR at risk (Oct 2026)

Same three jobs, same tests ([`docs/physiology.md`](physiology.md), [`docs/features/at-risk.md`](features/at-risk.md)).

| Feature | Job | Test it passes |
|---|---|---|
| Clients → **Needs attention**: who could use a check-in, with reasons from what each athlete shared ("Running tired 5 of the last 7 days", "Fuel check flagged") | Coach | Remembers what they'd otherwise miss; never says "churn" or "at risk" |
| Client detail → **Between sessions**: shared reads, fuel check, pain, progress, cycle, plus what to ask | Coach | Preps a conversation in under 30 s |
| **Retention**: live MRR at risk per currency, 12-week trend, MRR kept after a check-in | Owner | Predicts cancellations with money at stake; shows members kept, with a dollar amount |

The owner never sees health data. Sleep, cycle, fuelling and pain stay between the athlete and their coach, and only
when the athlete shares them. On the owner's side, any of it shows as one line: "Their coach has flagged something
worth a check-in".
