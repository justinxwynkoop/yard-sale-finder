const { withNativeWind } = require('nativewind/metro');
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// getSentryExpoConfig = Expo's default Metro config + Sentry's serializer, which
// injects source-map Debug IDs so production Hermes crashes symbolicate. (Wired
// by @sentry/wizard.) NativeWind wraps it without touching the serializer.
module.exports = withNativeWind(config, { input: './global.css' });