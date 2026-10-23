# Data sources: what reaches Spotter from which device

The coach sees a client's whole picture (training, recovery, sleep, mobility, nutrition, cycle when shared) whatever
the client wears. `packages/core/src/sources.ts` holds the contract: `DataSource { id, label, via, provides }` and a
`SourceAdapter` that turns a source's payload into Spotter's own shapes (`WearableDay`, `ImportedWorkout`,
`HealthNutritionDay`, `HealthPeriod`). Every read, pattern and win works on those shapes only.

**Status of the claims below.** What Spotter itself does is stated as fact. Anything about what a vendor's device,
app or API offers is marked *to verify*: check the vendor's current documentation and terms before relying on it.

## Today: the phone's health store

| Source | Status | How |
|---|---|---|
| Apple Health (iOS) | Live | `apps/client/src/health/source.ios.ts` reads HealthKit: sleep, HRV (SDNN), resting HR, workouts, dietary energy and macros, menstrual flow, active energy. |
| Health Connect (Android) | Live | `apps/client/src/health/source.android.ts` reads Health Connect: sleep, HRV (RMSSD), resting HR, exercise sessions, nutrition, menstruation, active calories. Not yet verified on a device. |
| Entered in Spotter | Live | Daily check (sleep), food log, period log, mobility log. |

Both adapters are thin: the client app already maps the store's records into Spotter's shapes; the core adapter keeps
only that store's rows, so HRV methods never mix.

**How far back a new client's history goes (to verify).** The coach app's "connected" state and the invite screen
promise only "the history their health app shares", never a number of months. Apple Health lets an app read what
the phone has stored once the person grants access. Health Connect is understood to limit apps to recent data
(around 30 days) unless a separate history permission is granted, and the rules differ by Android version: verify on
devices before any copy names a depth.

Any device whose companion app writes to Apple Health or Health Connect reaches Spotter this way with no extra work.
Whether a given device does, and which data types it writes, is *to verify* per vendor and platform:

| Device family | Writes to Apple Health? | Writes to Health Connect? |
|---|---|---|
| Apple Watch | Yes (it is Apple Health's own source) | n/a |
| Garmin | to verify (which types: workouts, sleep, HRV, resting HR) | to verify |
| Oura | to verify | to verify |
| WHOOP | to verify | to verify |
| Fitbit / Google Pixel Watch | to verify | to verify |
| Polar | to verify | to verify |
| Samsung Galaxy Watch | n/a | to verify (via Samsung Health) |

Gaps to expect even when a device syncs (all *to verify*): HRV may not be written at all, or written with a different
method or timing than the vendor's own app shows; sleep stages may be summarised; workouts may arrive without heart
rate.

## Later: direct vendor APIs

A direct API could add what the health store doesn't carry, for example the vendor's own recovery or readiness
measures, overnight HRV as the vendor computes it, richer workout files, or data from clients who don't use the
phone's health store. Which of these each vendor offers is *to verify*. The `DATA_SOURCES` entries for Garmin, Oura,
WHOOP, Fitbit and Polar list the scope Spotter would ask for, not what each API provides; their adapters are stubs that
throw until built.

Before writing any vendor integration:

- Partner or developer-programme approval (some programmes are application-based) — to verify per vendor.
- An OAuth app per vendor, with redirect URIs for each white-label tenant or a shared Spotter one.
- Terms of use: whether data may be shown to a third party (the coach), stored, and combined with other sources;
  branding and attribution rules; rate limits; deletion on disconnect.
- Webhooks vs polling, and backfill limits.

## Options

| Option | Pros | Cons |
|---|---|---|
| Phone health store only (today) | No vendor approvals; one integration per platform; the client controls permissions | Only what each device writes to the store; needs the phone app to sync |
| Direct vendor APIs | Fullest data per vendor; works without the phone app | One OAuth app, approval and terms review per vendor; more code to keep current |
| Aggregator service (e.g. Terra, Junction, formerly Vital) | One integration for many devices; normalised payloads | Per-user cost; another processor of health data (DPA, region, sub-processors); coverage and data depth per device *to verify*; vendor terms still apply |

Whichever route, the adapter turns it into the same shapes and the same rules hold: HRV stays with its source, missing
means null, dates are the client's local day.
