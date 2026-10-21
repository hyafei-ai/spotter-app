# Grow: payments and client acquisition

Spec: K-6 (Grow), K-7 (Payments), C-11 (Buying coaching), build phase 7.

## What's built

### Payments (Stripe Connect Express)
- **The trainer is merchant of record.** Checkout sessions are created on the trainer's connected account (direct charges). Spotter's cut is an application fee set by `PLATFORM_FEE_BPS`, in basis points.
- **Edge Functions** in `packages/db/supabase/functions`:
  - `stripe-connect-onboard`: creates the Express account on first use and returns an onboarding link. Owner only.
  - `stripe-checkout`: plan or storefront program; applies the free trial, coupon and referral code; records `tenant_id`, `client_id`, `plan_id`/`product_id` in metadata.
  - `stripe-portal`: Stripe billing portal link for the signed-in client.
  - `webhooks-stripe`: verifies the signature, then calls `public.stripe_apply_event`.
- **`stripe_apply_event`** is SQL, so it's tested. It's idempotent per event id and mirrors these events into `subscriptions`, `payments` and `session_packs`:
  - `account.updated`
  - `checkout.session.completed`
  - `customer.subscription.*`
  - `invoice.paid`
  - `invoice.payment_failed`

  A failed invoice creates one `payment_failed` triage item, however many retries Stripe makes. A successful payment marks it handled.
- **Failed-payment retries are Stripe's.** Turn on Smart Retries and set the dunning emails under each connected account's Billing settings (or the platform's Connect settings). We don't retry ourselves.
- **Plans:** monthly, weekly, pay in full (N weeks), and in-person session packs. Free-trial days apply to recurring plans only; the database enforces this. Coupons can be a percent or a fixed amount off, with expiry and redemption limits.
- **Session packs** decrement through the `check_in_session(pack)` RPC. The owner, or the assistant assigned to that client, can call it; it stops at zero.

### Web (`apps/web`)
- **Trainer page:** `/<slug>`, rendered from blocks (intro, about, plans with prices, questions, contact form). `proxy.ts` serves `<slug>.spotter.app` and custom domains; custom domains are resolved by `landing_pages.custom_domain` in `public_landing_page`.
- **Storefront:** `/<slug>/programs`.
- **Checkout:** `/<slug>/checkout` handles plan or program, email, discount code and referral (`?ref=`). In live mode it redirects to Stripe Checkout; `/<slug>/welcome` is the "what happens next" page after payment.
- **Lead form:** posts to `submit_lead`. It only works for published pages and is rate limited to 3 per email per hour per trainer.
- **Coach dashboard** at `/dashboard/grow`, with these tabs:
  - **Landing page:** add, edit, reorder and remove sections; live preview; publish rules from `landingProblems`; custom domain field.
  - **Plans and codes**
  - **Leads**, with status changes
  - **Referrals**: on/off and the reward
  - **Storefront**: price and on-sale toggle
  - **Payments and stats**: Stripe connection state, business numbers, recent payments

### Coach app: Grow tab
- **Your page:** "Share my page" opens the share sheet. The "No landing page yet" state links to the web builder.
- **Payments:** a connected/not-connected state.
- **Business stats:** active clients, MRR, churn this month, average client lifetime, trial-to-paid. They're computed in `packages/core/src/grow.ts` from subscription records; each one shows "Not enough data yet" below its minimum sample size (5 for churn, 3 for lifetime and for trial conversion).
- **Leads:** a status sheet, plus "Email <name>".
- **Referrals:** a sheet to turn the programme on/off and set the reward.
- **Offline:** a banner when there's no connection.

### Client app (Me)
- **Plan row:** plan status, with a "Payment problem" state.
- **Billing link:** the link to the billing page appears only where `canLinkToPurchase(platform, region)` allows. The default is Android and web only; iOS shows status without a purchase link. There's no in-app purchase anywhere.
- **"Invite a friend":** shares the client's referral link (`?ref=CODE`) when the trainer has referrals on.

### Data
- **Migration:** `20261021050001_payments_grow.sql` adds `plans`, `coupons`, `storefront_products`, `landing_pages`, `referral_programs`, `referrals`, `leads`, `subscriptions`, `payments`, `session_packs`, `session_pack_checkins` and `stripe_events`, plus the RPCs `public_landing_page`, `submit_lead`, `my_referral_code`, `check_in_session` and `stripe_apply_event`.
- **Access rules (RLS):**
  - **Billing settings and leads:** owner only.
  - **Payments and subscriptions:** the client sees their own; the owner sees all; assistants see none.
  - **Published pages:** reachable only through `public_landing_page` (anon). Coupons never appear on the public page.
- **Tests:**
  - **SQL:** `packages/db/supabase/tests/50_payments_grow.test.sql`, 37 checks.
  - **Unit:** `packages/core/test/grow.test.ts` covers pricing, coupons, fees, trials, MRR and stats, referral codes, session packs, landing-page rules and the purchase-link policy.

## What's mocked (labelled `MOCK` in code)
- **No real Stripe calls without keys.**
  - **Web demo:** `/<slug>/checkout/test` is a simulated Stripe test-mode page. It never asks for a card and charges nothing; it offers "Pay (test)" and "Try a declined card (test)".
  - **Coach app and dashboard:** "Connect Stripe" connects a simulated test account.
- **Demo storage.** Grow data lives in `localStorage` under `spotter.grow.<slug>`. On the Expo web preview the coach and client apps share it. The Next.js site is a separate origin, so its edits don't reach the Expo apps in demo mode.
- **Demo content.**
  - **Stats:** computed from `demoSubscriptions()`, a sample history.
  - **Demo page copy:** describes how the app works and is labelled sample text. It has no testimonials, results or client counts.
- **No dashboard sign-in.** The web dashboard runs in demo mode only. Sign-in arrives with the platform build; until then `/dashboard/grow?tenant=<slug>` picks a demo business.

## Needs real credentials or services
- **Edge Function env:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (a Connect webhook endpoint subscribed to the events above), `PLATFORM_FEE_BPS`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Web env:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Setting them switches the site from demo to live. `ROOT_DOMAIN` defaults to `spotter.app`.
- **Stripe catalogue sync.** Plans and coupons can carry `stripe_price_id` / `stripe_coupon_id`. Without them, checkout uses inline `price_data`, and coupons must exist on the connected account. Syncing plan edits to Stripe Prices is still to do.
- **New buyers get no invite yet.** A buyer who isn't a client yet is recorded with `buyer_email`; sending their invite to the app on `checkout.session.completed` is still to do.
- **Referral rewards aren't applied.** Uses and grants are counted; applying the reward as a credit or coupon is still to do.
- **Open question (C-11):** confirm current App Store and Play rules on external purchase links per launch region, then set `DEFAULT_PURCHASE_LINK_POLICY` and the device region.

## Deploying the web app
`apps/web` is a separate Next.js deployment from the Expo web export (`scripts/build-web.sh`). Create a second Vercel project:
- **Root directory:** `apps/web`
- **Framework:** Next.js
- **Install command:** `cd ../.. && corepack enable && pnpm install --frozen-lockfile`
- **Build command:** `cd ../.. && pnpm --filter @spotter/web build`
- **Domains:** `spotter.app` and `*.spotter.app` (wildcard). Add each trainer's custom domain to that project.
