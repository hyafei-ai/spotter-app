# First value: the trainer sees why Spotter matters in the first minute

The bar (product owner, Oct 2026): trainers say "have you heard about this app? It's amazing, so easy, it makes
sense", and they can tell another trainer **what it's for and why** in one sentence. A trainer who logs in sees the
value right away.

## The sentence a trainer repeats
> **"It shows me what actually works for each of my clients."**

The longer version: training, recovery, sleep, food and (when shared) cycle, from whatever they wear, in one place,
so you know what to change before a client stalls or quits.

Every screen we build should make that sentence more true. If a screen doesn't, cut it or move it out of the way.

## Time to value, step by step
| Moment | Target | How |
|---|---|---|
| First login, no clients yet | **10 s** to see what Spotter does | A sample client (MOCK, clearly labelled) is already in the roster, with a full picture and 3 real-looking patterns. The coach's home says "This is what you'll see for every client. Invite your first one." |
| Invite a client | **under 1 min** for the coach | One link or QR code, sent from the coach's phone. No forms for the coach to fill. |
| Client connects Apple Health / Health Connect | **2 min** to the first real insight | Backfill history the health app already holds (workouts, sleep, HRV, resting HR, food, periods if tracking) as far back as allowed, so the coach sees months of a brand-new client on day one, plus the first patterns once there's enough data. The coach gets "Jordan is connected: here's their last 6 months". |
| Every morning after | **30 s** | The coach's Today: who needs them today and exactly why, each with the one thing to do (swap the heavy day; check in; tell them about their win). |

## The coach's home: Today, not a dashboard
Three short groups, most important first, each item one line plus one action:
1. **Act today**: "Jordan: 5 h sleep and HRV well under usual, heavy lower day planned → offer the easier version".
2. **Check in**: "Chris hasn't trained in 9 days".
3. **Celebrate**: "Mei held their squat for 10 weeks, and resting HR is down 4 bpm. Tell them."

No charts on the home. Charts live on each client's page. If nothing needs the coach: "All good today. Here's who's
doing great" (and a win to share).

## Wins people share (the word-of-mouth loop)
A client's win becomes a share card in the **trainer's brand**: "Held my squat strength for 10 weeks at 52 · Coached
by Maya Reyes". Clients post it, and the trainer gets seen. That's value the trainer can feel, and it spreads the app
without ads. The client chooses what to share; health data never goes on a card unless they pick it.

## Plain language, always
- Every number comes with a sentence: "HRV 18% under your usual" plus a one-line "what that means".
- Every term has a tap-to-explain line the first time (HRV, energy availability, cycle phase).
- No setup walls: sensible defaults, and every setting can wait.

## How we check it
For each release, a first-time-trainer walkthrough is timed:
- seconds from login to the first insight;
- taps to invite a client;
- whether the walker can say the sentence above after 60 seconds.

The results are recorded in `docs/ux/` alongside the screen audits.
