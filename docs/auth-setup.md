# Auth setup checklist

The code is wired up — these are the **one-time setup steps** outside the codebase
to make each provider work end-to-end.

## Email / password (already working)

In your Supabase dashboard:
1. **Authentication → Providers → Email** is enabled (default).
2. If you want to skip the confirmation email during dev, turn **"Confirm email"** off.
   The app handles either mode — with confirmations on, signup routes the user to
   the `CheckEmail` screen and the email's tap-link comes back into the app via the
   deep-link handler in `App.tsx`.

The reset-password and email-confirmation links both redirect to
`yardsalefinder://reset-password` and `yardsalefinder://auth-callback`. The
scheme is set in `app.json` (`expo.scheme = "yardsalefinder"`).

## Apple Sign In

**Apple Sign In does not work in Expo Go.** It needs a development build (EAS
build or local Xcode build) because the native module isn't in Expo Go.

### Apple Developer steps
1. Apple Developer → **Certificates, Identifiers & Profiles → Identifiers**.
2. Find your App ID (`com.yourname.yardsalefinder`) and enable
   **"Sign In with Apple"** capability. Save.
3. (Only required for the OAuth-via-Supabase web fallback, not native): create
   a **Services ID** with the same Sign-In-with-Apple config + return URL set
   to `https://dxahcamntwtuzftxbxgx.supabase.co/auth/v1/callback`.

### Supabase dashboard
1. **Authentication → Providers → Apple** → enable.
2. **Bundle ID**: `com.yourname.yardsalefinder` (must match the app).
3. If you also set up the Services ID above for web/desktop fallback, paste
   the Services ID and the JWT signing key. Not needed for the native iOS flow.

### Build
```bash
# Install EAS CLI once
npm install -g eas-cli

# Log in and configure
eas login
eas build:configure

# Build for iOS Simulator (no Apple Developer membership needed for sim)
eas build --profile development-simulator --platform ios

# Or for a real device
eas build --profile development --platform ios
```

Open the dev build, you should see the **black "Sign in with Apple"** button on the
Auth screen. In Expo Go it just won't render.

## Google Sign In (when you want to add it)

1. Google Cloud Console → **APIs & Services → OAuth consent screen** → set it up
   (External, with your email).
2. **Credentials → Create OAuth client ID**:
   - **Web application** type — used by Supabase.
   - Authorized redirect URI:
     `https://dxahcamntwtuzftxbxgx.supabase.co/auth/v1/callback`
3. Supabase dashboard → **Authentication → Providers → Google** → paste the web
   client ID and secret, enable.
4. The current "Continue with Google" button uses `signInWithOAuth` + an
   in-app browser — works in Expo Go too.

## Facebook Sign In

Same shape as Google. Create a Facebook app, add the Supabase callback URL,
paste the App ID + Secret in Supabase. The existing button will then work.
