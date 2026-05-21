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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RNMaps, { Marker, Region } from 'react-native-maps';
import MapView from 'react-native-map-clustering';
import * as Location from 'expo-location';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSales } from '../../hooks/useSales';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useLastMapRegion } from '../../hooks/useLastMapRegion';
import { MapStackParamList } from '../../types';
import FilterBar from '../../components/FilterBar';
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

export default function MapHomeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  // react-native-map-clustering wraps react-native-maps' MapView and
  // forwards its instance — type the ref as RNMaps to expose
  // animateToRegion + friends.
  const mapRef = useRef<RNMaps>(null);
  const initialPanDone = useRef(false);
  const [mapBounds, setMapBounds] = useState<
    | {
        minLat: number;
        maxLat: number;
        minLng: number;
        maxLng: number;
      }
    | undefined
  >(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  // List-mode sort. Persisted across viewMode toggles within a session.
  const [sortBy, setSortBy] = useState<SortBy>('distance');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  // In list mode we want ALL active sales (not bounded). In map mode the
  // bounds filter is useful so we don't pull the world.
  const { sales, loading, refetch } = useSales(
    viewMode === 'map' ? mapBounds : undefined,
  );
  const userLocation = useUserLocation();
  // Restore the map to wherever it was last time the app was closed.
  // Avoids the "starts in Kansas, then awkwardly pans to me" flash.
  const { region: lastRegion, save: saveLastRegion, ready: regionReady } =
    useLastMapRegion();

  const focusLat = route.params?.focusLat;
  const focusLng = route.params?.focusLng;

  // Map pan strategy (in order):
  //   1) Just posted a sale? Pan to it (focus coords from route params).
  //   2) Have a saved region from a previous session? Don't auto-pan at
  //      all — the MapView's initialRegion is already set to it below,
  //      so the user opens exactly where they left off.
  //   3) No saved region (first ever launch)? Use Location.getLastKnown
  //      first for an instant approximate pan, then refine with a fresh
  //      getCurrentPosition. Avoids the iOS-cache-stale jump.
  useEffect(() => {
    // Wait until the AsyncStorage read settles before deciding.
    if (!regionReady) return;
    if (initialPanDone.current) return;

    if (focusLat != null && focusLng != null) {
      initialPanDone.current = true;
      setTimeout(() => {
        mapRef.current?.animateToRegion(
          {
            latitude: focusLat,
            longitude: focusLng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          800,
        );
      }, 250);
      navigation.setParams({ focusLat: undefined, focusLng: undefined });
      return;
    }

    // We had a saved region — initialRegion already handled it. Skip
    // the auto-pan so we don't yank the user to "where iOS thinks
    // they are right now" instead of where they were looking.
    if (lastRegion) {
      initialPanDone.current = true;
      return;
    }

    // True first launch: locate them.
    let cancelled = false;
    (async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;

        // Fast path: last-known-position is instant (cached). May be a
        // bit stale but is way better than the US center.
        const last = await Location.getLastKnownPositionAsync({});
        if (!cancelled && last) {
          initialPanDone.current = true;
          mapRef.current?.animateToRegion(
            {
              latitude: last.coords.latitude,
              longitude: last.coords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            },
            500,
          );
        }

        // Slow path: a fresh fix. May take 3-5s. Refines the pan.
        const fresh = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        initialPanDone.current = true;
        mapRef.current?.animateToRegion(
          {
            latitude: fresh.coords.latitude,
            longitude: fresh.coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          },
          800,
        );
      } catch {
        /* swallow */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusLat, focusLng, navigation, regionReady, lastRegion]);

  // Filter + sort
  const filteredSales = useMemo(() => {
    const filtered = categoryFilter
      ? sales.filter((s) => s.categories.includes(categoryFilter as any))
      : sales;
    if (viewMode !== 'list') return filtered;

    // List-mode sort. Distance fallback for any sort that doesn't apply
    // (e.g. 'open' partitions, then sorts by distance within each group).
    const distance = (s: typeof filtered[number]) =>
      userLocation
        ? haversineMeters(
            userLocation.latitude,
            userLocation.longitude,
            s.latitude,
            s.longitude,
          )
        : Number.POSITIVE_INFINITY;

    const sorted = [...filtered];
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
  }, [sales, categoryFilter, viewMode, userLocation, sortBy]);

  const openNowCount = useMemo(
    () => filteredSales.filter((s) => isOpenNow(s)).length,
    [filteredSales],
  );

  const goToUserLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    mapRef.current?.animateToRegion(
      {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      800,
    );
  }, []);

  const onRegionChangeComplete = useCallback(
    (region: Region) => {
      setMapBounds({
        minLat: region.latitude - region.latitudeDelta / 2,
        maxLat: region.latitude + region.latitudeDelta / 2,
        minLng: region.longitude - region.longitudeDelta / 2,
        maxLng: region.longitude + region.longitudeDelta / 2,
      });
      // Persist where the user is looking so re-opening the app drops
      // them right back here instead of US-center or wherever iOS
      // thinks they are. Debounced inside useLastMapRegion.
      saveLastRegion(region);
    },
    [saveLastRegion],
  );

  // NO className anywhere in this screen — every wrapper uses inline
  // styles via a local StyleSheet. NativeWind v4's css-interop runtime
  // was throwing a phantom 'no navigation context' error when several
  // className Views were nested inside MapHomeScreen (see error
  // boundary trace pointing into react-native-css-interop). Until we
  // can find / fix the upstream bug, sidestep it by not using className
  // on this screen. Child components (IconButton, FilterBar, EmptyState,
  // SaleListCard) still use NativeWind — they're fine in isolation.
  return (
    <View style={styles.root}>
      {/* MAP MODE — always mounted, hidden when in list mode */}
      <View
        style={[styles.mode, { display: viewMode === 'map' ? 'flex' : 'none' }]}
      >
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={lastRegion ?? DEFAULT_REGION}
          onRegionChangeComplete={onRegionChangeComplete}
          showsUserLocation
          showsMyLocationButton={false}
          // Clustering: group nearby pins into a single bubble until the
          // user zooms in. radius=40 (default 50) tightens groups; tapping
          // a cluster zooms in to expand it.
          clusterColor="#F97316"
          clusterTextColor="#fff"
          radius={40}
          minPoints={3}
        >
          {filteredSales.map((sale) => (
            <Marker
              key={sale.id}
              coordinate={{
                latitude: sale.latitude,
                longitude: sale.longitude,
              }}
              onPress={() =>
                navigation.navigate('SaleDetail', { saleId: sale.id })
              }
              tracksViewChanges={false}
            >
              <MapPin status={sale.status} />
            </Marker>
          ))}
        </MapView>

        {/* Floating my-location FAB. No refresh button: useSales
            auto-refetches on map-bounds change AND subscribes to
            postgres_changes, so the map already reflects new sales
            within a second of them being posted. */}
        <View style={styles.locateWrap}>
          <IconButton
            variant="solid"
            size="lg"
            onPress={goToUserLocation}
            icon={<Ionicons name="locate" size={22} color="#18181B" />}
          />
        </View>
      </View>

      {/* LIST MODE — always mounted, hidden when in map mode */}
      <View
        style={[
          styles.mode,
          styles.listMode,
          { display: viewMode === 'list' ? 'flex' : 'none' },
        ]}
      >
        {/* Single compact 'Sort: X' pill — opens a sheet to pick.
            Hides 2 chips' worth of horizontal noise vs the old
            three-chip row. */}
        {filteredSales.length > 0 && (
          <View style={styles.sortRow}>
            <Pressable
              onPress={() => setSortSheetOpen(true)}
              style={styles.sortPill}
            >
              <Ionicons name="swap-vertical" size={14} color="#71717A" />
              <Text style={styles.sortPillText}>
                Sort:{' '}
                <Text style={styles.sortPillValue}>
                  {SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? ''}
                </Text>
              </Text>
              <Ionicons name="chevron-down" size={12} color="#71717A" />
            </Pressable>
            <Text style={styles.sortCount}>
              {filteredSales.length}{' '}
              {filteredSales.length === 1 ? 'sale' : 'sales'}
            </Text>
          </View>
        )}

        {filteredSales.length === 0 && !loading ? (
          <EmptyState
            icon={<Ionicons name="pricetag-outline" size={32} color="#F97316" />}
            title="No sales found"
            description={
              categoryFilter
                ? 'Try a different category or clear the filter.'
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
              <RefreshControl
                refreshing={loading}
                onRefresh={refetch}
                tintColor="#F97316"
                colors={['#F97316']}
              />
            }
            renderItem={({ item }) => (
              <SaleListCard
                sale={item}
                userLat={userLocation?.latitude}
                userLng={userLocation?.longitude}
                onPress={() =>
                  navigation.navigate('SaleDetail', { saleId: item.id })
                }
              />
            )}
          />
        )}
      </View>

      {/* Floating top bar — same on both views */}
      <View style={[styles.topBarWrap, { top: insets.top }]}>
        <View style={styles.topBarCard}>
          <View style={styles.topBarIcon}>
            <Ionicons name="map" size={20} color="#F97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Discover sales</Text>
            <Text style={styles.topBarSubtitle}>
              {loading
                ? 'Loading nearby sales…'
                : openNowCount > 0
                ? `${openNowCount} open right now`
                : filteredSales.length > 0
                ? `${filteredSales.length} ${
                    filteredSales.length === 1 ? 'sale' : 'sales'
                  }`
                : 'Pan the map to find sales'}
            </Text>
          </View>
          {loading && <ActivityIndicator color="#F97316" />}

          {/* Map/List toggle */}
          <View style={styles.toggleWrap}>
            <Pressable
              onPress={() => setViewMode('map')}
              style={[
                styles.toggleBtn,
                viewMode === 'map' && styles.toggleBtnActive,
              ]}
            >
              <Ionicons
                name="map"
                size={16}
                color={viewMode === 'map' ? '#F97316' : '#71717A'}
              />
            </Pressable>
            <Pressable
              onPress={() => setViewMode('list')}
              style={[
                styles.toggleBtn,
                viewMode === 'list' && styles.toggleBtnActive,
              ]}
            >
              <Ionicons
                name="list"
                size={16}
                color={viewMode === 'list' ? '#F97316' : '#71717A'}
              />
            </Pressable>
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          <FilterBar selected={categoryFilter} onSelect={setCategoryFilter} />
        </View>
      </View>

      {/* Sort sheet — bottom modal with the three options */}
      <Modal
        visible={sortSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortSheetOpen(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setSortSheetOpen(false)}
        />
        <View style={styles.sheetCard}>
          <View style={styles.sheetGrabber} />
          <Text style={styles.sheetTitle}>Sort by</Text>
          {SORT_OPTIONS.map((opt) => {
            const active = sortBy === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  setSortBy(opt.key);
                  setSortSheetOpen(false);
                }}
                style={styles.sheetRow}
              >
                <Text
                  style={[
                    styles.sheetRowText,
                    active && styles.sheetRowTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {active && (
                  <Ionicons name="checkmark" size={20} color="#F97316" />
                )}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF9' },
  mode: { flex: 1 },
  listMode: { paddingTop: 168 },
  map: { flex: 1 },
  locateWrap: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    pointerEvents: 'box-none',
    gap: 10,
    alignItems: 'flex-end',
  },
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
  sortPillText: {
    fontSize: 12,
    color: '#71717A',
  },
  sortPillValue: {
    fontWeight: '700',
    color: '#18181B',
  },
  sortCount: {
    fontSize: 12,
    color: '#A1A1AA',
    fontWeight: '500',
  },
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
  sheetRowText: {
    fontSize: 16,
    color: '#27272A',
  },
  sheetRowTextActive: {
    color: '#F97316',
    fontWeight: '700',
  },
  topBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    pointerEvents: 'box-none',
  },
  topBarCard: {
    marginHorizontal: 16,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  topBarIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
  },
  topBarSubtitle: {
    fontSize: 12,
    color: '#71717A',
  },
  toggleWrap: {
    marginLeft: 12,
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: '#F4F4F5',
    padding: 2,
  },
  toggleBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  toggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
