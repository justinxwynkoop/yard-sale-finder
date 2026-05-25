# Branding — icon + splash + brand assets

The Expo template assets (`assets/icon.png`, `assets/adaptive-icon.png`,
`assets/splash-icon.png`, `assets/favicon.png`) are still in place as
placeholders. Replace them with real Trove assets before going
public to the App Store.

## Brand spec

| Token | Value | Notes |
|---|---|---|
| Primary brand | `#F97316` (orange-500) | icons, buttons, primary actions |
| Brand light | `#FFEDD5` (orange-50/brand-100) | splash background, soft tinted surfaces |
| Brand dark | `#EA580C` (orange-600) | active / hover states |
| Surface | `#FAFAF9` (zinc-50, warm) | app background |
| Text primary | `#18181B` (zinc-900) | body, headlines |
| Text muted | `#71717A` (zinc-500) | secondary text |

Brand mark concept: a **stylized white price tag** on the brand-orange
background. Inspiration: the `pricetag` Ionicons glyph at `src/components/MapPin.tsx`
and the orange icon-bubble used everywhere in-app.

## What you need to produce

All as **PNG**, no transparency unless noted:

| File | Dimensions | Notes |
|---|---|---|
| `assets/icon.png` | 1024 × 1024 | iOS app icon. NO transparency, NO rounded corners (iOS adds them). Full-bleed brand orange + centered white tag glyph. |
| `assets/adaptive-icon.png` | 1024 × 1024, transparent | Android adaptive icon foreground. Center the glyph at ~60% of the canvas. Android adds the background color from `app.json` (currently set to brand light). |
| `assets/splash-icon.png` | 1284 × 2778 OR a smaller centered glyph | Splash. The `expo-splash-screen` plugin in `app.json` uses `imageWidth: 200`, so a centered logo around 200px tall on a transparent background works. Background color comes from `expo-splash-screen.backgroundColor` (brand light). |
| `assets/favicon.png` | 48 × 48 (or 32 × 32) | Web only. Same glyph. |

## Easiest path: an icon generator

1. **Make ONE 1024×1024 master PNG.** Tools:
   - Figma (free) — draw a square, fill `#F97316`, drop a centered white pricetag SVG.
   - https://icon.kitchen — paste a single Ionicon name + brand color, exports all sizes.
   - https://www.canva.com/create/app-icons/ — easy templates.
2. **Pipe it through https://www.appicon.co or https://easyappicon.com** — these take your 1024×1024 source and emit every iOS + Android size in a zip. You only need the four files listed above for Expo.
3. Drop them into `assets/`, replacing the Expo defaults. Filenames must match what `app.json` references.
4. `npm run build:prod:ios && npm run submit:ios` to ship the new icon to TestFlight (a JS-only EAS Update won't update the icon — needs a native rebuild).

## Designer-friendly alternative

If you want a real designer to take a pass:
- Brief: "Trove, yard sale discovery app. Brand orange `#F97316`, friendly, weekend-morning vibe. Need iOS + Android app icon + splash, all sizes."
- Budget: $50–$300 on https://99designs.com or Fiverr for a competent indie designer.
- Deliverables: same four PNGs above plus a vector master so future variants are cheap.

## Splash screen — already brand-tinted

The Expo splash currently shows the placeholder pricetag icon on a
**brand-light background** (`#FFEDD5`). Once you replace
`assets/splash-icon.png` with your real glyph, the splash will pick it
up automatically. The brand color is configured in `app.json` via
`splash.backgroundColor` and the `expo-splash-screen` plugin.

## Verifying before submission

After replacing the assets:
```bash
npx expo prebuild --clean       # regenerate native projects
npm run build:prod:ios          # builds with the new icon
npm run submit:ios              # pushes to TestFlight
```

On TestFlight you'll see the new icon on the install page. Long-press
the installed app to confirm the icon looks right at small sizes too.
