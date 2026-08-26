import { contentRouteFromUrl } from '../deepLinks';

// Regression coverage for the cold-start deep-link path. React Navigation
// consumes Linking.getInitialURL() the moment NavigationContainer mounts —
// while auth is still loading and the RootStack only registers the Loading
// screen — so the parsed state used to be dropped and cold-start links
// landed on MapHome. The fix replays the launch URL through this mapping
// once MainTabs is mounted; these tests pin the URL → route contract.
describe('contentRouteFromUrl', () => {
  it('maps a trove:// event link to EventDetail with the slug', () => {
    expect(contentRouteFromUrl('trove://event/5a2eacaf')).toEqual({
      name: 'EventDetail',
      params: { slug: '5a2eacaf' },
    });
  });

  it('maps a trove:// sale link to SaleDetail with the saleId', () => {
    expect(contentRouteFromUrl('trove://sale/abc-123')).toEqual({
      name: 'SaleDetail',
      params: { saleId: 'abc-123' },
    });
  });

  it('maps a trove:// listing link to ListingDetail with the listingId', () => {
    expect(contentRouteFromUrl('trove://listing/xyz789')).toEqual({
      name: 'ListingDetail',
      params: { listingId: 'xyz789' },
    });
  });

  it('maps https://trove.sale share links the same as the custom scheme', () => {
    expect(contentRouteFromUrl('https://trove.sale/event/5a2eacaf')).toEqual({
      name: 'EventDetail',
      params: { slug: '5a2eacaf' },
    });
    expect(contentRouteFromUrl('https://trove.sale/sale/abc-123')).toEqual({
      name: 'SaleDetail',
      params: { saleId: 'abc-123' },
    });
  });

  it('handles Expo dev-client URLs (path after /--/)', () => {
    expect(
      contentRouteFromUrl('exp://192.168.1.5:8081/--/event/5a2eacaf'),
    ).toEqual({
      name: 'EventDetail',
      params: { slug: '5a2eacaf' },
    });
  });

  it('keeps the id param when a query string is appended', () => {
    const route = contentRouteFromUrl(
      'https://trove.sale/sale/abc-123?utm_source=share',
    );
    expect(route?.name).toBe('SaleDetail');
    expect(route?.params).toMatchObject({ saleId: 'abc-123' });
  });

  it('returns null for Supabase auth links (handled by authDeepLinks)', () => {
    expect(contentRouteFromUrl('trove://reset-password?code=abc123')).toBeNull();
    expect(
      contentRouteFromUrl('trove://auth-callback#access_token=t&type=recovery'),
    ).toBeNull();
  });

  it('returns null for a bare scheme launch and unmatched paths', () => {
    expect(contentRouteFromUrl('trove://')).toBeNull();
    expect(contentRouteFromUrl('trove://expo-development-client/?url=x')).toBeNull();
    expect(contentRouteFromUrl('not a url')).toBeNull();
  });
});
