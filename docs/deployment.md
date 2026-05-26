# Deployment guide

How to ship Trove to TestFlight (iOS) and Google Play Internal
Testing (Android) using EAS Build + Submit.

---

## TL;DR for first-time setup

```bash
# 1. Authenticate
npx eas login            # use your Expo account (free)

# 2. Link this repo to a new EAS project (writes projectId to app.json)
npx eas init

# 3. Configure credentials (interactive, one-time per platform)
npx eas credentials      # walks you through iOS + Android signing

# 4. First build
npm run build:dev:ios      # iOS dev client for your phone
npm run build:dev:android  # Android dev client for your phone

# 5. First TestFlight + Play Internal builds
npm run build:prod
npm run submit:ios
npm run submit:android
```

The rest of this doc explains each step in detail.

---

## Before your first build — edit these placeholders

Search the repo for any of these strings and replace:

| Placeholder | Where | What to set it to |
|---|---|---|
| `com.jwynkoop.trove` | `app.json` (ios.bundleIdentifier, android.package) | Your real reverse-DNS bundle ID (e.g. `com.yourname.yardsale`). **Must match what you register in App Store Connect + Play Console.** |
| `REPLACE_WITH_GOOGLE_MAPS_API_KEY` | `app.json` (android.config.googleMaps.apiKey) | Android Google Maps API key — see ["Google Maps API key (Android)"](#google-maps-api-key-android) below. |
| `REPLACE_WITH_EAS_PROJECT_ID_AFTER_eas_init` | `app.json` (extra.eas.projectId) | Filled in automatically by `npx eas init`. |
| `REPLACE_WITH_YOUR_APPLE_ID_EMAIL` | `eas.json` (submit.production.ios.appleId) | Your Apple ID email. |
| `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` | `eas.json` | Numeric App Store Connect app ID (after you create the app in ASC). |
| `REPLACE_WITH_YOUR_APPLE_TEAM_ID` | `eas.json` | 10-char Apple Developer Team ID (Apple Developer → Membership). |

---

## Accounts you need

| Account | Cost | Why | Where |
|---|---|---|---|
| **Expo (EAS)** | Free tier is fine | Cloud build infra + OTA updates | https://expo.dev |
| **Apple Developer Program** | $99 / year | iOS distribution (TestFlight + App Store) | https://developer.apple.com/programs |
| **Google Play Console** | $25 one-time | Play Store distribution (any track) | https://play.google.com/console |

You already have the Apple Developer account — only the Google Play Console
and EAS account are left.

---

## Step 1 — Initial config

### 1a. Bundle identifier + package name
Pick something you own (reverse-DNS) and search-replace `com.jwynkoop.trove`
in `app.json` with it. **Don't change it after your first store submission**;
Apple and Google will treat a different bundle as a different app.

### 1b. Log in to EAS
```bash
npx eas login
```

### 1c. Link the project
```bash
npx eas init
```
This creates a project on expo.dev and writes the `projectId` into
`app.json` → `extra.eas.projectId`.

### 1d. Configure credentials
```bash
npx eas credentials
```
Interactive walkthrough. Pick **iOS** → tell it to **generate a new
distribution certificate + provisioning profile** (the default flow).
EAS will create them on the Apple Developer portal for you. Repeat for
**Android** — EAS will generate a keystore (don't lose it; it's tied
to your app forever).

---

## Step 2 — Google Maps API key (Android)

`react-native-maps` on Android needs an API key. iOS uses Apple Maps so
no key required there.

1. https://console.cloud.google.com → create a project (or pick an existing one)
2. **APIs & Services → Library** → enable **Maps SDK for Android**
3. **APIs & Services → Credentials → Create credentials → API key**
4. Restrict the key to **Android apps** with your package name +
   the SHA-1 fingerprint of your keystore. Get the fingerprint with:
   ```bash
   npx eas credentials -p android
   # Choose: Keystore: View / show keystore. The SHA-1 will be listed.
   ```
5. Paste the key into `app.json` → `android.config.googleMaps.apiKey`.

---

## Step 3 — First development build (test on your phone)

Development builds are like Expo Go but with **your custom native code**
(Apple Sign In, datetimepicker plugins, etc.).

```bash
# iOS
npm run build:dev:ios

# Android
npm run build:dev:android
```

EAS prints a URL when the build finishes; tap it on your phone to install.
Then run `npx expo start --dev-client` and scan the QR — same Metro dev
loop you have in Expo Go but with the full native runtime.

For iOS simulator (no Apple Developer membership needed for this profile):
```bash
npx eas build --profile development-simulator --platform ios
```

---

## Step 4 — App Store Connect (iOS) + Google Play Console (Android)

### 4a. Apple — create the app in App Store Connect

1. https://appstoreconnect.apple.com → **My Apps → +**
2. Platform iOS, name `Trove`, primary language English,
   bundle ID = the one in `app.json`, SKU = anything unique
   (e.g. `trove-001`).
3. Once created, note the **App Store Connect App ID** (a numeric string
   like `6450000000`) — put it in `eas.json` under
   `submit.production.ios.ascAppId`.
4. Apple Developer → **Membership** page → copy your **Team ID** into
   `eas.json` under `submit.production.ios.appleTeamId`.

### 4b. Google — create the app in Google Play Console

1. https://play.google.com/console → **Create app**
2. App name `Trove`, default language English, **App**, **Free**.
3. After creation, go to **Setup → App integrity** to set up the app
   signing key — accept Google's recommended "use Play app signing"
   (free, automatic).

### 4c. Google — service account for `eas submit`

So `eas submit` can push builds to Play Console for you:

1. Google Cloud Console → **IAM & Admin → Service Accounts → Create**
   (use the same Google account that owns Play Console).
2. Role: **Service Account User**.
3. Create a JSON key for the account, download it.
4. Save it as `./secrets/play-service-account.json` (the path is
   pre-configured in `eas.json` and `secrets/` is gitignored).
5. In Play Console, **Users and permissions → Invite new users** →
   paste the service account email, grant **Admin** (or just **Release
   manager** for tighter scoping).

---

## Step 5 — First production build

```bash
# Build both platforms
npm run build:prod

# Or one at a time
npm run build:prod:ios
npm run build:prod:android
```

EAS will:
- Bump the iOS build number and Android version code automatically
  (`autoIncrement: true` in `eas.json`).
- Upload artifacts to your EAS dashboard.

When they finish, you'll get download URLs. You don't need to download
manually — `eas submit` will fetch them.

---

## Step 6 — First TestFlight + Play Internal submission

```bash
npm run submit:ios
npm run submit:android
```

### What happens on iOS
- EAS uploads the IPA to App Store Connect.
- App Store Connect processes the build (~5–30 min).
- Open App Store Connect → your app → **TestFlight** tab.
- Add yourself + any testers under **Internal Testing**.
- Apple emails them a TestFlight invitation.

### What happens on Android
- EAS uploads the AAB to Play Console's **Internal testing** track
  (configured by `track: "internal"` in `eas.json`).
- Open Play Console → your app → **Testing → Internal testing**.
- Create a testers list (Google account emails). Share the opt-in
  link — tap it on your Android device, accept, then install the
  app from Play Store.

---

## Step 7 — Iterating

Day-to-day flow once everything is set up:

```bash
# 1. Make changes
# 2. Build a new version
npm run build:prod

# 3. Push it out
npm run submit:ios     # TestFlight
npm run submit:android # Play Internal Testing
```

EAS bumps build numbers; testers get updates automatically.

### OTA updates (no rebuild)
Pure JS / asset changes can ship without a rebuild via EAS Update:

```bash
npx eas update --branch production --message "Quick copy fix"
```

(Requires installing `expo-updates` and a one-time `npx eas update:configure`.)

---

## Going public (App Store + Play Store)

When you're ready:

### iOS
- TestFlight build is automatically promotable to App Store review.
- App Store Connect → your app → **App Store** tab → fill in the
  store listing, screenshots, privacy details, then **Submit for Review**.
- Apple review: 1–3 days typical.

### Android
- Play Console → **Production** track → promote the same build you
  already have on Internal Testing.
- Fill in the store listing, content rating, target audience, then submit.
- Google review: a few hours to ~7 days.

---

## Troubleshooting

- **Build fails on push**: check `eas build:list` for errors. Often a
  missing dependency or invalid plugin config. The link to the build
  log is in the failure email.
- **TestFlight build "Missing Compliance"**: harmless — caused by
  `ITSAppUsesNonExemptEncryption: false` not being set. It's already
  set in `app.json`, so this should not happen.
- **Apple Sign In doesn't appear in dev build**: confirm
  `ios.usesAppleSignIn: true` in `app.json` and that you ran
  `npx eas build:configure` after editing.
- **Google Maps shows a blank gray screen on Android**: the API key
  is missing or restricted incorrectly. Re-check Step 2.
