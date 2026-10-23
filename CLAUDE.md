# Spotter: working rules

## Who it's for
Two sides only: the **client** (trainee) and the **coach**, who owns their own personal-training business. There is
no gym owner. Assistant coaches are an optional team feature; a solo coach is the default case.

The coach is the buyer. Every feature must make the coach better at knowing and keeping each client.

**The sentence a trainer repeats:** "It shows me what actually works for each of my clients." First value in the
first minute, no setup: see `docs/ux/first-value.md`. Any trainer style must work (strength, hybrid/Hyrox,
CrossFit, endurance, general fitness), not only weights.

## UX gate for every big change (non-negotiable)
The product owner's last product failed on confusing UX. For any big change (a new screen, a new flow, a new
feature area, or a change to navigation), run the `anthropic-skills:app-ux-improvement` method and record it in
`docs/ux/`:

1. **Before building:** the user's job and the critical task; the current flow vs the proposed flow (what was
   removed, combined, moved, deferred); a screen spec per screen (purpose, one primary action, what's deferred,
   loading / empty / error / success states). Where it belongs in the navigation, and why there.
2. **After building:** screenshots at 390×844 (phone) and 1280 wide (web dashboard) of every new or changed screen,
   in light and dark; a cognitive walkthrough as a first-time user; heuristic issues with severity; a self-critique
   of the 10 worst remaining problems; a 1–5 scorecard. Fix everything Critical/High before calling it done.
3. **Visual quality:** follow `docs/design/art-direction.md` (the chalk-strike signature, type, colour tokens). The
   most important thing on a screen is findable in about three seconds. One primary action per screen. No
   template-looking cards, no decoration standing in for hierarchy.

A change isn't finished until its UX record exists in `docs/ux/` and its screenshots were actually looked at.

## Reusing Station Zero code (hyafei-ai/hybrid-fitness)
The product owner's previous app is a source of proven logic, not of UX. Port logic into `packages/core` with tests
(or re-implement the idea in Spotter's architecture); never copy its screens or navigation. Record what was taken and
why in `docs/ports.md`. Every ported feature still goes through the UX gate above. Never commit to that repo.

## White label, everywhere
Each trainer's clients see only the trainer's brand: app name, icon, colours, coach name. That includes the watch app,
its complications, notifications, health-permission prompts and share cards. No "Spotter" (or Station Zero) on any
client-facing surface. The coach app may say Spotter.

## Product rules
- Plain English. Explain, don't score. Screening, never diagnosis. No invented statistics.
- Health data (cycle, symptoms, fuelling, pain) is the client's; their coach sees it only when shared.
- Use they/them or names for clients; never infer pronouns from a name. Mock data is labelled MOCK.

## Checks before any merge
`pnpm --filter @spotter/core test` · `pnpm typecheck` · `pnpm lint` · `node packages/db/scripts/sync-schemas.mjs --check`
· `PGPORT=<unique> bash packages/db/scripts/test-local.sh` · `bash scripts/build-web.sh` · `pnpm --filter @spotter/web build`
· a headless-browser pass over the changed screens with zero console errors.
Kill only processes you started, by PID (never `pkill -f`).
