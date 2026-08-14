import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useListings } from '../../hooks/useListings';
import { useSales } from '../../hooks/useSales';
import { useSaleEvents } from '../../hooks/useSaleEvents';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useFavorites } from '../../hooks/useFavorites';
import { prettyRange } from '../../utils/format';
import { ListingsStackParamList, SaleEvent } from '../../types';
import SaleCard from '../../components/SaleCard';
import ListingTile from '../../components/ListingTile';
import { haversineMeters } from '../../utils/distance';
import {
  countActiveListingsFilters,
  priceBucketToRange,
  useListingsFilters,
} from '../../lib/listingsFilters';

type Nav = NativeStackNavigationProp<ListingsStackParamList>;

const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

type Segment = 'sales' | 'items';

type SalesSort = 'nearest' | 'soonest' | 'newest';
type ListingsSort = 'nearest' | 'newest' | 'price_low' | 'price_high';

const SALES_SORT_LABEL: Record<SalesSort, string> = {
  nearest: 'Nearest',
  soonest: 'Starting soonest',
  newest: 'Recently posted',
};
const LISTINGS_SORT_LABEL: Record<ListingsSort, string> = {
  nearest: 'Nearest',
  newest: 'Recently posted',
  price_low: 'Price: low to high',
  price_high: 'Price: high to low',
};

// Inline keyword match: every word in the query must appear somewhere across
// the provided fields (title, description, categories, …). Case-insensitive.
function matchesQuery(
  parts: (string | null | undefined)[],
  q: string,
): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return query.split(/\s+/).every((t) => hay.includes(t));
}

export default function ListingsScreen() {
  const navigation = useNavigation<Nav>();
  const userLocation = useUserLocation();

  const {
    sales,
    loading: salesLoading,
    error: salesError,
    refetch: refetchSales,
  } = useSales();
  const { events: saleEvents } = useSaleEvents();
  const listingsFilters = useListingsFilters();
  const priceRange = useMemo(
    () => priceBucketToRange(listingsFilters.priceBucket),
    [listingsFilters.priceBucket],
  );
  const {
    listings,
    loading: listingsLoading,
    error: listingsError,
    refetch: refetchListings,
  } = useListings({
    category: null,
    categories: listingsFilters.categories,
    priceMin: priceRange.min,
    priceMax: priceRange.max,
  });
  const { refetch: refetchFavorites } = useFavorites();

  const [segment, setSegment] = useState<Segment>('sales');
  const [query, setQuery] = useState('');
  const [salesSort, setSalesSort] = useState<SalesSort>('nearest');
  const [listingsSort, setListingsSort] = useState<ListingsSort>('nearest');
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const activeFilterCount = countActiveListingsFilters(listingsFilters);

  useFocusEffect(
    useCallback(() => {
      refetchFavorites();
    }, [refetchFavorites]),
  );

  // Distance-sort both data sources so "Nearest" is real.
  const sortedSales = useMemo(() => {
    const dist = (lat: number, lng: number) =>
      userLocation
        ? haversineMeters(
            userLocation.latitude,
            userLocation.longitude,
            lat,
            lng,
          )
        : Number.POSITIVE_INFINITY;
    const out = [...sales];
    switch (salesSort) {
      case 'soonest':
        out.sort((a, b) => a.start_date.localeCompare(b.start_date));
        break;
      case 'newest':
        out.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      case 'nearest':
      default:
        out.sort(
          (a, b) =>
            dist(a.latitude, a.longitude) - dist(b.latitude, b.longitude),
        );
    }
    return out;
  }, [sales, userLocation, salesSort]);

  const sortedListings = useMemo(() => {
    const dist = (lat: number, lng: number) =>
      userLocation
        ? haversineMeters(
            userLocation.latitude,
            userLocation.longitude,
            lat,
            lng,
          )
        : Number.POSITIVE_INFINITY;
    // Apply radius filter client-side. The DB query covers
    // category/price; distance has to happen here because we don't push
    // user coords into the query.
    const maxMeters =
      listingsFilters.radiusMiles != null
        ? listingsFilters.radiusMiles * 1609.34
        : Number.POSITIVE_INFINITY;
    const within = listings.filter(
      (l) => dist(l.pickup_lat, l.pickup_lng) <= maxMeters,
    );
    switch (listingsSort) {
      case 'newest':
        within.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      case 'price_low':
        within.sort((a, b) => a.price - b.price);
        break;
      case 'price_high':
        within.sort((a, b) => b.price - a.price);
        break;
      case 'nearest':
      default:
        within.sort(
          (a, b) =>
            dist(a.pickup_lat, a.pickup_lng) - dist(b.pickup_lat, b.pickup_lng),
        );
    }
    return within;
  }, [listings, userLocation, listingsFilters.radiusMiles, listingsSort]);

  // Inline search filters the current sorted list in place (no modal).
  const filteredSales = useMemo(
    () =>
      query.trim()
        ? sortedSales.filter((s) =>
            matchesQuery(
              [s.title, s.description, s.address, ...(s.categories ?? [])],
              query,
            ),
          )
        : sortedSales,
    [sortedSales, query],
  );
  const filteredListings = useMemo(
    () =>
      query.trim()
        ? sortedListings.filter((l) =>
            matchesQuery([l.title, l.description, ...(l.categories ?? [])], query),
          )
        : sortedListings,
    [sortedListings, query],
  );

  // Neighborhood sales are searchable here too — they don't live in the
  // sales list, so a title match surfaces them as tappable rows on top.
  const matchingEvents = useMemo(
    () =>
      query.trim()
        ? saleEvents.filter((e) => matchesQuery([e.title, e.description], query))
        : [],
    [saleEvents, query],
  );

  const openSortMenu = useCallback(() => {
    if (segment === 'sales') {
      Alert.alert('Sort yard sales', undefined, [
        { text: SALES_SORT_LABEL.nearest, onPress: () => setSalesSort('nearest') },
        { text: SALES_SORT_LABEL.soonest, onPress: () => setSalesSort('soonest') },
        { text: SALES_SORT_LABEL.newest, onPress: () => setSalesSort('newest') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Sort items', undefined, [
        { text: LISTINGS_SORT_LABEL.nearest, onPress: () => setListingsSort('nearest') },
        { text: LISTINGS_SORT_LABEL.newest, onPress: () => setListingsSort('newest') },
        { text: LISTINGS_SORT_LABEL.price_low, onPress: () => setListingsSort('price_low') },
        { text: LISTINGS_SORT_LABEL.price_high, onPress: () => setListingsSort('price_high') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [segment]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F2E8' }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 10,
          backgroundColor: '#F7F2E8',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: '800',
              color: INK,
              letterSpacing: -0.5,
            }}
          >
            Listings
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              onPress={() => navigation.navigate('SavedListings')}
              accessibilityRole="button"
              accessibilityLabel="Saved listings"
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8,
                borderWidth: 1,
                borderColor: HAIRLINE,
              }}
            >
              <Ionicons name="heart-outline" size={18} color={INK} />
            </Pressable>
            {segment === 'items' && (
              <Pressable
                onPress={() => navigation.navigate('ListingsFilter')}
                accessibilityRole="button"
                accessibilityLabel="Filter items"
                style={{
                  height: 36,
                  borderRadius: 12,
                  backgroundColor:
                    activeFilterCount > 0 ? BRAND : '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  paddingHorizontal: 10,
                  marginRight: 8,
                  borderWidth: 1,
                  borderColor:
                    activeFilterCount > 0 ? BRAND : HAIRLINE,
                }}
              >
                <Ionicons
                  name="options-outline"
                  size={16}
                  color={activeFilterCount > 0 ? '#fff' : INK}
                />
                {activeFilterCount > 0 && (
                  <Text
                    style={{
                      marginLeft: 5,
                      fontSize: 12,
                      fontWeight: '700',
                      color: '#fff',
                    }}
                  >
                    {activeFilterCount}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* Inline search — filters the current tab in place (no modal). */}
        <View
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#fff',
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 42,
            borderWidth: 1,
            borderColor: HAIRLINE,
          }}
        >
          <Ionicons name="search-outline" size={18} color={INK_MUTED} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={
              segment === 'sales' ? 'Search yard sales' : 'Search items'
            }
            placeholderTextColor={INK_MUTED}
            returnKeyType="search"
            style={{
              flex: 1,
              marginLeft: 8,
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

        {/* Segmented control */}
        <View
          style={{
            marginTop: 14,
            backgroundColor: '#fff',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: HAIRLINE,
            padding: 4,
            flexDirection: 'row',
          }}
        >
          <SegmentButton
            label={`Yard sales · ${filteredSales.length}`}
            active={segment === 'sales'}
            onPress={() => setSegment('sales')}
          />
          <SegmentButton
            label={`Items · ${filteredListings.length}`}
            active={segment === 'items'}
            onPress={() => setSegment('items')}
          />
        </View>

        {/* Sort row */}
        <View
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 12, color: INK_MUTED }}>
            Sorted by ·{' '}
            {segment === 'sales'
              ? SALES_SORT_LABEL[salesSort]
              : LISTINGS_SORT_LABEL[listingsSort]}
          </Text>
          <Pressable hitSlop={6} onPress={openSortMenu}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: BRAND }}>
                Sort
              </Text>
              <Ionicons name="chevron-down" size={13} color={BRAND} />
            </View>
          </Pressable>
        </View>
      </View>

      {/* Data */}
      {segment === 'sales' ? (
        <FlatList
          key="sales-list"
          data={filteredSales}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
          onRefresh={async () => {
            setPullRefreshing(true);
            await refetchSales();
            setPullRefreshing(false);
          }}
          refreshing={pullRefreshing}
          ListHeaderComponent={
            matchingEvents.length > 0 ? (
              <View style={{ paddingTop: 4 }}>
                {matchingEvents.map((e) => (
                  <EventSearchRow
                    key={e.id}
                    event={e}
                    onPress={() =>
                      navigation.navigate('EventDetail', { eventId: e.id })
                    }
                  />
                ))}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <SaleCard
              sale={item}
              index={index}
              density="comfy"
              userLat={userLocation?.latitude}
              userLng={userLocation?.longitude}
              onPress={() =>
                navigation.navigate('SaleDetail', { saleId: item.id })
              }
            />
          )}
          ListEmptyComponent={
            salesLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator color={BRAND} />
              </View>
            ) : salesError ? (
              <EmptyTab
                title="Couldn’t load yard sales"
                description="Check your connection and try again."
                ctaLabel="Try again"
                onCta={refetchSales}
              />
            ) : query.trim() ? (
              <EmptyTab
                title={`No yard sales match “${query.trim()}”`}
                description="Try a different keyword."
              />
            ) : (
              <EmptyTab
                title="No yard sales near you"
                description="Try widening the area or check back this weekend."
              />
            )
          }
        />
      ) : (
        <FlatList
          key="items-grid"
          data={filteredListings}
          keyExtractor={(l) => l.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: 24,
            gap: 10,
          }}
          onRefresh={refetchListings}
          refreshing={listingsLoading}
          renderItem={({ item }) => (
            <ListingTile
              listing={item}
              userLat={userLocation?.latitude}
              userLng={userLocation?.longitude}
              onPress={() =>
                navigation.navigate('ListingDetail', { listingId: item.id })
              }
            />
          )}
          ListEmptyComponent={
            listingsLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator color={BRAND} />
              </View>
            ) : listingsError ? (
              <EmptyTab
                title="Couldn’t load items"
                description="Check your connection and try again."
                ctaLabel="Try again"
                onCta={refetchListings}
              />
            ) : query.trim() ? (
              <EmptyTab
                title={`No items match “${query.trim()}”`}
                description="Try a different keyword."
              />
            ) : (
              <EmptyTab
                title="No items listed yet"
                description="Be the first to post one."
                ctaLabel="Post an item"
                onCta={() => navigation.navigate('CreateListing')}
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 9,
        borderRadius: 10,
        backgroundColor: active ? BRAND : 'transparent',
        alignItems: 'center',
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: '700',
          color: active ? '#fff' : INK,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyTab({
  title,
  description,
  ctaLabel,
  onCta,
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 60 }}>
      <Ionicons name="basket-outline" size={36} color={INK_MUTED} />
      <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '700', color: INK }}>
        {title}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 13,
          color: INK_MUTED,
          textAlign: 'center',
        }}
      >
        {description}
      </Text>
      {ctaLabel && onCta ? (
        <Pressable
          onPress={onCta}
          style={{
            marginTop: 16,
            backgroundColor: BRAND,
            paddingHorizontal: 20,
            paddingVertical: 11,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function EventSearchRow({
  event,
  onPress,
}: {
  event: SaleEvent;
  onPress: () => void;
}) {
  const count = event.sale_count ?? 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${event.title}`}
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        marginHorizontal: 4,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          backgroundColor: '#E1ECDF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="home" size={22} color={BRAND} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: INK }}>
          {event.title}
        </Text>
        <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 3 }}>
          {`Neighborhood sale · ${prettyRange(event.start_date, event.end_date)} · ${count} ${
            count === 1 ? 'sale' : 'sales'
          }`}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={INK_MUTED}
        style={{ marginRight: 12 }}
      />
    </Pressable>
  );
}
