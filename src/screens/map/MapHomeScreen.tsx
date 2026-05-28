import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView as RNScrollView,
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
import { IconButton, EmptyState, CategoryPicker } from '../../components/ui';
import { ItemCategory } from '../../types';
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
const RADIUS_OPTIONS = [5, 15, 25, 50, 100] as const;
type RadiusMiles = typeof RADIUS_OPTIONS[number];

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

  const [categoryFilter, setCategoryFilter] = useState<ItemCategory[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [sortBy, setSortBy] = useState<SortBy>('distance');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [postMenuOpen, setPostMenuOpen] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'winding_down' | null>(null);

  // Route-planner state
  const [routeMode, setRouteMode] = useState(false);
  const [routeSales, setRouteSales] = useState<typeof sales[number][]>([]);
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);

  // Search state
  const [searchText, setSearchText] = useState('');
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(null);
  const [searching, setSearching] = useState(false);

  // Address autocomplete state
  const [suggestions, setSuggestions] = useState<SearchLocation[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter sheet location input (pre-geocode text, local to filter sheet)
  const [filterLocationText, setFilterLocationText] = useState('');
  const [filterLocationSearching, setFilterLocationSearching] = useState(false);

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
      // A saved region near US center was written on a first launch before
      // the fix above — treat it as "no saved region" so we still pan to
      // the user's actual location instead of staying stuck there.
      const isStaleDefault =
        Math.abs(lastRegion.latitude - DEFAULT_REGION.latitude) < 1 &&
        Math.abs(lastRegion.longitude - DEFAULT_REGION.longitude) < 1;
      if (!isStaleDefault) {
        initialPanDone.current = true;
        return;
      }
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

  // Fallback: if useUserLocation resolves AFTER the initial-pan effect
  // above already bailed (permission was 'undetermined' when the OS
  // dialog was still showing, or getCurrentPositionAsync was too slow
  // to win the race), pan as soon as we get a fix. Without this, fresh
  // logins on a new install stay parked on DEFAULT_REGION (US center)
  // until the user manually pans.
  //
  // Only fires when we haven't already panned somewhere meaningful —
  // we don't want to yank the user back to "current location" if they
  // already opened the app at their saved region or just navigated in
  // with focus coords from a posted sale.
  useEffect(() => {
    if (!userLocation) return;
    if (initialPanDone.current) return;
    if (focusLat != null && focusLng != null) return;
    if (lastRegion) return;
    initialPanDone.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      800,
    );
  }, [userLocation, focusLat, focusLng, lastRegion]);

  // ── Route planner helpers ─────────────────────────────────────────────────

  const toggleRouteMode = useCallback(() => {
    setRouteMode((on) => {
      if (on) {
        // Turning off — clear any pending route
        setRouteSales([]);
        setRouteSheetOpen(false);
      }
      return !on;
    });
  }, []);

  const toggleSaleInRoute = useCallback((sale: typeof sales[number]) => {
    setRouteSales((prev) => {
      const already = prev.some((s) => s.id === sale.id);
      return already ? prev.filter((s) => s.id !== sale.id) : [...prev, sale];
    });
  }, [sales]);

  // Nearest-neighbour heuristic: always go to the closest unvisited stop.
  const computeOptimizedRoute = useCallback(
    (stops: typeof sales[number][]) => {
      if (stops.length <= 1) return [...stops];
      const remaining = [...stops];
      const result: typeof stops = [];
      let curLat = userLocation?.latitude ?? stops[0].latitude;
      let curLng = userLocation?.longitude ?? stops[0].longitude;
      while (remaining.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const d = haversineMeters(curLat, curLng, remaining[i].latitude, remaining[i].longitude);
          if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
        }
        result.push(remaining[nearestIdx]);
        curLat = remaining[nearestIdx].latitude;
        curLng = remaining[nearestIdx].longitude;
        remaining.splice(nearestIdx, 1);
      }
      return result;
    },
    [userLocation],
  );

  // Build a maps deep-link and open it.
  //   iOS + 1 stop  → Apple Maps (native, no install required)
  //   everything else → Google Maps web URL (works in browser or app)
  const handleGetDirections = useCallback(async () => {
    if (routeSales.length === 0) return;
    const ordered = computeOptimizedRoute(routeSales);
    const last = ordered[ordered.length - 1];
    const destination = `${last.latitude},${last.longitude}`;

    if (Platform.OS === 'ios' && ordered.length === 1) {
      await Linking.openURL(`maps://?daddr=${destination}`);
      return;
    }

    // Google Maps — supports multi-stop waypoints on both platforms
    const middle = ordered.slice(0, -1);
    const waypoints = middle.map((s) => `${s.latitude},${s.longitude}`).join('|');
    let url = 'https://www.google.com/maps/dir/?api=1';
    if (userLocation) {
      url += `&origin=${userLocation.latitude},${userLocation.longitude}`;
    }
    url += `&destination=${encodeURIComponent(destination)}`;
    if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
    url += '&travelmode=driving';
    await Linking.openURL(url);
  }, [routeSales, computeOptimizedRoute, userLocation]);

  // The optimized display order for the route sheet (recomputed when sheet opens).
  const optimizedRoute = useMemo(
    () => (routeSheetOpen ? computeOptimizedRoute(routeSales) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeSheetOpen, routeSales.map((s) => s.id).join(','), computeOptimizedRoute],
  );

  // Quick set lookup for "is this sale in the route?" used by pins + list cards.
  const routeIds = useMemo(
    () => new Set(routeSales.map((s) => s.id)),
    [routeSales],
  );

  // ── Address autocomplete ──────────────────────────────────────────────────

  // Fetch address suggestions from Nominatim as user types (debounced 400 ms)
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 3 || /^\d{5}$/.test(query.trim())) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const encoded = encodeURIComponent(`${query.trim()}, USA`);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5&countrycodes=us`,
        { headers: { 'Accept-Language': 'en' } },
      );
      if (res.ok) {
        const data = await res.json();
        const mapped: SearchLocation[] = (data as any[]).map((r) => ({
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          label: (r.display_name as string).split(',').slice(0, 3).join(',').trim(),
        }));
        setSuggestions(mapped);
        setShowSuggestions(mapped.length > 0);
      }
    } catch {
      // network error — leave dropdown as-is
    }
  }, []);

  // User taps a suggestion — pin location, pan map, dismiss dropdown
  const handleSelectSuggestion = useCallback((s: SearchLocation) => {
    setSearchText(s.label);
    setSearchLocation(s);
    setSuggestions([]);
    setShowSuggestions(false);
    mapRef.current?.animateToRegion(
      { latitude: s.lat, longitude: s.lng, latitudeDelta: 0.1, longitudeDelta: 0.1 },
      800,
    );
  }, []);

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

  // Filter sheet location search
  const handleFilterLocationSearch = useCallback(async () => {
    const query = filterLocationText.trim();
    if (!query) return;
    setFilterLocationSearching(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      let label = query;

      if (/^\d{5}$/.test(query)) {
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
        setSearchText(label);
        mapRef.current?.animateToRegion(
          { latitude: lat, longitude: lng, latitudeDelta: 0.1, longitudeDelta: 0.1 },
          800,
        );
      }
    } catch { /* network error */ }
    finally { setFilterLocationSearching(false); }
  }, [filterLocationText]);

  const handleFilterUseMyLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    try {
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;
      const label = 'Current location';
      setSearchLocation({ lat: latitude, lng: longitude, label });
      setSearchText(label);
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        800,
      );
    } catch { /* ignore */ }
  }, []);

  // Filter + sort + radius
  const filteredSales = useMemo(() => {
    let result = categoryFilter.length > 0
      ? sales.filter((s) => categoryFilter.some((c) => s.categories.includes(c)))
      : sales;

    // Radius filter — only active when a search location is pinned
    if (searchLocation && radiusMiles !== null) {
      const limitMeters = radiusMiles * 1609.34;
      result = result.filter(
        (s) =>
          haversineMeters(searchLocation.lat, searchLocation.lng, s.latitude, s.longitude) <=
          limitMeters,
      );
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, categoryFilter.join(','), viewMode, userLocation, sortBy, searchLocation, radiusMiles, statusFilter, showSavedOnly, isFavorited]);

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
    (region: Region) => {
      // Don't persist the US-geographic-center default. It gets fired on
      // first render before the user has actually viewed any real location,
      // and saving it would lock every subsequent open at "middle of nowhere"
      // until the user manually pans away.
      const isDefault =
        Math.abs(region.latitude - DEFAULT_REGION.latitude) < 1 &&
        Math.abs(region.longitude - DEFAULT_REGION.longitude) < 1;
      if (isDefault) return;
      saveLastRegion(region);
    },
    [saveLastRegion],
  );

  const activeFilterCount =
    (categoryFilter.length > 0 ? 1 : 0) + (searchLocation !== null ? 1 : 0) + (statusFilter ? 1 : 0);

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
              onPress={() => {
                if (routeMode) {
                  toggleSaleInRoute(sale);
                } else {
                  navigation.navigate('SaleDetail', { saleId: sale.id });
                }
              }}
              // tracksViewChanges must be true in route mode so pin color
              // updates (selected ↔ unselected) are reflected natively.
              tracksViewChanges={routeMode}
            >
              <MapPin
                status={sale.status}
                favorited={isFavorited(sale.id)}
                inRoute={routeMode && routeIds.has(sale.id)}
              />
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
              categoryFilter.length > 0 || radiusMiles !== null
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
                onPress={() => {
                  if (!routeMode) navigation.navigate('SaleDetail', { saleId: item.id });
                }}
                inRoute={routeMode ? routeIds.has(item.id) : undefined}
                onRouteToggle={routeMode ? () => toggleSaleInRoute(item) : undefined}
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
              placeholder="Address, ZIP, or city…"
              placeholderTextColor="#A1A1AA"
              value={searchText}
              onChangeText={(text) => {
                setSearchText(text);
                // Debounce autocomplete — fires 400 ms after the user stops typing
                if (suggestDebounce.current) clearTimeout(suggestDebounce.current);
                if (text.trim().length >= 3) {
                  suggestDebounce.current = setTimeout(() => fetchSuggestions(text), 400);
                } else {
                  setSuggestions([]);
                  setShowSuggestions(false);
                }
              }}
              returnKeyType="search"
              onSubmitEditing={() => {
                setSuggestions([]);
                setShowSuggestions(false);
                handleSearch();
              }}
              onBlur={() => {
                // Small delay so a tap on a suggestion row registers first
                setTimeout(() => { setSuggestions([]); setShowSuggestions(false); }, 150);
              }}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching ? (
              <ActivityIndicator size="small" color="#2D5F3E" style={{ marginLeft: 4 }} />
            ) : searchText.length > 0 ? (
              <Pressable
                onPress={() => { setSearchText(''); setSearchLocation(null); setSuggestions([]); setShowSuggestions(false); }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={16} color="#A1A1AA" />
              </Pressable>
            ) : null}
          </View>

          {/* Filter + view toggle + route planner */}
          <View style={styles.searchActions}>
            {/* Filter pill — green when any filter is active, no count shown */}
            <Pressable
              onPress={() => setFilterSheetOpen(true)}
              style={[styles.filterPill, activeFilterCount > 0 && { backgroundColor: '#2D5F3E' }]}
            >
              <Ionicons name="options-outline" size={15} color={activeFilterCount > 0 ? '#fff' : '#18181B'} />
              <Text style={[styles.filterPillText, activeFilterCount > 0 && { color: '#fff' }]}>
                Filters
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

            {/* Route planner toggle — indigo when active */}
            <Pressable
              onPress={toggleRouteMode}
              style={[styles.viewToggleBtn, routeMode && { backgroundColor: '#4F46E5' }]}
            >
              <Ionicons
                name="navigate"
                size={17}
                color={routeMode ? '#fff' : '#18181B'}
              />
            </Pressable>
          </View>
        </View>

        {/* Address autocomplete dropdown — shown while user is typing */}
        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionsCard}>
            {suggestions.map((s, i) => (
              <Pressable
                key={i}
                onPress={() => handleSelectSuggestion(s)}
                style={[styles.suggestionRow, i < suggestions.length - 1 && styles.suggestionBorder]}
              >
                <Ionicons name="location-outline" size={14} color="#71717A" style={{ marginRight: 8 }} />
                <Text style={styles.suggestionText} numberOfLines={2}>{s.label}</Text>
              </Pressable>
            ))}
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
        <View style={[styles.sheetCard, { paddingBottom: 44, maxHeight: '80%' }]}>
          <View style={styles.sheetGrabber} />
          <RNScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={styles.sheetTitle}>Filters</Text>
            {(radiusMiles !== null || categoryFilter.length > 0 || statusFilter || searchLocation) && (
              <Pressable
                onPress={() => {
                  setRadiusMiles(null);
                  setCategoryFilter([]);
                  setStatusFilter(null);
                  setSearchLocation(null);
                  setSearchText('');
                  setFilterLocationText('');
                }}
                hitSlop={8}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#2D5F3E' }}>Clear all</Text>
              </Pressable>
            )}
          </View>

          {/* Location */}
          <Text style={styles.filterSectionLabel}>Location</Text>
          <View style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F4F5', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 8 }}>
              <Ionicons name="search-outline" size={16} color="#A1A1AA" />
              <TextInput
                style={{ flex: 1, fontSize: 15, color: '#18181B', padding: 0 }}
                placeholder="City, state, or ZIP code"
                placeholderTextColor="#A1A1AA"
                value={filterLocationText}
                onChangeText={setFilterLocationText}
                returnKeyType="search"
                onSubmitEditing={handleFilterLocationSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {filterLocationSearching && <ActivityIndicator size="small" color="#2D5F3E" />}
            </View>
            <Pressable onPress={handleFilterUseMyLocation} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}>
              <Ionicons name="locate-outline" size={14} color="#2D5F3E" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#2D5F3E' }}>Use my current location</Text>
            </Pressable>
            {searchLocation && (
              <Text style={{ fontSize: 12, color: '#71717A', marginTop: 4 }}>
                📍 {searchLocation.label}
              </Text>
            )}
          </View>

          {/* Distance */}
          <Text style={styles.filterSectionLabel}>Distance</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {[5, 15, 25, 50, 100].map((miles) => {
              const active = radiusMiles === miles;
              return (
                <Pressable
                  key={miles}
                  onPress={() => setRadiusMiles(active ? null : miles as RadiusMiles)}
                  style={[styles.radiusChip, active && styles.radiusChipActive]}
                >
                  <Text style={[styles.radiusChipText, active && styles.radiusChipTextActive]}>{miles} mi</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.filterSectionLabel}>Category</Text>
          <View style={{ marginBottom: 20 }}>
            <CategoryPicker selected={categoryFilter} onChange={setCategoryFilter} />
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
          </RNScrollView>

          {/* Footer — always visible regardless of scroll position */}
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 12 }}>
            <Pressable
              onPress={() => {
                setRadiusMiles(null);
                setCategoryFilter([]);
                setStatusFilter(null);
                setSearchLocation(null);
                setSearchText('');
                setFilterLocationText('');
              }}
              style={{
                flex: 1,
                alignItems: 'center',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#E4E4E7',
                backgroundColor: '#fff',
                paddingVertical: 14,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#52525B' }}>Reset</Text>
            </Pressable>
            <Pressable
              onPress={() => setFilterSheetOpen(false)}
              style={{
                flex: 1,
                alignItems: 'center',
                borderRadius: 16,
                backgroundColor: '#2D5F3E',
                paddingVertical: 14,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Show Results</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Route planner — floating banner + sheet ── */}
      {routeMode && routeSales.length > 0 && (
        <Pressable
          onPress={() => setRouteSheetOpen(true)}
          style={[styles.routeBanner, { bottom: 108 }]}
        >
          <Ionicons name="navigate" size={16} color="#fff" />
          <Text style={styles.routeBannerText}>
            {routeSales.length} {routeSales.length === 1 ? 'stop' : 'stops'} — View Route
          </Text>
          <Ionicons name="chevron-up" size={14} color="#fff" />
        </Pressable>
      )}

      <Modal
        visible={routeSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRouteSheetOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setRouteSheetOpen(false)} />
        <View style={[styles.sheetCard, { paddingBottom: 44, maxHeight: '70%' }]}>
          <View style={styles.sheetGrabber} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={styles.sheetTitle}>
              Route Plan · {optimizedRoute.length} {optimizedRoute.length === 1 ? 'stop' : 'stops'}
            </Text>
            <Pressable
              onPress={() => { setRouteSales([]); setRouteSheetOpen(false); setRouteMode(false); }}
              hitSlop={8}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444' }}>Clear</Text>
            </Pressable>
          </View>

          <RNScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {optimizedRoute.map((sale, idx) => {
              const prevLat = idx === 0
                ? (userLocation?.latitude ?? sale.latitude)
                : optimizedRoute[idx - 1].latitude;
              const prevLng = idx === 0
                ? (userLocation?.longitude ?? sale.longitude)
                : optimizedRoute[idx - 1].longitude;
              const legDist = haversineMeters(prevLat, prevLng, sale.latitude, sale.longitude);
              const legMiles = (legDist / 1609.34).toFixed(1);

              return (
                <View key={sale.id}>
                  {/* Leg distance connector */}
                  {idx > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingVertical: 4, gap: 6 }}>
                      <View style={{ width: 2, height: 16, backgroundColor: '#E4E4E7', borderRadius: 1 }} />
                      <Text style={{ fontSize: 11, color: '#A1A1AA' }}>{legMiles} mi</Text>
                    </View>
                  )}
                  <View style={styles.routeStopRow}>
                    {/* Step number bubble */}
                    <View style={styles.routeStepBubble}>
                      <Text style={styles.routeStepNum}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#18181B' }} numberOfLines={1}>
                        {sale.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#71717A', marginTop: 2 }} numberOfLines={1}>
                        {sale.address}
                      </Text>
                    </View>
                    <Pressable onPress={() => toggleSaleInRoute(sale)} hitSlop={8}>
                      <Ionicons name="close-circle-outline" size={20} color="#A1A1AA" />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </RNScrollView>

          {/* Note for multi-stop iOS */}
          {Platform.OS === 'ios' && optimizedRoute.length > 1 && (
            <Text style={{ fontSize: 11, color: '#A1A1AA', textAlign: 'center', marginBottom: 10 }}>
              Multi-stop routes open in Google Maps
            </Text>
          )}

          <Pressable onPress={handleGetDirections} style={styles.routeDirectionsBtn}>
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={styles.routeDirectionsBtnText}>Get Directions</Text>
          </Pressable>
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
  // ── Address autocomplete dropdown
  suggestionsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F4F4F5',
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#18181B',
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
  // ── Route planner
  routeBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  routeBannerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  routeStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F4F4F5',
  },
  routeStepBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeStepNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  routeDirectionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 16,
    paddingVertical: 14,
    gap: 8,
  },
  routeDirectionsBtnText: {
    fontSize: 15,
    fontWeight: '700',
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
