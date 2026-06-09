import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';

import { useSales } from '../../hooks/useSales';
import { useListings } from '../../hooks/useListings';
import { useUserLocation } from '../../hooks/useUserLocation';
import { Sale, Listing } from '../../types';
import { formatDistanceMiles, haversineMeters } from '../../utils/distance';
import { isOpenNow } from '../../utils/saleStatus';
import { PLACEHOLDER_BLURHASH, transformedImageUrl } from '../../lib/imageUrl';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

type SaleResult = { kind: 'sale'; data: Sale; score: number };
type ListingResult = { kind: 'listing'; data: Listing; score: number };
type Result = SaleResult | ListingResult;

/**
 * Cross-content search modal. Searches sales + listings simultaneously
 * by matching the query against title, description, address, and
 * category labels. Sorted by relevance (score), then distance.
 *
 * Routes:
 * - sale → Map stack's SaleDetail
 * - listing → Listings stack's ListingDetail
 *
 * We rely on `useNavigation()` and use react-navigation's parent-stack
 * lookup to jump to the correct route from either stack. The screen is
 * registered in both Map and Listings stacks so the user can open it
 * from either tab without losing tab context.
 */
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const inputRef = useRef<TextInput>(null);

  const { sales } = useSales();
  const { listings } = useListings({
    category: null,
    priceMin: null,
    priceMax: null,
  });
  const userLocation = useUserLocation();

  const [query, setQuery] = useState('');

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const tokens = q.split(/\s+/).filter(Boolean);

    const scoreHit = (haystack: string): number => {
      const lower = haystack.toLowerCase();
      let s = 0;
      for (const t of tokens) {
        const idx = lower.indexOf(t);
        if (idx === -1) return 0;
        // Title-position bonus + token weight.
        s += 10 - Math.min(idx, 10);
      }
      return s;
    };

    const dist = (lat: number, lng: number) =>
      userLocation
        ? haversineMeters(
            userLocation.latitude,
            userLocation.longitude,
            lat,
            lng,
          )
        : Number.POSITIVE_INFINITY;

    const saleResults: SaleResult[] = [];
    for (const s of sales) {
      const haystack = [
        s.title,
        s.description ?? '',
        s.address ?? '',
        ...(s.categories ?? []),
      ].join(' ');
      const score = scoreHit(haystack);
      if (score > 0) saleResults.push({ kind: 'sale', data: s, score });
    }

    const listingResults: ListingResult[] = [];
    for (const l of listings) {
      const haystack = [
        l.title,
        l.description ?? '',
        ...(l.categories ?? []),
      ].join(' ');
      const score = scoreHit(haystack);
      if (score > 0) listingResults.push({ kind: 'listing', data: l, score });
    }

    return [...saleResults, ...listingResults].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da =
        a.kind === 'sale'
          ? dist(a.data.latitude, a.data.longitude)
          : dist(a.data.pickup_lat, a.data.pickup_lng);
      const db =
        b.kind === 'sale'
          ? dist(b.data.latitude, b.data.longitude)
          : dist(b.data.pickup_lat, b.data.pickup_lng);
      return da - db;
    });
  }, [query, sales, listings, userLocation]);

  const handleSelect = (r: Result) => {
    Keyboard.dismiss();
    // First pop the search modal so the user lands on the destination
    // cleanly without the modal hanging in the back stack.
    navigation.goBack();
    // Defer the next navigate so goBack's transition can settle on iOS.
    requestAnimationFrame(() => {
      // Walk up to the tab navigator so we can jump into the right stack
      // regardless of which tab the search was opened from. Map and
      // Listings stacks both register the relevant detail routes.
      let nav = navigation;
      while (nav.getParent?.()) nav = nav.getParent();
      if (r.kind === 'sale') {
        nav.navigate('Main', {
          screen: 'Map',
          params: {
            screen: 'SaleDetail',
            params: { saleId: r.data.id },
          },
        });
      } else {
        nav.navigate('Main', {
          screen: 'Listings',
          params: {
            screen: 'ListingDetail',
            params: { listingId: r.data.id },
          },
        });
      }
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      {/* Search bar */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 12,
          paddingBottom: 10,
          backgroundColor: BONE,
          borderBottomWidth: 1,
          borderBottomColor: HAIRLINE,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#fff',
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: HAIRLINE,
          }}
        >
          <Ionicons name="search-outline" size={18} color={INK_SOFT} />
          <TextInput
            ref={inputRef}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search sales and items"
            placeholderTextColor={INK_MUTED}
            returnKeyType="search"
            style={{
              flex: 1,
              marginLeft: 10,
              fontSize: 15,
              color: INK,
              padding: 0,
            }}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={INK_MUTED} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => navigation.goBack()}
          style={{ marginTop: 8, alignSelf: 'flex-end' }}
          hitSlop={10}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: BRAND }}>
            Cancel
          </Text>
        </Pressable>
      </View>

      {/* Results */}
      {query.trim().length < 2 ? (
        <EmptyHint />
      ) : results.length === 0 ? (
        <NoMatches query={query} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) =>
            `${r.kind}-${r.kind === 'sale' ? r.data.id : r.data.id}`
          }
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            paddingBottom: insets.bottom + 24,
          }}
          renderItem={({ item }) => (
            <ResultRow
              result={item}
              userLat={userLocation?.latitude}
              userLng={userLocation?.longitude}
              onPress={() => handleSelect(item)}
            />
          )}
        />
      )}
    </View>
  );
}

function ResultRow({
  result,
  userLat,
  userLng,
  onPress,
}: {
  result: Result;
  userLat?: number;
  userLng?: number;
  onPress: () => void;
}) {
  if (result.kind === 'sale') {
    const sale = result.data;
    const open = isOpenNow(sale);
    const firstImage = sale.media?.find((m) => m.type === 'image');
    const thumb = transformedImageUrl(firstImage?.url, {
      width: 120,
      height: 120,
      resize: 'cover',
      quality: 75,
    });
    const dist =
      userLat != null && userLng != null
        ? haversineMeters(userLat, userLng, sale.latitude, sale.longitude)
        : null;
    return (
      <Pressable onPress={onPress} style={rowStyle}>
        <Thumb uri={thumb} fallback="basket-outline" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={kindLabel}>YARD SALE</Text>
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 99,
                marginLeft: 8,
                marginRight: 5,
                backgroundColor: open ? BRAND : INK_MUTED,
              }}
            />
            <Text style={{ fontSize: 10, fontWeight: '600', color: INK_MUTED }}>
              {open ? 'OPEN NOW' : 'CLOSED'}
            </Text>
          </View>
          <Text numberOfLines={1} style={titleStyle}>
            {sale.title}
          </Text>
          <Text numberOfLines={1} style={metaStyle}>
            {sale.address ?? ''}
            {dist != null ? ` · ${formatDistanceMiles(dist)}` : ''}
          </Text>
        </View>
      </Pressable>
    );
  }
  const listing = result.data;
  const firstImage = listing.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 120,
    height: 120,
    resize: 'cover',
    quality: 75,
  });
  const dist =
    userLat != null && userLng != null
      ? haversineMeters(userLat, userLng, listing.pickup_lat, listing.pickup_lng)
      : null;
  return (
    <Pressable onPress={onPress} style={rowStyle}>
      <Thumb uri={thumb} fallback="pricetag-outline" />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={kindLabel}>ITEM</Text>
        <Text numberOfLines={1} style={titleStyle}>
          {listing.title}
        </Text>
        <Text numberOfLines={1} style={metaStyle}>
          ${listing.price.toFixed(0)}
          {dist != null ? ` · ${formatDistanceMiles(dist)}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function Thumb({
  uri,
  fallback,
}: {
  uri: string | null | undefined;
  fallback: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 10,
        backgroundColor: '#E1ECDF',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <Ionicons name={fallback} size={22} color={BRAND} />
      )}
    </View>
  );
}

function EmptyHint() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        paddingTop: 80,
        paddingHorizontal: 24,
      }}
    >
      <Ionicons name="search-outline" size={36} color={INK_MUTED} />
      <Text
        style={{
          marginTop: 12,
          fontSize: 15,
          fontWeight: '700',
          color: INK,
        }}
      >
        Search sales and items
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 13,
          color: INK_MUTED,
          textAlign: 'center',
        }}
      >
        Try a title, neighborhood, or category like “furniture” or “tools”.
      </Text>
    </View>
  );
}

function NoMatches({ query }: { query: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        paddingTop: 80,
        paddingHorizontal: 24,
      }}
    >
      <Ionicons name="search-outline" size={36} color={INK_MUTED} />
      <Text
        style={{
          marginTop: 12,
          fontSize: 15,
          fontWeight: '700',
          color: INK,
        }}
      >
        Nothing matches “{query}”
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 13,
          color: INK_MUTED,
          textAlign: 'center',
        }}
      >
        Try a shorter or different keyword.
      </Text>
    </View>
  );
}

const rowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  backgroundColor: '#fff',
  borderRadius: 14,
  padding: 10,
  marginVertical: 4,
  borderWidth: 1,
  borderColor: HAIRLINE,
};

const kindLabel = {
  fontSize: 10,
  fontWeight: '700' as const,
  color: BRAND,
  letterSpacing: 0.5,
};

const titleStyle = {
  marginTop: 2,
  fontSize: 14,
  fontWeight: '700' as const,
  color: INK,
};

const metaStyle = {
  marginTop: 2,
  fontSize: 12,
  fontWeight: '500' as const,
  color: INK_MUTED,
};
