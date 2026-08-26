import { getStateFromPath, LinkingOptions } from '@react-navigation/native';
import { RootStackParamList } from '../types';

/**
 * Deep-link route config, shared by NavigationContainer's `linking` prop and
 * the cold-start replay below. Kept in one place so a screen added here is
 * picked up by BOTH paths (warm `url` events handled by React Navigation,
 * cold-start launch URLs replayed via navigationRef once MainTabs mounts).
 *
 * initialRouteName matters: when a link creates fresh nested state (cold
 * start, or a warm link into a tab that hasn't been visited), it puts the
 * stack's home screen underneath the detail so the back button has
 * somewhere to go instead of dead-ending on the deep-linked screen.
 */
export const LINKING_CONFIG: NonNullable<
  LinkingOptions<RootStackParamList>['config']
> = {
  screens: {
    Main: {
      screens: {
        Map: {
          initialRouteName: 'MapHome',
          screens: {
            MapHome: 'map',
            SaleDetail: 'sale/:saleId',
            EventDetail: 'event/:slug',
          },
        },
        Listings: {
          initialRouteName: 'ListingsHome',
          screens: {
            ListingDetail: 'listing/:listingId',
          },
        },
      },
    },
  },
};

/**
 * Extract the app-route path from a launch URL. Handles all three shapes we
 * receive: custom scheme (trove://sale/x — path starts right after the
 * scheme), universal/app links (https://trove.sale/sale/x — an authority
 * precedes the path), and Expo dev-client URLs (exp://host:port/--/sale/x —
 * the app path follows the `/--/` separator). Fragments are dropped; auth
 * links keep their tokens there and never route through this module.
 */
export function pathFromUrl(url: string): string | null {
  const schemeIdx = url.indexOf('://');
  if (schemeIdx < 0) return null;
  const scheme = url.slice(0, schemeIdx).toLowerCase();
  let rest = url.slice(schemeIdx + 3);

  const hashIdx = rest.indexOf('#');
  if (hashIdx >= 0) rest = rest.slice(0, hashIdx);

  if (
    scheme === 'http' ||
    scheme === 'https' ||
    scheme === 'exp' ||
    scheme === 'exps'
  ) {
    const slashIdx = rest.indexOf('/');
    rest = slashIdx >= 0 ? rest.slice(slashIdx + 1) : '';
  }

  if (rest.startsWith('--/')) rest = rest.slice(3);
  rest = rest.replace(/^\/+/, '');

  return rest.length > 0 ? rest : null;
}

export type DeepLinkRoute = {
  name: string;
  params?: Record<string, unknown>;
};

/**
 * Resolve a launch URL to the deepest screen it targets, using the same
 * config React Navigation matches warm links against. Returns null for
 * anything that isn't a content link (auth callbacks, dev-client launch
 * URLs, bare scheme opens) so callers can simply do nothing.
 */
export function contentRouteFromUrl(url: string): DeepLinkRoute | null {
  const path = pathFromUrl(url);
  if (!path) return null;

  let state: ReturnType<typeof getStateFromPath>;
  try {
    state = getStateFromPath(path, LINKING_CONFIG);
  } catch {
    return null;
  }
  if (!state) return null;

  let route: any = state.routes[state.routes.length - 1];
  while (route?.state?.routes?.length) {
    const nested = route.state.routes;
    route = nested[nested.length - 1];
  }
  if (!route?.name) return null;
  return { name: route.name, params: route.params };
}
