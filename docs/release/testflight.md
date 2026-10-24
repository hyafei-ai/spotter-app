# TestFlight: shipping a trainer's iPhone + Apple Watch app

Each trainer gets their own app (their name, icon and colours), with their Apple Watch app inside it. The build runs on
EAS (Expo's macOS build service), started from GitHub, so **nobody needs a Mac** to ship a TestFlight build. A Mac
with Xcode is only needed to debug the watch app on a device.

## One-time setup (business owner, about an hour)

### 1. Apple
1. Enrol in the **Apple Developer Program** (developer.apple.com/programs). This is a paid yearly membership.
   Organisation enrolment needs a D-U-N-S number and is how the apps show your company as the seller.
2. In **App Store Connect → Users and Access → Integrations → App Store Connect API**, create a key with the
   **App Manager** role. Download the `.p8` file (Apple only lets you download it once). Note the **Key ID** and the
   **Issuer ID**.
3. Your **Team ID** is under developer.apple.com → Membership.

### 2. Expo (EAS)
1. Create an account at expo.dev, plus an organisation for the business.
2. Create an **access token**: Account settings → Access tokens.

### 3. GitHub secrets
In the spotter-app repo: Settings → Secrets and variables → Actions → New repository secret.

| Secret | Value |
|---|---|
| `EXPO_TOKEN` | the Expo access token |
| `APPLE_TEAM_ID` | your Apple Team ID |
| `ASC_KEY_ID` | the App Store Connect API Key ID |
| `ASC_ISSUER_ID` | the Issuer ID |
| `ASC_KEY_P8` | the whole contents of the `.p8` file, including the BEGIN/END lines |

Never paste these into chat, email or the repo.

## Per trainer (once each, about 15 minutes)
1. **Bundle id.** Each trainer's app needs its own iPhone bundle id, e.g. `com.yourcompany.mayareyes`. The watch
   app's ids are derived from it automatically (`….watchkitapp`, `….watchkitapp.complication`). The demo trainers use
   `com.spotter.*` ids. Real trainers get their own at onboarding, so "Spotter" never shows anywhere in their app's
   identity.
2. **EAS project.** On expo.dev, create a project whose slug is the trainer's slug (e.g. `maya-reyes-strength`).
   Copy its **Project ID**.
3. **App Store Connect app.** My Apps → + → New App, with the trainer's app name and bundle id. Copy the **Apple ID**
   (numbers) from App Information.
4. **Signing (first build only).** On any computer with Node, run
   `cd apps/client && TENANT_ID=<slug> SPOTTER_WATCH=1 EAS_PROJECT_ID=<id> npx eas-cli@16 credentials -p ios`.
   Choose to let EAS create the certificates and provisioning profiles for all three targets (app, watch app,
   complication). This step needs an Apple sign-in once. After that, builds are fully automatic.

## Ship a build
GitHub → Actions → **TestFlight** → Run workflow. Fill in:
- **tenant**: the trainer's slug;
- **asc_app_id**: from step 3;
- **eas_project_id**: from step 2;
- **version**: e.g. `0.1.0`;
- **watch**: on.

The run then:
1. runs the same checks as CI;
2. renders the trainer's watch icons and runs the white-label check (no "Spotter" on any watch surface);
3. builds on EAS with a unique build number (the GitHub run number, shared by the iPhone and watch apps, as Apple
   requires);
4. sends the build to TestFlight.

Apple then processes it, usually within an hour. Add testers in App Store Connect → TestFlight: internal testers
straight away; external testers after Apple's beta review.

## What CI checks on every push (no Apple account needed)
The `ios-project` job generates each demo trainer's iOS project with the watch targets (`expo prebuild` on Linux) and
runs the white-label check on what was generated. It catches broken config before anyone pays for a build. It doesn't
compile Swift: compiling happens on EAS.

## Verified vs not
- **Verified here:**
  - `expo prebuild -p ios` with the watch for the demo trainers;
  - build number 7 reached the iPhone app's `CFBundleVersion`; the watch targets read the same value through
    `CURRENT_PROJECT_VERSION`;
  - the white-label check passed on the generated output;
  - both workflow files parse.
- **Not verified here:** an EAS build, signing and a TestFlight upload. Those need the accounts above, and Expo's
  servers aren't reachable from the environment this was written in. The first real run is the test. If it fails,
  the log names the step.
- **To check on the first run:**
  - that `eas-cli` 16 accepts `--auto-submit-with-profile` with the App Store Connect key from the environment
    (`EXPO_ASC_*`);
  - that EAS signs the two extra watch targets (declared through `appExtensions` by
    `apps/client/plugins/withSpotterWatch.js`).

## Then, on a real watch
Work through the device checklist in `docs/features/watch.md`: cold-launch heart rate, three workouts in a day, a
workout started from the phone while the watch is asleep, an offline session then sync, race-mode flicker, crash
recovery, rebrand, and white label.
