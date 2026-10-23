# Spotter — Jobs to be done

Adapted from the *Station Zero — Jobs To Be Done* frame (reviewed 2026-07-15) to Spotter's two roles:
athlete = **client**, coach = **coach**. The coach owns their own personal-training or coaching business (the
tenant "owner" role in the database is that coach). There is no separate gym owner.

A coach who grows a team can add **assistant coaches** (optional, `apps/coach/app/team`). A solo coach is the
default and the main case; the team rules below only kick in when there's more than one coach.

Every new feature must cite which job it serves and pass that job's acceptance test. If it serves none,
re-frame it or drop it. If a feature keeps failing but can't be dropped, update this doc first.

## Client (athlete)

**Job:** "Help me train around my body's variance and give my coach a shared read so we're not guessing week to week."

Acceptance test: does it help the client (1) train around body variance (short sleep, cycle phase, load spike), or
(2) share their read with their coach without extra effort? If no to both, don't ship it.

Avoid: "log my workouts", "predict my PRs", "track my HRV", "AI coach", "daily fitness journal".

## Coach

The coach has two jobs, both theirs.

### Coaching: remember each client

**Job:** "Help me remember what's going on with each of my clients so I don't drop the ball."

Acceptance test: does it help the coach (1) remember something they'd otherwise forget about a specific client, or
(2) prep for a real conversation (session, 1:1, DM) in under 30 seconds? If no to both, don't ship it.

Avoid: churn or retention language in the coaching lists, "analytics dashboard", "AI coaching assistant", "automate
your coaching".

### Business: keep clients and income

**Job:** "Help me keep my clients, and my income, by showing me who to check in with before they drift away."

Acceptance test: does it help the coach (1) spot and act on a specific client who might leave, with the reason and,
for their own business, the money at stake, or (2) show that a client stayed after a check-in, with a dollar amount?
If no to both, don't ship it.

Avoid: "analytics for your business", "business intelligence", "client engagement platform", "AI insights". Money
is shown only on the business view and, subtly, as a plan value on the coach's own list; never to assistant coaches.

## Features built against this frame (Oct 2026)

| Feature | Job | Test it passes |
|---|---|---|
| Daily check (30 s) and **Today's read** on the client's Today | Client | Trains around variance: sleep, soreness, energy, stress, load, fuelling, optional cycle phase |
| **Lighter option** on easy days (coach-set rule: lighter loads, fewer sets, or the coach's recovery session) | Client | Trains around variance, inside the coach's plan |
| Read **shared with the coach by default**; cycle phase private unless the client shares it | Client | Shares the read without extra effort |
| Per-client **memory** timeline (sleep streaks, load spikes, what they last said, PRs, notes) | Coach: coaching | Remembers what they'd forget |
| **30-second prep** card on client detail; **follow-ups** that resurface in Clients | Coach: coaching | Preps a conversation in under 30 s |
| Body-variance triage reasons ("Short sleep 3 nights") in coach language | Coach: coaching | Remembers; never says "churn" |
| Clients → **Check in**: the one "who to check in with" list, with plain reasons (and the plan value, for the coach who owns the business) | Coach: business | (1) spots a specific client who might leave, with the reason and money |
| Client detail → **Check in** card: reasons, what to ask, **I checked in** (message, call, session, other) | Coach: business | (1) acts on it in under 30 s |
| **Kept after a check-in**: still active 60 days later, with the dollar value, on Me → Your business → Keeping clients | Coach: business | (2) shows a client stayed, with a dollar amount |
| Teams only: **Ask {assistant} to check in** for a client an assistant coaches; it shows up in that coach's Clients list | Coach: business | (1) acts through the client's own coach |

Signals and rules: `packages/core/src/signals.ts` (rule-based and explainable; no scores shown to clients, no
medical claims). "Kept" means still active 60 days after the check-in. It's a correlation, shown as such, not proof
that the check-in caused it.

## Physiology layer: needs attention and MRR at risk (Oct 2026)

Same jobs, same tests ([`docs/physiology.md`](physiology.md), [`docs/features/at-risk.md`](features/at-risk.md)).

| Feature | Job | Test it passes |
|---|---|---|
| **Check in** reasons from what each client shared ("Running tired 5 of the last 7 days", "Fuel check flagged") | Coach: coaching | Remembers what they'd otherwise miss; the list says "Needs a check-in soon" / "Worth watching", never "churn" or "at risk" |
| Client detail → **Between sessions**: shared reads, fuel check, pain, progress, cycle, plus what to ask (becomes the Check in card when the client is on the list) | Coach: coaching | Preps a conversation in under 30 s |
| **Keeping clients**: live MRR at risk per currency, 12-week trend, MRR kept after a check-in | Coach: business | Spots clients who might leave with money at stake; shows clients kept, with a dollar amount |

Health detail (sleep, cycle, fuelling, pain) is the client's. Their coach sees each piece only when the client shares
it. In a team, only the client's own coach sees it: the head coach looking at an assistant's client reads one line
instead, "Their coach has flagged something worth a check-in". A solo coach never sees that line.
