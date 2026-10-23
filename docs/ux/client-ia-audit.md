# Client app: information architecture audit (Oct 2026)

Method: app-ux-improvement (phases 6–10, 14–16). Screens reviewed from the 390×844 web build after the physiology
features landed. Personas and walkthroughs are design hypotheses, not research.

## What went wrong
Features were added one at a time, each finding a home in **Me**. Me is now a junk drawer: account items (units,
waiver, privacy, plan, invite) sit between body features (Daily check, Your cycle, Fuel check, Pain, Progress,
Health app). The client's most valuable screens are the least findable.

## Cognitive walkthrough (first-time client)
| Step | What they try | What they may think | Fix |
|---|---|---|---|
| Wants to see how they're doing over time | Opens History | "Progress" is a row above sessions, styled like a session; easy to miss | Progress gets a real home (Train tab header) |
| Wants to understand the fuel flag in the brief | Taps nothing (brief reasons aren't links) | "Where do I see more?" | Every brief reason links to its detail |
| Turns on cycle tracking | Me → Daily check → "Track your cycle" toggle, *or* Me → Your cycle → mode | Two switches for one thing; which one wins? | One place: Your cycle. Daily check settings links there |
| Wants to know what the coach sees | Daily check settings has one list; cycle, fuel, pain each have their own toggle | "Did I share my cycle or not?" | One **Who sees what** screen; each toggle links to it |
| Opens the daily check | "Add last night's sleep" button | The brief already said "from Apple Watch"; why type it? | Prefill sleep from the wearable; show the source |
| Logs food in MyMacros, opens Nutrition | "0 kcal of 2,650" for today | "It didn't sync?" | Show today's Health total with its source, or "MyMacros hasn't written today's food to Apple Health yet" |
| Something hurts | Me → Pain & injuries | "Log anything that hurts from the daily check": no button to log here | Primary action on the pain screen: "Log pain" |

## Heuristic issues
| # | Heuristic | Issue | Sev (0–4) | Fix |
|---|---|---|---|---|
| H1 | Recognition over recall | Body features buried in Me with account settings | 4 | New **Body** tab |
| H2 | Consistency | Two cycle switches; four sharing switches in four places | 3 | Single owners: Your cycle; Who sees what |
| H3 | Visibility of system status | Health data shown in the brief but not in the check-in or nutrition | 3 | Prefill + source labels everywhere |
| H4 | Match with real world | "Fuel check", "energy availability", "kcal/kg FFM" in the first line | 2 | Lead with plain words; numbers one tap deeper |
| H5 | Minimalism | Brief card is a wall of text (why + todo + calibration + caption + two options) | 3 | Feel line big; reasons as tappable chips; one recommended action as the button |
| H6 | User control | Brief reasons aren't tappable | 2 | Each opens its detail |
| H7 | Aesthetic | Screens are clean but flat: every section is grey caps + text rows | 2 | Data drawn, not described: sparklines for sleep/HRV, phase ring, bars for weekly training |

## Proposed IA
Tabs: **Today** · **Train** · **Body** · **{Coach}** · **Me**

- **Today**: the brief (feel line, 3 reason chips, one recommended action), today's session, due items. Nothing else.
- **Train**: this week's program, history (logged and imported workouts in one list), **Progress** at the top
  (wins, trends, consistency), mobility.
- **Body**: everything about the body over time, one card per area, each a small chart plus one plain line:
  recovery (sleep, HRV, resting HR vs own baseline), cycle (phase ring + calibration line; hidden if not tracking),
  fuel (this week vs need), pain (active niggles), mobility minutes. Each card opens its current detail screen.
  Header link: **Who sees what**.
- **{Coach}**: the thread (unchanged).
- **Me**: account only: profile, plan and billing, health connections, notifications, privacy, waiver, invite.

Removed or merged: "Track your cycle" toggle in Daily check settings (moved to Your cycle); per-screen sharing
explanations (one Who sees what screen, linked from each toggle); "Progress" row in History (moved to the Train header).

## Screen specs (new or changed)
**Today**
- Purpose: decide how to train today.
- Primary action: the session button, labelled with the recommended version ("Start Lower A, easier version").
- Secondary actions: switch version; check in.
- Deferred: the full reasons (chips open detail).
- States:
  - not checked in: brief from overnight data, plus "Add how you feel";
  - no data: check-in card only;
  - rest day: brief and recovery tip.

**Body**
- Purpose: see how the body is responding.
- Primary action: none (a reading screen); each card is tappable.
- Empty states:
  - per card: "Connect Apple Health to see sleep and recovery";
  - cycle card hidden unless the client is tracking;
  - fuel card hidden when nutrition is off.

**Who sees what**
- One list: each data type, with "{Coach} sees" or "Only you", and a toggle.
- Also explains what the coach never sees: period dates, food logs, raw heart data.

## Visual direction for "pop"
Keep `docs/design/art-direction.md`, but push it:
- the feel line as the screen's display type, with the chalk-strike under the key word;
- data drawn as small, honest charts: 14-night sleep bars with the client's own baseline line, an HRV sparkline
  with a baseline band, the cycle as a ring with today marked, weekly training as stacked bars (logged vs imported);
- domain colours from tokens, never colour-only meaning;
- generous spacing, fewer grey caps headers.

## Status
Built (Oct 2026, branch feat/client-experience). The before/after record, screenshots, timed walkthrough and
scorecard are in `docs/ux/client-experience.md`.
