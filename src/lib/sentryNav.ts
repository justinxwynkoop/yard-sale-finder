import * as Sentry from '@sentry/react-native';

/**
 * The react-navigation tracing integration, in its own module because two
 * places need the same instance: App.tsx passes it to Sentry.init's
 * integrations, and navigation/index.tsx registers the NavigationContainer
 * on ready so screen transitions become spans (with time-to-initial-display
 * where the native SDK supports it).
 */
export const sentryNavigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});
