import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * Surfaces version info that's useful for QA / "is this the build /
 * update I think it is?" checks. The Profile screen shows this.
 *
 * - appVersion       — semantic version from app.json (e.g. "1.0.0")
 * - buildNumber      — iOS build number / Android versionCode (e.g. "12")
 * - runtimeVersion   — what the embedded native binary is compatible with
 * - channel          — which OTA channel this binary subscribed to
 *                       (development / preview / production)
 * - updateId         — UUID of the currently-running JS bundle.
 *                       Changes every time you run `eas update`.
 *                       null when running from Metro (Updates disabled).
 * - isEmbedded       — true if the running bundle is the one baked into
 *                       the binary (no OTA applied yet); false if an
 *                       OTA bundle is active.
 */
export function useAppVersion() {
  const expoConfig = Constants.expoConfig ?? Constants.manifest2 ?? {};
  const appVersion =
    (expoConfig as any).version ?? Constants.nativeAppVersion ?? 'unknown';
  const buildNumber =
    Constants.nativeBuildVersion ??
    (expoConfig as any).ios?.buildNumber ??
    String((expoConfig as any).android?.versionCode ?? '');

  const runtimeVersion =
    typeof Updates.runtimeVersion === 'string'
      ? Updates.runtimeVersion
      : appVersion;

  const channel = Updates.channel ?? '(none)';
  const updateId = Updates.updateId ?? null;
  const isEmbedded = Updates.isEmbeddedLaunch ?? true;

  return {
    appVersion,
    buildNumber,
    runtimeVersion,
    channel,
    updateId,
    isEmbedded,
  };
}
