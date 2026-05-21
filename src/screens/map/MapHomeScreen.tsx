import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
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

  // In list mode we want ALL active sales (not bounded). In map mode the
  // bounds filter is useful so we don't pull the world.
  const { sales, loading, refetch } = useSales(
    viewMode === 'map' ? mapBounds : undefined,
  );
  const userLocation = useUserLocation();

  const focusLat = route.params?.focusLat;
  const focusLng = route.params?.focusLng;

  // 1) If we arrive with focus coords (from a just-posted sale), pan there.
  // 2) Otherwise, on first mount, try to pan to the user's location so they
  //    see nearby sales instead of staring at the geographic center of the US.
  useEffect(() => {
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

    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({});
        if (cancelled) return;
        initialPanDone.current = true;
        mapRef.current?.animateToRegion(
          {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
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
  }, [focusLat, focusLng, navigation]);

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

  const onRegionChangeComplete = useCallback((region: Region) => {
    setMapBounds({
      minLat: region.latitude - region.latitudeDelta / 2,
      maxLat: region.latitude + region.latitudeDelta / 2,
      minLng: region.longitude - region.longitudeDelta / 2,
      maxLng: region.longitude + region.longitudeDelta / 2,
    });
  }, []);

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
          initialRegion={DEFAULT_REGION}
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

        {/* Floating FAB stack — sits above the tab bar */}
        <View style={styles.locateWrap}>
          <IconButton
            variant="solid"
            size="md"
            onPress={refetch}
            icon={
              <Ionicons
                name={loading ? 'sync' : 'refresh'}
                size={20}
                color="#18181B"
              />
            }
          />
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
        {/* Sort chips — only shown when there are sales to sort */}
        {filteredSales.length > 0 && (
          <View style={styles.sortRow}>
            {SORT_OPTIONS.map((opt) => {
              const active = sortBy === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setSortBy(opt.key)}
                  style={[
                    styles.sortChip,
                    active && styles.sortChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.sortChipText,
                      active && styles.sortChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
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
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F4F4F5',
  },
  sortChipActive: {
    backgroundColor: '#FFEDD5',
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717A',
  },
  sortChipTextActive: {
    color: '#C2410C',
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
