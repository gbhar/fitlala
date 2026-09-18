# WakeFit Alarm — Distribution Guide

How to get the app onto phones today (sideloading) and into both stores as a
premium (paid) product.

## Where builds come from

Every push to `main` runs two GitHub Actions workflows (free — public repo):

| Workflow | Artifact | Signed? | Use |
|---|---|---|---|
| `iOS build (unsigned IPA)` | `WakeFitAlarm-unsigned-ipa` (~18 MB) | No | Sideloading (signed on install) |
| `Android build (APK)` | `WakeFitAlarm-apk` (~76 MB) | Debug key | Direct install / testing |

Artifacts live on each run's page under **Actions** and are kept 30 days:
https://github.com/gbhar/fitlala/actions

---

## Installing today (no store, no developer account)

### Android — direct install
1. Download `WakeFitAlarm-apk` from the latest green Android run, unzip.
2. Copy `WakeFitAlarm.apk` to the phone any way you like; tap to install.
3. Allow "install unknown apps" when prompted. Installs are permanent and
   updates install over the top (same debug signature).
4. First launch: grant notifications + camera. On Android 14+ also grant
   **Alarms & reminders** so alarms fire at the exact minute.

### iOS — sideload (unsigned IPAs can never be installed by tapping/AirDrop)
Apple only runs apps signed for the specific device, so a computer signs first:

- **AltStore** (free, macOS incl. Apple Silicon): install AltServer from
  altstore.io → menu bar icon → *Install AltStore* → iPhone (cable, Apple ID).
  On the phone: trust the cert (Settings → General → VPN & Device Management),
  enable Developer Mode (Settings → Privacy & Security). Then open the `.ipa`
  from the AltStore app (My Apps → +).
- **Sideloadly** (free, Windows or Intel macOS — needs Rosetta on Apple
  Silicon): drag the `.ipa` in, enter Apple ID, Start.

Free-Apple-ID limits: app expires every **7 days** (re-sideload; data
survives), max 3 sideloaded apps. A paid developer account extends signing to
1 year — but at that point use TestFlight instead (below).

---

## Apple App Store (premium)

**Cost: $99/year** — Apple Developer Program, enroll at developer.apple.com
(approval ~1 day). Required for TestFlight and the App Store.

1. **Signing + build** — easiest is Expo's managed flow:
   ```bash
   npm i -g eas-cli
   eas build --platform ios --profile production
   ```
   EAS logs into the Apple account once and creates/manages the distribution
   certificate and provisioning profile automatically.
   *Alternative:* wire signing into GitHub Actions (App Store Connect API key +
   distribution cert as repo secrets) — more setup, no EAS dependency.
2. **App Store Connect** (appstoreconnect.apple.com):
   - Create the app record with bundle ID `com.gbhargav.wakefit`.
   - **Pricing & Availability** → pick a paid tier (this is what makes it
     "premium"). Requires one-time banking + tax setup under
     *Agreements, Tax, and Banking*.
3. **Upload**: `eas submit --platform ios` (or Transporter.app). The build
   appears in **TestFlight** within minutes — that's the install path for your
   own devices from then on: no cables, no 7-day expiry.
4. **Submit for review** with:
   - Screenshots (6.9" iPhone required; iPad only if you enable iPad).
   - **Privacy policy URL** (required — the app uses the camera).
   - App Privacy "nutrition label": *no data collected* — pose detection runs
     on-device and nothing is transmitted. True, and a strong selling point.
   - Review notes: explain the camera is used to verify wake-up exercises.

### iOS platform caveat worth restating
With the app closed, iOS plays an alarm notification sound for ~30 s max and
Focus/silent switch can mute it; the full looping alarm needs the app opened
via the notification. Consider applying for the **Critical Alerts**
entitlement (developer.apple.com → entitlement request, written justification)
before charging money — it lets alarms pierce silent mode/Focus.

---

## Google Play Store (premium)

**Cost: $25 one-time** — play.google.com/console (identity verification for
new personal accounts, ~1–2 days).

1. **Upload keystore** (the debug-signed CI APK is not accepted by Play):
   ```bash
   keytool -genkeypair -v -keystore upload.keystore -alias upload \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   Keep it out of the repo (it's public!) — store as GitHub secrets
   (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`) for CI signing.
2. **Play App Signing** (default when creating the app): you sign uploads with
   the upload key; Google holds the production signing key — a lost upload key
   is recoverable, the app is never bricked.
3. **Build format**: Play requires an **.aab**, not an APK — in CI that's
   `./gradlew bundleRelease` (plus signing config) instead of
   `assembleRelease`. Output: `android/app/build/outputs/bundle/release/`.
4. **Play Console setup**:
   - Create app → set **price** (Paid) — requires a payments profile.
   - Store listing: description, screenshots, feature graphic.
   - **Data safety form**: no data collected/shared; camera processed
     on-device only.
   - **Privacy policy URL** (required — camera permission).
   - **Exact alarm / full-screen intent declaration**: the app declares
     `SCHEDULE_EXACT_ALARM` and `USE_FULL_SCREEN_INTENT`; declare in the
     console that the app's *core functionality is an alarm clock* — the
     approved use case for both.
5. **Rollout**: upload the .aab to the **Internal testing** track first
   (instant installs for up to 100 testers via a link), then promote to
   Production. Review is typically hours to a couple of days.

---

## Shared checklist (both stores)

- [ ] **Privacy policy page** (one page serves both stores): camera frames are
  processed on-device by a bundled pose-estimation model; no data is
  collected, stored remotely, or transmitted.
- [ ] App icon: current icon is the Expo placeholder — replace
  `assets/icon.png` + Android adaptive icons in `assets/` before submitting.
- [ ] Real-device test pass on each platform: exact-time firing from a locked
  phone, snooze duration honored, all four exercises counted accurately,
  alarm can't be bypassed without reps.
- [ ] Versioning: bump `version` in `app.json` per release; Android
  `versionCode` / iOS build number increment automatically via CI or EAS.

## Cost summary

| | Apple | Google |
|---|---|---|
| Developer account | $99/year | $25 once |
| Store cut of a paid app | 15% (Small Business Program, <$1M/yr) | 15% (first $1M/yr) |
| Test channel | TestFlight | Internal testing track |
