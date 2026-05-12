# Yard Sale Finder

A mobile app that connects yard sale hosts with nearby buyers through a live map experience. Think of it as the "Waze of yard sales" — community-powered, map-driven, and built for spontaneous discovery.

---

## What It Does

**For Sellers (Sale Hosts)**
- Post a yard or garage sale by dropping a pin or entering an address
- Upload photos and videos of items for sale
- Set dates, times, item categories, and pricing notes
- Go live in under 2 minutes — your sale appears as a pin on the map instantly
- Update your sale status: Active → Winding Down → Ended

**For Buyers (Sale Hunters)**
- Open the app to a live map of nearby sales
- Tap any pin to preview photos and sale details
- Filter by category (furniture, clothing, electronics, tools, etc.)
- Get directions to any sale with one tap
- Browse before you drive

**One account does both** — any user can post a sale or browse the map, no role selection required.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile Framework | React Native (Expo SDK 54) |
| Language | TypeScript |
| Backend / Database | Supabase (Postgres + Realtime) |
| Authentication | Supabase Auth (Google, Apple, Facebook OAuth) |
| Maps | react-native-maps |
| Media Storage | Supabase Storage |
| Navigation | React Navigation v6 |

---

## Use Cases

- **Moving sale** — post everything at once with photos, buyers can browse before showing up
- **Weekend hunter** — open the map Saturday morning and find every sale within driving distance
- **Recurring seller** — build a profile, post multiple sales over time
- **Last-minute deals** — mark a sale "Winding Down" so buyers know to hurry

---

## Developer Setup

### Prerequisites

Make sure you have the following installed on your machine:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)
- [Expo Go](https://expo.dev/go) on your phone (iOS or Android) — this is how you run the app during development
- A code editor — [VS Code](https://code.visualstudio.com/) recommended

You do **not** need Xcode or Android Studio to run the app during development.

---

### 1. Clone the Repo

```bash
git clone https://github.com/YOUR_USERNAME/yard-sale-finder.git
cd yard-sale-finder
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy the example env file and fill in the values:

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
EXPO_PUBLIC_SUPABASE_URL=https://dxahcamntwtuzftxbxgx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=placeholder
```

> Ask the project owner for the Supabase anon key. Never commit the `.env` file.

### 4. Set Up the Database

1. Go to [Supabase](https://supabase.com) and get access to the `yard-sale-finder` project
2. Open the [SQL Editor](https://supabase.com/dashboard/project/dxahcamntwtuzftxbxgx/sql)
3. Paste the contents of `supabase/schema.sql` and run it

This only needs to be done once per Supabase project.

### 5. Run the App

```bash
npx expo start --clear
```

A QR code will appear in the terminal.

- **iPhone**: Open the Camera app and scan the QR code
- **Android**: Open the Expo Go app and tap "Scan QR code"

Your phone and computer must be on the **same WiFi network**.

---

## Project Structure

```
yard-sale-finder/
├── src/
│   ├── screens/
│   │   ├── auth/          # Login screen (Google, Apple, Facebook)
│   │   ├── map/           # Map home + sale detail
│   │   ├── sale/          # Create, edit, and manage your sales
│   │   └── profile/       # User profile
│   ├── components/        # Shared UI components
│   ├── hooks/             # useAuth, useSales
│   ├── lib/               # Supabase client
│   ├── navigation/        # App navigation setup
│   ├── types/             # TypeScript types
│   └── utils/             # Formatters and helpers
├── supabase/
│   └── schema.sql         # Full database schema — run this in Supabase
├── assets/                # App icons and images
├── .env.example           # Environment variable template
├── App.tsx                # App entry point
└── app.json               # Expo config
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` | Mapbox token (for production builds) |

---

## Notes for Contributors

- The app currently uses `react-native-maps` (works in Expo Go). Mapbox is planned for production builds.
- OAuth (Google/Apple/Facebook) is functional in production builds. During development, auth can be bypassed via the `DEV_BYPASS_AUTH` flag in `src/navigation/index.tsx`.
- Never commit `.env` or any `client_secret_*.json` files.
