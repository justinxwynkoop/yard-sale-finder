const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// NOTE: Sentry's metro serializer (withSentryConfig, for source-map Debug IDs)
// is intentionally NOT wired here — @sentry/react-native@7.2.0's serializer
// crashes on metro@0.83.3's bundle output (determineDebugIdFromBundleSource
// reads undefined). DSN crash capture works without it; add source-map upload
// once @sentry/react-native is bumped to a metro-0.83-compatible release.
module.exports = withNativeWind(config, { input: './global.css' });
