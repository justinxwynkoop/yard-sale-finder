# Profile Screen Redesign — Design Spec

**Date:** 2026-05-22
**Status:** Approved (pending implementation plan)
**Scope:** Redesign the Profile tab and introduce a dedicated Edit Profile screen with avatar upload. Cross-platform consistent design that respects Apple HIG and Material 3 core guidelines. Clean and spacious visual style.

## Goals

- Replace the ad-hoc Profile screen with a modern identity + settings hub that looks and feels current on both iOS and Android.
- Move profile editing to a dedicated screen with avatar upload.
- Hide developer build details behind a tap-version-7-times easter egg.
- Source all displayed profile data from the live `profiles` row (and app metadata from Expo constants). No hardcoded fallbacks.

## Non-goals

- Dark mode support.
- Push notification settings, privacy controls, blocked users, account deletion, email change.
- Public-facing or shareable profiles, social stats.
- Activity stats ("X sales posted").
- Saved sales carousel (intentionally removed; can return later if there's no dedicated Saved view).

## High-level layout

### ProfileScreen

```
┌─ SafeArea (bg: surface #FAFAF9) ────────────────┐
│  Profile                          (large title)  │
│                                                  │
│           ╭──────────╮                           │
│           │  AVATAR  │   ← 96px, tappable        │
│           ╰──────────╯                           │
│              Display Name                        │
│            user@email.com                        │
│        [   Edit Profile   ]                      │
│                                                  │
│   ACCOUNT                                        │
│  ┌─────────────────────────────────────────┐    │
│  │  [✏]  Edit Profile                  ›   │    │
│  │  [⏏]  Sign Out                          │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│   ABOUT                                          │
│  ┌─────────────────────────────────────────┐    │
│  │  [ⓘ]  Version             1.0.0 (12)    │    │
│  │  [✉]  Help & Feedback               ›   │    │
│  └─────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

**Header**: Large title "Profile" (28pt bold, left-aligned) flush with the surface background. No card wrapper.

**Identity hero**: 96px avatar, tappable (alternate path to Edit Profile). Display name (20pt semibold), email (14pt zinc-500). "Edit Profile" outline button below.

**Settings groups**: Two groups: *Account* and *About*. Each group is preceded by an uppercase 11pt zinc-400 header label, then a white rounded-2xl card (no shadow) containing one or more `ListRow`s. Hairline dividers (1px zinc-100, inset 64px to match the icon column) separate rows within a card.

**Rows**:
- *Account → Edit Profile*: pushes EditProfile.
- *Account → Sign Out*: destructive style (red icon + label), no chevron. Tapping shows the existing native confirm Alert.
- *About → Version*: shows `appVersion (buildNumber)`. Tapping 7× within 3 seconds opens a modal showing the existing build details (runtime version, channel, update ID, pushed-at).
- *About → Help & Feedback*: opens `mailto:` link via `Linking.openURL`. Recipient email is read from `EXPO_PUBLIC_SUPPORT_EMAIL` (new env var) with a fallback to a constant defined in a single config module — never hardcoded inline.

### EditProfileScreen

```
┌─ Stack screen ───────────────────────────────────┐
│  ‹ Cancel              Edit Profile        Save  │
│                                                   │
│                ╭──────────╮                       │
│                │  AVATAR  │    (tap to edit)      │
│                ╰──────────╯                       │
│                  📷                               │
│             Change photo                          │
│                                                   │
│   DISPLAY NAME                                    │
│  ┌──────────────────────────────────────────┐    │
│  │ Jane Doe                                 │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│   EMAIL                                           │
│   jane@example.com           (read-only)          │
└───────────────────────────────────────────────────┘
```

- Stack-pushed (not modal). Native back works on both platforms.
- Header right has **Save** — disabled until form is dirty + valid, shows a spinner during save.
- Avatar tap or "Change photo" button opens an `Alert.alert` action sheet: Take photo / Choose from library / Remove photo (only if avatar exists) / Cancel.
- Display name: standard `Input`, maxLength 50, required non-empty (same rule as `isProfileComplete`).
- Email: read-only display only — changing email is an auth flow, out of scope.
- Cancel/back with unsaved changes prompts "Discard changes?" via `Alert.alert`.
- `KeyboardAvoidingView` so Save button in header remains accessible while typing.

## Components

### New components in `src/components/ui/`

#### `ListRow.tsx`

A reusable settings row primitive.

Props:
- `icon: keyof typeof Ionicons.glyphMap`
- `iconTone?: 'brand' | 'destructive' | 'neutral'` (default `'brand'`)
- `label: string`
- `value?: string` (right-aligned text shown before chevron)
- `onPress?: () => void`
- `showChevron?: boolean` (default `true`)
- `destructive?: boolean` (label and icon use red-600; suppresses chevron by default)

Renders:
- Pressable, height 56px, horizontal padding 16px, pressed state `bg-zinc-50`.
- Leading icon in a 32×32 rounded-[10px] container. Brand tone uses `bg-brand-50` with `color brand`. Destructive tone uses `bg-red-50` with `color red-600`. Neutral uses `bg-zinc-100` with `color zinc-600`.
- Label in 16pt zinc-900 (red-600 if destructive).
- Optional value text in 14pt zinc-400 to the right of label.
- Chevron-forward icon in zinc-300 unless `showChevron={false}` or destructive.

Accessibility:
- `accessibilityRole="button"`
- `accessibilityLabel={label}`
- `accessibilityHint` accepted via props for screen-reader context (e.g. "Tap 7 times to show build details").

#### `ListGroup.tsx`

A grouped card containing one or more `ListRow`s.

Props:
- `title?: string` (uppercase group header above the card)
- `children: ReactNode` (one or more `ListRow`s)

Renders:
- Optional `<Text>` header above the card: 11pt uppercase tracking-wide zinc-400, left-padded 4px from card edge.
- Card: white, rounded-2xl, no shadow, no border (clean and spacious — relies on contrast with the surface).
- Auto-inserts a 1px zinc-100 divider between children, inset 64px from the left (past the icon column).

#### `AvatarEditor.tsx`

The avatar UI for the Edit Profile screen.

Props:
- `uri: string | null`
- `name: string | null` (for initials fallback)
- `uploading: boolean`
- `onChange: (uri: string | null) => void` (called with new local URI immediately on selection; null when removed)

Renders:
- Larger Avatar (112px), a 28px brand-colored camera badge anchored to the bottom-right, a faint "uploading" overlay (rotating spinner over a 50% white mask) while `uploading` is true.
- A "Change photo" text-button beneath.
- Tap on avatar or button → `Alert.alert` with options: Take photo / Choose from library / (Remove photo) / Cancel.
- Handles `expo-image-picker` permission requests; on denial shows toast with action "Open Settings" → `Linking.openSettings()`.

### New screen

#### `src/screens/profile/EditProfileScreen.tsx`

Implements the Edit Profile layout from the design.

- Seeds form state from `useProfile()`.
- Local `displayName` and `avatarUri` state, plus a `dirty` derived flag.
- On submit:
  1. If avatar changed: upload via `avatarUpload` lib → returns public URL (or null on remove).
  2. Update `profiles` row: `update({ display_name, avatar_url })`.
  3. Call `useProfile().refetch()`.
  4. `navigation.goBack()` + toast success.
- On any failure: revert avatar preview if needed, toast error, keep form dirty.
- Beforehand prompt on cancel/back if dirty.

### Modified

#### `src/screens/profile/ProfileScreen.tsx`

Rewritten from scratch to match the new layout. Specifically:

- Drops the inline display-name form + Save button.
- Drops the saved-sales carousel.
- Drops the AppInfoCard and DebugInfoCard inline rendering.
- Replaces local profile fetch with `useProfile()`.
- Composes layout from `ListGroup` + `ListRow`.
- Adds tap-version-7-times handler with a 3-second sliding window and an internal `<Modal>` to show the existing build details.
- Email displayed from `profile.email` (no `user.email` fallback). If profile load fails, shows an inline error card with a Retry button.

#### `src/navigation/index.tsx`

- Add a `ProfileStackParamList`-typed nested native-stack navigator (mirroring `MapNavigator`, `ListingsNavigator`).
- `ProfileNavigator` contains `ProfileHome` (the current ProfileScreen) and `EditProfile`.
- Tab `Profile` now points to `ProfileNavigator` instead of `ProfileScreen` directly.
- EditProfile header uses standard header (`headerShown: true`, `headerBackTitle: 'Cancel'` on iOS). Save button installed via `navigation.setOptions({ headerRight: ... })` inside `EditProfileScreen` so it can react to dirty/loading state.

### New utility

#### `src/lib/avatarUpload.ts`

Encapsulates avatar upload logic.

- `uploadAvatar(userId: string, localUri: string): Promise<string>`:
  1. Read file via `expo-file-system` as base64.
  2. Resize/compress with `expo-image-manipulator` to a max ~512px square JPEG, quality ~0.85.
  3. Convert base64 → ArrayBuffer via `base64-arraybuffer` (already a dep — mirrors sale-media path).
  4. Upload to Supabase Storage bucket `avatars` at path `{userId}/{uuid}.jpg`.
  5. Return the public URL.
- `deleteAvatar(publicUrl: string): Promise<void>`:
  1. Parse the storage path from the public URL.
  2. Best-effort delete; swallow errors (orphaned files aren't user-visible).

### Types

In `src/types/index.ts`:

```ts
export type ProfileStackParamList = {
  ProfileHome: undefined;
  EditProfile: undefined;
};
```

## Data sourcing rules

- **Display name**: `profile.display_name`. Never falls back to `user.user_metadata` or hardcoded strings on the read-only Profile screen. The Edit screen shows a placeholder ("Your name") inside the empty Input only.
- **Email**: `profile.email`. Never falls back to `user.email`. The `profiles` row is created by the post-signup trigger and is authoritative.
- **Avatar**: `profile.avatar_url`. Falls back to the existing `Avatar` component's initials block (derived from `profile.display_name`). Initials are a visual fallback, not a hardcoded string.
- **App name**: `Constants.expoConfig?.name`. No hardcoded "Local Hauls" anywhere in the redesigned code.
- **Version / build / runtime**: `useAppVersion()` (unchanged).

If `useProfile()` returns no profile but a user is signed in (e.g. race after Apple sign-in with private relay), Profile renders the loading state for up to 3 seconds, then swaps to an inline "Profile not ready yet" card with a Retry button that calls `refetch()`.

## Platform conformance

### Touch targets
- All `ListRow`s 56px tall → exceeds iOS 44pt and Android 48dp minimums.
- Avatar tap area ≥ 96×96.
- Buttons ≥ 48px.

### Typography
- System font (SF on iOS, Roboto on Android) — do not override `fontFamily`.
- Title 28pt bold; row label 16pt; secondary 14pt; group header 11pt uppercase.

### Color and contrast
- All text passes WCAG AA: zinc-900 on white (21:1), zinc-500 on white (4.6:1).
- Destructive uses red-600 — meets AA on white.
- No reliance on color alone for state (icons + labels always paired).

### Safe areas
- `SafeAreaView edges={['top']}` on Profile screen.
- Tab bar handles bottom inset.
- EditProfile's native stack header handles top inset automatically.

### Navigation
- EditProfile pushed onto the Profile stack — back gesture works (iOS edge swipe, Android system back).
- Header back / Cancel and Save respect the unsaved-changes prompt.
- Save in header right matches Apple HIG forms and Material's primary-action-in-app-bar guidance.

### Native dialogs
- Sign Out confirmation: `Alert.alert` (existing behavior).
- Avatar action sheet: `ActionSheetIOS.showActionSheetWithOptions` on iOS (true native action sheet) and `Alert.alert` with the same buttons on Android (renders as native AlertDialog). Platform branch lives inside `AvatarEditor` so callers don't see it. Optional later polish: swap Android side to `@expo/react-native-action-sheet` for a bottom sheet.
- Discard changes prompt: `Alert.alert`.

### Accessibility
- Each row: `accessibilityRole="button"`, `accessibilityLabel`, `accessibilityHint` when non-obvious.
- Avatar tap target: `accessibilityLabel={\`\${name}, tap to edit profile\`}`.
- Version row hint: "Activates developer build details on multiple taps."
- VoiceOver / TalkBack order matches visual order via default flex layout.

### Haptics
- Out of scope for v1 (would add `expo-haptics` dep). Easy to layer in later if desired.

## Storage and backend

### New Supabase Storage bucket: `avatars`

- Public read (anyone can fetch by URL — same as `sale-media`).
- Owner write: only the authenticated user can write to paths under `{their_user_id}/`.

A new migration file: `supabase/migrations/<timestamp>_create_avatars_bucket.sql`:

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

### Schema

No changes — `profiles.avatar_url` already exists.

## Error handling

| Scenario | Behavior |
|---|---|
| `useProfile()` error on ProfileScreen | Inline error card with retry button. |
| Save (display name) fails | Toast error, form stays dirty, Save re-enabled. |
| Avatar upload fails | Revert preview to previous URL, toast error, stay on Edit screen. |
| Avatar delete (old file) fails | Silent — orphan tolerated. |
| Camera/library permission denied | Toast with "Open Settings" action via `Linking.openSettings()`. |
| Network offline | Supabase client error surfaced via existing toast pattern. |

## Implementation order (sketch — real plan comes from writing-plans)

1. Create `avatars` bucket migration and apply.
2. Add `ProfileStackParamList`, wire up `ProfileNavigator` in `navigation/index.tsx`.
3. Build `ListRow` and `ListGroup` primitives (testable in isolation).
4. Build `avatarUpload.ts` utility.
5. Build `AvatarEditor.tsx` component.
6. Build `EditProfileScreen.tsx`.
7. Rewrite `ProfileScreen.tsx` to use the new primitives + nav row to Edit.
8. Wire the tap-7-times debug modal.
9. Manual smoke test on iOS + Android.

## Verification

No test runner is configured in this project. Verification is manual:

- `npx tsc --noEmit` passes.
- Manual smoke test checklist (per platform):
  - Profile loads → name, email, avatar reflect the current `profiles` row.
  - App name in About row matches `app.json` `expo.name` (i.e. no hardcoded string).
  - Tap Edit Profile → EditProfile pushes.
  - Edit name → Save → ProfileScreen reflects update.
  - Tap avatar → Take photo → preview shows immediately → upload completes → avatar persists after reload.
  - Tap avatar → Remove → falls back to initials.
  - Cancel with dirty form → discard prompt appears.
  - Permission denial → toast with Open Settings action.
  - Version row tap ×7 → debug modal shows runtime / channel / update ID / pushed-at.
  - Sign Out → confirmation → returns to Auth.
  - VoiceOver: each row reads as a button with a meaningful label.
