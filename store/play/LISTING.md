# Play Store listing — Trove (Android)

Everything paste-ready for Play Console. Assets live next to this file.
Prepared 2026-08-26.

## Store listing

**App name** (30 chars max)

> Trove: Yard Sale Finder

**Short description** (80 chars max)

> Find yard sales near you on a live map — hours, directions, what's selling.

**Full description** (4000 chars max)

> Every pin on the map is a yard sale near you.
>
> Trove is a community marketplace for discovering yard sales, garage
> sales, and secondhand finds in your area — and for hosting your own.
>
> DISCOVER
> • A live map of every sale nearby, with distance and drive time
> • See what each sale is selling before you go — categories, photos,
>   hours, and accepted payment
> • Town-wide rummage and neighborhood sale events, mapped stop by stop
> • Browse without an account — sign up only when you want to save,
>   message, or post
>
> PLAN YOUR ROUTE
> • Save the sales you don't want to miss
> • Sort everything by distance from you
> • One-tap directions to any sale
> • Mark sales visited as you make your rounds
>
> SELL YOUR STUFF
> • Post your yard sale in about a minute — photos, hours, categories,
>   and pricing notes
> • List individual items in the marketplace
> • Message buyers in-app; your phone number stays private
> • Join your sale to a neighborhood event so treasure hunters find you
>
> STAY IN THE LOOP
> • Get notified when someone posts a sale near you
> • Follow your favorite hosts and hear when they post
> • Category alerts: tell Trove what you hunt for, and it pings you when
>   someone lists it
>
> Happy hunting!

**Category**: Shopping
**Tags**: yard sale, garage sale, secondhand, marketplace
**Contact email**: jasonwynkoop1@yahoo.com
**Website**: https://trove.sale
**Privacy policy URL**: https://trove.sale/privacy

## App access (review instructions)

Trove supports full guest browsing — reviewers can see the map, sales,
events, and listings without an account ("Just browse for now" on the
welcome sheet). Posting, saving, and messaging require a free email
sign-up. Provide a test account in the console if requested:
email/password of a dedicated review account (create one; do not reuse a
personal login).

## Data safety form

Answer "collects data": YES. Encrypted in transit: YES. Deletion
mechanism: YES — in-app account deletion (`delete_my_account`) plus
https://trove.sale/delete-account.

| Data type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Email address | Yes | No | Account management | Required for accounts |
| Name | Yes | No | Account management, app functionality (shown on posts) | Required for accounts |
| Date of birth (User IDs → "Personal info > Other") | Yes | No | Account management (age gate) | Required for accounts |
| City/State/ZIP (coarse address) | Yes | No | App functionality | Required for accounts |
| Precise location | Yes | No | App functionality (map centering, distance sorting, optional "sales near you" alerts) | Optional (permission prompt; guest can decline) |
| Photos | Yes | No | App functionality (sale/listing/avatar photos, message media) | Optional |
| In-app messages | Yes | No | App functionality | Optional |
| App interactions (analytics) | Yes | No | Analytics (self-hosted event log, not third-party ad tech) | Not optional |
| Crash logs & diagnostics | Yes | Yes (Sentry, service provider) | App functionality/diagnostics | Not optional |
| Device push token | Yes | No | App functionality (notifications via Expo push) | Optional (notification permission) |

Not collected: financial info, contacts, browsing history, health,
ads-related identifiers. No data sold. No third-party advertising.
"Shared" = Sentry receives crash payloads as a processor; Supabase,
Expo, and Vercel are service providers (processor role — Play treats
processor transfers as not "shared" except where noted; keep Sentry
declared to be safe).

## Content rating questionnaire (IARC)

- Category: Utility/Productivity/Communication or Shopping app
- Violence/sexuality/profanity/drugs: No
- User-generated content: YES (sale posts, photos, messages) — moderated:
  in-app reporting, auto-hide at 3+ distinct reports, user blocking
- Users can communicate: YES (1:1 messaging)
- Users can share personal info (addresses on sale posts): YES
- Location sharing: app shows user-provided sale addresses; host address
  privacy modes exist
- Gambling/real-money: No
- Expected rating: Everyone / Teen depending on questionnaire branch —
  answer honestly, either lands fine.

## Target audience

Recommend declaring **18+** (marketplace with user messaging and
user-posted addresses; app collects birthdate at signup). Do NOT tick
"appeals to children."

## Submission checklist

1. **Build a fresh production .aab** — the Aug 24 .aab predates the
   splash fix, notification icon, and App Links intent filters:
   `npx eas build --profile production --platform android`
2. Upload to **Internal testing** track first (`eas submit` is wired:
   `npx eas submit --platform android --latest` uses
   `secrets/play-service-account.json`, track: internal).
3. After the first upload, Play Console → Setup → App signing: copy the
   **App Signing key SHA-256** and:
   - add it as a second entry in `site/.well-known/assetlinks.json`
     (then redeploy the site) — App Links break on store installs
     without it;
   - add the SHA-1 to the Maps API key's Android restrictions in Google
     Cloud ("My First Project" → Maps Platform API Key) — the map goes
     blank on store installs without it.
4. Store listing: paste copy above; upload `01-…04-…png` screenshots,
   `feature-graphic.png`, `icon-512.png`.
5. Data safety + content rating + target audience per sections above.
6. App content: privacy policy URL, account-deletion URL
   (https://trove.sale/delete-account), "News app? No", "COVID app? No".
7. Countries: start with United States.
8. Roll out internal testing → promote when the real-device dust
   settles.
