# Nutrition, habits and health data (C-8, C-10)

## What's built

**Coach (client detail → Nutrition)**
- Section on the client detail: mode and targets, today's log against targets (real logged data only), days logged in the last 7, habits, meal plan.
- Editor (`/client/[id]/nutrition`):
  - mode: Macros, Portions (palms, cupped hands, thumbs, fists per day) or Off
  - macro fields with a "these macros add up to X kcal" check and one-tap fix
  - habits, up to 8
  - meal plan built from a template or empty: meals → foods with grams, whole-day totals in macros mode
  - unsaved-changes guard
- Off mode means the client sees no numbers anywhere, only habits.

**Client**
- Today → Due → "Nutrition" (or "Habits" when tracking is off) → `/nutrition`.
- Day view:
  - targets against what's logged, as plain "X of Y" rows with "left"/"over" (no rings)
  - in Portions mode, hand-portion counters with + and −
  - meals with remove and Undo
  - "Log as planned" per meal for an assigned plan
  - habit checkboxes
  - previous days
- `/nutrition/add`:
  - meal picker
  - search (debounced; latest query wins)
  - Recent, Favourites (star), Quick add (kcal worked out from macros if left blank)
  - amount sheet with serving and gram presets plus a stepper
- `/nutrition/scan`:
  - camera barcode scan (EAN-13/8, UPC-A/E) with an "Allow camera" prompt, a denied state with "Open Settings", and a typed-barcode fallback
  - found → "Log 1 serving" (three taps from the nutrition screen: Scan → scan → Log)
  - not found, offline and lookup-error states go to quick add
  - on web, typing only, plus demo codes
- Offline: every log, delete and habit tick is queued (`food.log`, `food.delete`, `habit.check` mutations). Search offline covers only foods already on the phone, with a banner saying so.
- Me → Health app:
  - Apple Health (`@kingstinct/react-native-healthkit`) and Health Connect (`react-native-health-connect`), read-only steps, bodyweight and last night's sleep
  - connect, connected (readings), denied ("Open …"), disconnect, and unavailable states
  - on web: "Available in the iPhone and Android app"
  - platform files `src/health/source.{ios,android,web}.ts`

**Core** (`packages/core/src/nutrition.ts`)
- Food shape and macro math (Atwater kcal, per-gram scaling, sums, kcal mismatch).
- Hand-portion guidance (palm ≈ 25 g protein, cupped hand ≈ 25 g carbs, thumb ≈ 10 g fat).
- Meal grouping.
- Barcode normalisation with check digits (UPC-A → EAN-13, GTIN-14).
- Open Food Facts and USDA FoodData Central mappers, merge/dedupe and local search.
- 21 unit tests. The fixtures in `test/fixtures/` are **hand-written in each API's documented response shape with invented products**; the build sandbox couldn't reach either API to record real responses.

**Backend**
- Migration `20261021040001_nutrition.sql`: `nutrition_targets`, `foods` (public cache, plus tenant custom foods), `food_logs`, `meal_plans`, `habits`, `habit_logs`, all with RLS.
- `sync_handle_nutrition` handles the new offline kinds. A newer habit tick always wins; deletes keep the row.
- 19 SQL tests in `tests/40_nutrition.test.sql`.
- Edge Function `food-search`:
  - cache first (30 days), then Open Food Facts (barcode + text) and USDA (text)
  - maps sources with the shared code, caches results with the service role
  - one source failing doesn't fail the search
- `scripts/sync-schemas.mjs` now also copies `nutrition.ts` into `functions/_shared/`.

## Mocked (labelled `MOCK` in code)
- Food search and barcodes in demo mode use `SAMPLE_FOODS`: 28 generic foods with typical per-100 g values and made-up in-store barcodes (prefix 20).
- The demo client's starting targets, habits and meal plan (`packages/core/src/demo/nutrition.ts`).
- Coach ↔ client sharing uses localStorage keys `spotter.nutrition.*`. This works on the web preview because both apps share one origin; on native the two apps don't share until the backend is connected.
- The coach's meal-plan food picker searches the sample list.

## Needs real credentials or services
- `USDA_API_KEY` (free from api.data.gov) and `OFF_USER_AGENT` in the Edge Function env; `SUPABASE_SERVICE_ROLE_KEY` for cache writes.
- The client must send the user's JWT to `food-search`. That waits on sign-in, which isn't built yet.
- Reading `nutrition_targets` / `meal_plans` / `habits` into the client through `GET /sync/pull`, which doesn't exist yet. The coach editor also needs to write those tables instead of localStorage.
- HealthKit and Health Connect only run in a dev/production build (`eas build`), not Expo Go or web.
  - Apple: the HealthKit capability on the App ID.
  - Google: the Health Connect permissions declaration in the Play Console.
- Health readings are shown to the client but not yet uploaded for the coach. That needs a table and a sync kind, not built.
