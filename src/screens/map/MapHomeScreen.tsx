import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSales } from '../../hooks/useSales';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useLastMapRegion } from '../../hooks/useLastMapRegion';
import { useFavorites } from '../../hooks/useFavorites';
import { MapStackParamList } from '../../types';
import { MapPin } from '../../components/MapPin';
import SaleListCard from '../../components/SaleListCard';
import { IconButton, EmptyState } from '../../components/ui';
import { haversineMeters } from '../../utils/distance';
import { isOpenNow } from '../../utils/saleStatus';

type Nav = NativeStackNavigationProp<MapStackParamList, 'MapHome'>;
type Route = RouteProp<MapStackParamList, 'MapHome'>;

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

type ViewMode = 'map' | 'list';
type SortBy = 'distance' | 'newest' | 'open';

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'distance', label: 'Nearest' },
  { key: 'newest', label: 'Newest' },
  { key: 'open', label: 'Open now' },
];

// Radius options in miles. "0" means no radius filter (show all).
const RADIUS_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100] as const;
type RadiusMiles = typeof RADIUS_OPTIONS[number] | 101; // 101 = "100+"

const CATEGORIES = [
  { label: 'Furniture', value: 'furniture' },
  { label: 'Clothing', value: 'clothing' },
  { label: 'Electronics', value: 'electronics' },
  { label: 'Toys', value: 'toys' },
  { label: 'Tools', value: 'tools' },
  { label: 'Books', value: 'books' },
  { label: 'Kitchen', value: 'kitchen' },
  { label: 'Sports', value: 'sports' },
  { label: 'Antiques', value: 'antiques' },
  { label: 'Other', value: 'other' },
] as const;

interface SearchLocation {
  lat: number;
  lng: number;
  label: string;
}

export default function MapHomeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const initialPanDone = useRef(false);

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [sortBy, setSortBy] = useState<SortBy>('distance');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [postMenuOpen, setPostMenuOpen] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'winding_down' | null>(null);

  // Search state
  const [searchText, setSearchText] = useState('');
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(null);
  const [searching, setSearching] = useState(false);

  // Radius filter (miles). null = no filter.
  const [radiusMiles, setRadiusMiles] = useState<RadiusMiles | null>(null);

  const { sales, loading, refetch } = useSales();
  const { isFavorited, refetch: refetchFavorites } = useFavorites();

  // Re-fetch favorites whenever the Discover screen comes back into focus
  // (e.g. after the user hearts a sale in SaleDetail and navigates back).
  useFocusEffect(
    useCallback(() => {
      refetchFavorites();
    }, [refetchFavorites]),
  );
  const userLocation = useUserLocation();
  const { region: lastRegion, save: saveLastRegion, ready: regionReady } =
    useLastMapRegion();

  const focusLat = route.params?.focusLat;
  const focusLng = route.params?.focusLng;

  // Map pan strategy (same as before)
  useEffect(() => {
    if (!regionReady) return;
    if (initialPanDone.current) return;

    if (focusLat != null && focusLng != null) {
      initialPanDone.current = true;
      setTimeout(() => {
        mapRef.current?.animateToRegion(
          { latitude: focusLat, longitude: focusLng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
          800,
        );
      }, 250);
      navigation.setParams({ focusLat: undefined, focusLng: undefined });
      return;
    }

    if (lastRegion) {
      initialPanDone.current = true;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;

        const last = await Location.getLastKnownPositionAsync({});
        if (!cancelled && last) {
          initialPanDone.current = true;
          mapRef.current?.animateToRegion(
            { latitude: last.coords.latitude, longitude: last.coords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 },
            500,
          );
        }

        const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        initialPanDone.current = true;
        mapRef.current?.animateToRegion(
          { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 },
          800,
        );
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [focusLat, focusLng, navigation, regionReady, lastRegion]);

  // Search: resolve ZIP or city to lat/lng and pan the map
  const handleSearch = useCallback(async () => {
    const query = searchText.trim();
    if (!query) return;
    setSearching(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      let label = query;

      if (/^\d{5}$/.test(query)) {
        // ZIP code via zippopotam.us
        const res = await fetch(`https://api.zippopotam.us/us/${query}`);
        if (res.ok) {
          const data = await res.json();
          const place = data.places?.[0];
          if (place) {
            lat = parseFloat(place.latitude);
            lng = parseFloat(place.longitude);
            label = `${place['place name']}, ${place['state abbreviation']} ${query}`;
          }
        }
      } else {
        // City/address via Nominatim (OpenStreetMap, free, no key)
        const encoded = encodeURIComponent(`${query}, USA`);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
          { headers: { 'Accept-Language': 'en' } },
        );
        if (res.ok) {
          const data = await res.json();
          if (data[0]) {
            lat = parseFloat(data[0].lat);
            lng = parseFloat(data[0].lon);
            label = data[0].display_name?.split(',').slice(0, 2).join(', ') ?? query;
          }
        }
      }

      if (lat !== null && lng !== null) {
        setSearchLocation({ lat, lng, label });
        mapRef.current?.animateToRegion(
          { latitude: lat, longitude: lng, latitudeDelta: 0.1, longitudeDelta: 0.1 },
          800,
        );
      }
    } catch { /* network error — leave current location */ }
    finally { setSearching(false); }
  }, [searchText]);

  // Filter + sort + radius
  const filteredSales = useMemo(() => {
    let result = categoryFilter
      ? sales.filter((s) => s.categories.includes(categoryFilter as any))
      : sales;

    // Radius filter — only active when a search location is pinned
    if (searchLocation && radiusMiles !== null) {
      const limitMeters = (radiusMiles === 101 ? 100 : radiusMiles) * 1609.34;
      result = result.filter(
        (s) =>
          haversineMeters(searchLocation.lat, searchLocation.lng, s.latitude, s.longitude) <=
          limitMeters,
      );
      // 101 = "100+" means >= 100 miles, no upper cap — same as 100 for our purposes
    }

    if (statusFilter) {
      result = result.filter((s) => s.status === statusFilter);
    }

    if (showSavedOnly) {
      result = result.filter((s) => isFavorited(s.id));
    }

    if (viewMode !== 'list') return result;

    const distance = (s: typeof result[number]) =>
      userLocation
        ? haversineMeters(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude)
        : Number.POSITIVE_INFINITY;

    const sorted = [...result];
    if (sortBy === 'distance') {
      sorted.sort((a, b) => distance(a) - distance(b));
    } else if (sortBy === 'newest') {
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (sortBy === 'open') {
      sorted.sort((a, b) => {
        const ao = isOpenNow(a) ? 0 : 1;
        const bo = isOpenNow(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return distance(a) - distance(b);
      });
    }
    return sorted;
  }, [sales, categoryFilter, viewMode, userLocation, sortBy, searchLocation, radiusMiles, statusFilter, showSavedOnly, isFavorited]);

  const openNowCount = useMemo(
    () => filteredSales.filter((s) => isOpenNow(s)).length,
    [filteredSales],
  );

  const goToUserLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    mapRef.current?.animateToRegion(
      { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 },
      800,
    );
  }, []);

  const onRegionChangeComplete = useCallback(
    (region: Region) => { saveLastRegion(region); },
    [saveLastRegion],
  );

  const activeFilterCount =
    (categoryFilter ? 1 : 0) + (radiusMiles !== null ? 1 : 0) + (statusFilter ? 1 : 0);

  return (
    <View style={styles.root}>
      {/* MAP MODE */}
      <View style={[styles.mode, { display: viewMode === 'map' ? 'flex' : 'none' }]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={lastRegion ?? DEFAULT_REGION}
          onRegionChangeComplete={onRegionChangeComplete}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {filteredSales.map((sale) => (
            <Marker
              key={sale.id}
              coordinate={{ latitude: sale.latitude, longitude: sale.longitude }}
              onPress={() => navigation.navigate('SaleDetail', { saleId: sale.id })}
              tracksViewChanges={false}
            >
              <MapPin status={sale.status} favorited={isFavorited(sale.id)} />
            </Marker>
          ))}
        </MapView>

        {/* My-location FAB */}
        <View style={styles.locateWrap}>
          <IconButton
            variant="solid"
            size="lg"
            onPress={goToUserLocation}
            icon={<Ionicons name="locate" size={22} color="#18181B" />}
          />
        </View>
      </View>

      {/* LIST MODE */}
      <View style={[styles.mode, styles.listMode, { display: viewMode === 'list' ? 'flex' : 'none' }]}>
        {/* Saved toggle */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
          <Pressable
            onPress={() => setShowSavedOnly(false)}
            style={[styles.savedToggle, !showSavedOnly && styles.savedToggleActive]}
          >
            <Text style={[styles.savedToggleText, !showSavedOnly && styles.savedToggleTextActive]}>All</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowSavedOnly(true)}
            style={[styles.savedToggle, showSavedOnly && styles.savedToggleActive]}
          >
            <Ionicons name="heart" size={13} color={showSavedOnly ? '#fff' : '#71717A'} />
            <Text style={[styles.savedToggleText, showSavedOnly && styles.savedToggleTextActive]}>Saved</Text>
          </Pressable>
        </View>

        {filteredSales.length > 0 && (
          <View style={styles.sortRow}>
            <Pressable onPress={() => setSortSheetOpen(true)} style={styles.sortPill}>
              <Ionicons name="swap-vertical" size={14} color="#71717A" />
              <Text style={styles.sortPillText}>
                Sort: <Text style={styles.sortPillValue}>
                  {SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? ''}
                </Text>
              </Text>
              <Ionicons name="chevron-down" size={12} color="#71717A" />
            </Pressable>
            <Text style={styles.sortCount}>
              {filteredSales.length} {filteredSales.length === 1 ? 'sale' : 'sales'}
            </Text>
          </View>
        )}

        {filteredSales.length === 0 && !loading ? (
          <EmptyState
            icon={<Ionicons name="pricetag-outline" size={32} color="#2D5F3E" />}
            title="No sales found"
            description={
              categoryFilter || radiusMiles !== null
                ? 'Try adjusting your filters.'
                : "There aren't any active sales right now."
            }
          />
        ) : (
          <FlatList
            data={filteredSales}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#2D5F3E" colors={['#2D5F3E']} />
            }
            renderItem={({ item }) => (
              <SaleListCard
                sale={item}
                userLat={userLocation?.latitude}
                userLng={userLocation?.longitude}
                onPress={() => navigation.navigate('SaleDetail', { saleId: item.id })}
              />
            )}
          />
        )}
      </View>

      {/* ── Floating top bar ── */}
      <View style={[styles.topBarWrap, { top: insets.top }]}>
        {/* Search row */}
        <View style={styles.searchCard}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search-outline" size={16} color="#A1A1AA" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="ZIP code or city…"
              placeholderTextColor="#A1A1AA"
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching ? (
              <ActivityIndicator size="small" color="#2D5F3E" style={{ marginLeft: 4 }} />
            ) : searchText.length > 0 ? (
              <Pressable
                onPress={() => { setSearchText(''); setSearchLocation(null); }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={16} color="#A1A1AA" />
              </Pressable>
            ) : null}
          </View>

          {/* Filter + view toggle */}
          <View style={styles.searchActions}>
            {/* Filter pill */}
            <Pressable
              onPress={() => setFilterSheetOpen(true)}
              style={[styles.filterPill, activeFilterCount > 0 && { backgroundColor: '#2D5F3E' }]}
            >
              <Ionicons name="options-outline" size={15} color={activeFilterCount > 0 ? '#fff' : '#18181B'} />
              <Text style={[styles.filterPillText, activeFilterCount > 0 && { color: '#fff' }]}>
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Text>
            </Pressable>

            {/* View toggle — single button showing the OTHER mode */}
            <Pressable
              onPress={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
              style={styles.viewToggleBtn}
            >
              <Ionicons
                name={viewMode === 'map' ? 'list' : 'map'}
                size={17}
                color="#18181B"
              />
            </Pressable>
          </View>
        </View>

        {/* Location label when a search is active */}
        {searchLocation && (
          <View style={styles.locationPill}>
            <Ionicons name="location" size={12} color="#2D5F3E" />
            <Text style={styles.locationPillText} numberOfLines={1}>
              {searchLocation.label}
              {radiusMiles !== null
                ? ` · within ${radiusMiles === 101 ? '100+' : radiusMiles} mi`
                : ''}
            </Text>
            <Pressable
              onPress={() => { setSearchLocation(null); setSearchText(''); }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={14} color="#A1A1AA" />
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Post (+) FAB ── */}
      <View style={[styles.fabWrap, { bottom: 32 }]}>
        <Pressable
          onPress={() => setPostMenuOpen(true)}
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel="Post a sale or listing"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      </View>

      {/* ── Post menu sheet ── */}
      <Modal
        visible={postMenuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPostMenuOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setPostMenuOpen(false)} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetGrabber} />
          <Text style={styles.sheetTitle}>What do you want to post?</Text>
          <Pressable
            onPress={() => {
              setPostMenuOpen(false);
              (navigation as any).navigate('Profile', { screen: 'CreateSale' });
            }}
            style={styles.postRow}
          >
            <View style={[styles.postIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="pricetag" size={22} color="#2D5F3E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.postRowLabel}>Yard Sale</Text>
              <Text style={styles.postRowDetail}>Post a sale at your address with dates and times</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#D4D4D8" />
          </Pressable>
          <Pressable
            onPress={() => {
              setPostMenuOpen(false);
              (navigation as any).navigate('Profile', { screen: 'CreateListing' });
            }}
            style={styles.postRow}
          >
            <View style={[styles.postIcon, { backgroundColor: '#FEF9C3' }]}>
              <Ionicons name="storefront" size={22} color="#854D0E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.postRowLabel}>Individual Listing</Text>
              <Text style={styles.postRowDetail}>Sell a single item with photos and a price</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#D4D4D8" />
          </Pressable>
        </View>
      </Modal>

      {/* ── Filter sheet ── */}
      <Modal
        visible={filterSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setFilterSheetOpen(false)} />
        <View style={[styles.sheetCard, { paddingBottom: 44 }]}>
          <View style={styles.sheetGrabber} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={styles.sheetTitle}>Filters</Text>
            {(radiusMiles !== null || categoryFilter || statusFilter) && (
              <Pressable
                onPress={() => { setRadiusMiles(null); setCategoryFilter(null); setStatusFilter(null); }}
                hitSlop={8}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#2D5F3E' }}>Clear all</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.filterSectionLabel}>Search radius</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {([...RADIUS_OPTIONS, 101] as (RadiusMiles)[]).map((miles) => {
              const label = miles === 101 ? '100+ mi' : `${miles} mi`;
              const active = radiusMiles === miles;
              return (
                <Pressable
                  key={miles}
                  onPress={() => setRadiusMiles(active ? null : miles)}
                  style={[styles.radiusChip, active && styles.radiusChipActive]}
                >
                  <Text style={[styles.radiusChipText, active && styles.radiusChipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.filterSectionLabel}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {CATEGORIES.map(({ label, value }) => {
              const active = categoryFilter === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setCategoryFilter(active ? null : value)}
                  style={[styles.radiusChip, active && styles.radiusChipActive]}
                >
                  <Text style={[styles.radiusChipText, active && styles.radiusChipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.filterSectionLabel}>Status</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {[
              { key: 'active' as const, label: 'Active' },
              { key: 'winding_down' as const, label: 'Winding Down' },
            ].map(({ key, label }) => {
              const active = statusFilter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setStatusFilter(active ? null : key)}
                  style={[styles.radiusChip, active && styles.radiusChipActive]}
                >
                  <Text style={[styles.radiusChipText, active && styles.radiusChipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* ── Sort sheet ── */}
      <Modal
        visible={sortSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortSheetOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setSortSheetOpen(false)} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetGrabber} />
          <Text style={styles.sheetTitle}>Sort by</Text>
          {SORT_OPTIONS.map((opt) => {
            const active = sortBy === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => { setSortBy(opt.key); setSortSheetOpen(false); }}
                style={styles.sheetRow}
              >
                <Text style={[styles.sheetRowText, active && styles.sheetRowTextActive]}>
                  {opt.label}
                </Text>
                {active && <Ionicons name="checkmark" size={20} color="#2D5F3E" />}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const BRAND = '#2D5F3E';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF9' },
  mode: { flex: 1 },
  listMode: { paddingTop: 148 },
  map: { flex: 1 },
  locateWrap: {
    position: 'absolute',
    right: 16,
    bottom: 100,
    pointerEvents: 'box-none',
    gap: 10,
    alignItems: 'flex-end',
  },
  // ── Top bar
  topBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    pointerEvents: 'box-none',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#18181B',
    padding: 0,
    fontWeight: '400',
  },
  searchActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F4F4F5',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181B',
  },
  viewToggleBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#F4F4F5',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    maxWidth: '90%',
  },
  locationPillText: {
    flex: 1,
    fontSize: 12,
    color: '#18181B',
    fontWeight: '500',
  },
  // ── FAB
  fabWrap: {
    position: 'absolute',
    right: 16,
    pointerEvents: 'box-none',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  // ── Sort / List
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F4F4F5',
  },
  sortPillText: { fontSize: 12, color: '#71717A' },
  sortPillValue: { fontWeight: '700', color: '#18181B' },
  sortCount: { fontSize: 12, color: '#A1A1AA', fontWeight: '500' },
  // ── Sheets
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 36,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -2 },
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E4E7',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A1A1AA',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F4F4F5',
  },
  sheetRowText: { fontSize: 16, color: '#27272A' },
  sheetRowTextActive: { color: BRAND, fontWeight: '700' },
  // ── Post menu
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F4F4F5',
    gap: 14,
  },
  postIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postRowLabel: { fontSize: 16, fontWeight: '600', color: '#18181B' },
  postRowDetail: { fontSize: 12, color: '#71717A', marginTop: 2 },
  // ── Filter chips
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A1A1AA',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  radiusChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  radiusChipActive: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  radiusChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#52525B',
  },
  radiusChipTextActive: {
    color: '#fff',
  },
  savedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  savedToggleActive: {
    backgroundColor: '#2D5F3E',
    borderColor: '#2D5F3E',
  },
  savedToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#52525B',
  },
  savedToggleTextActive: {
    color: '#fff',
  },
});
