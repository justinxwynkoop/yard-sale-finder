import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Vanilla react-native-maps (no clustering wrapper). See MapHomeScreen
// for the rationale -- react-native-map-clustering crashed natively
// under newArchEnabled at wide zoom levels.
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import {
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFavorites } from '../../hooks/useFavorites';
import { useUserLocation } from '../../hooks/useUserLocation';
import { SavedStackParamList } from '../../types';
import { MapPin } from '../../components/MapPin';
import SaleListCard from '../../components/SaleListCard';
import { EmptyState } from '../../components/ui';
import { haversineMeters } from '../../utils/distance';
import { isOpenNow } from '../../utils/saleStatus';

type Nav = NativeStackNavigationProp<SavedStackParamList, 'SavedHome'>;
type ViewMode = 'map' | 'list';
type SortBy = 'distance' | 'newest' | 'open';

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'distance', label: 'Nearest' },
  { key: 'newest', label: 'Newest' },
  { key: 'open', label: 'Open now' },
];

// Centered on the US so an empty map doesn't open in the middle of
// the ocean -- though we usually call fitToCoordinates before this
// is visible.
const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 12,
  longitudeDelta: 12,
};

/**
 * The "Saved" tab. Shows the user's favorited sales on a map (so they
 * can plan a Saturday-morning route at a glance) with a list-mode
 * toggle for vertical browsing.
 *
 * Why it's a separate screen from MapHomeScreen: the data source is a
 * different hook (useFavorites — already-fetched full set, no bounds
 * filtering needed), the auto-fit behavior is different (fit to ALL
 * coords on mount, not to the user's location), and the empty state
 * is meaningful here (an unsaved-anything-yet prompt).
 */
export default function SavedHomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const fittedOnce = useRef(false);

  const { favorites, loading, refetch } = useFavorites();
  const userLocation = useUserLocation();

  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [sortBy, setSortBy] = useState<SortBy>('distance');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  // Re-fetch when the tab regains focus -- catches favorites the user
  // hearted on another tab without us needing a global event bus.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // Auto-fit the map to encompass all saved coords on first render of
  // a non-empty list. Re-fits if the user goes from empty to non-empty
  // (e.g. they save their first sale on the Map tab and come back).
  useEffect(() => {
    if (favorites.length === 0) {
      fittedOnce.current = false;
      return;
    }
    if (fittedOnce.current) return;
    // Small delay so MapView's first measure pass has happened.
    const t = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(
          favorites.map((s) => ({
            latitude: s.latitude,
            longitude: s.longitude,
          })),
          {
            edgePadding: { top: 200, right: 60, bottom: 100, left: 60 },
            animated: true,
          },
        );
        fittedOnce.current = true;
      } catch {
        /* map not ready yet, will retry on next effect */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [favorites]);

  const sortedFavorites = useMemo(() => {
    if (viewMode !== 'list') return favorites;
    const distance = (s: (typeof favorites)[number]) =>
      userLocation
        ? haversineMeters(
            userLocation.latitude,
            userLocation.longitude,
            s.latitude,
            s.longitude,
          )
        : Number.POSITIVE_INFINITY;

    const sorted = [...favorites];
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
  }, [favorites, viewMode, userLocation, sortBy]);

  const openNowCount = useMemo(
    () => favorites.filter((s) => isOpenNow(s)).length,
    [favorites],
  );

  // Loading first time
  if (loading && favorites.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  // Empty state: no saved sales yet
  if (!loading && favorites.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon={<Ionicons name="heart-outline" size={32} color="#F97316" />}
          title="No saved sales yet"
          description={
            'Tap the heart on any sale to save it for later. ' +
            'Your saved sales show up here so you can plan your route.'
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* MAP MODE */}
      <View
        style={[
          styles.mode,
          { display: viewMode === 'map' ? 'flex' : 'none' },
        ]}
      >
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={DEFAULT_REGION}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {favorites.map((sale) => (
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
      </View>

      {/* LIST MODE */}
      <View
        style={[
          styles.mode,
          styles.listMode,
          { display: viewMode === 'list' ? 'flex' : 'none' },
        ]}
      >
        {sortedFavorites.length > 0 && (
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
              {sortedFavorites.length}{' '}
              {sortedFavorites.length === 1 ? 'sale' : 'sales'}
            </Text>
          </View>
        )}

        <FlatList
          data={sortedFavorites}
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
      </View>

      {/* Floating top bar */}
      <View style={[styles.topBarWrap, { top: insets.top }]}>
        <View style={styles.topBarCard}>
          <View style={styles.topBarIcon}>
            <Ionicons name="heart" size={20} color="#F97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Saved sales</Text>
            <Text style={styles.topBarSubtitle}>
              {favorites.length}{' '}
              {favorites.length === 1 ? 'sale' : 'sales'}
              {openNowCount > 0
                ? ` · ${openNowCount} open right now`
                : ''}
            </Text>
          </View>
          {loading && favorites.length > 0 ? (
            <ActivityIndicator color="#F97316" />
          ) : null}

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
      </View>

      {/* Sort sheet */}
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
  listMode: { paddingTop: 96 },
  map: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF9',
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
  sortPillText: { fontSize: 12, color: '#71717A' },
  sortPillValue: { fontWeight: '700', color: '#18181B' },
  sortCount: { fontSize: 12, color: '#A1A1AA', fontWeight: '500' },
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
  sheetRowTextActive: { color: '#F97316', fontWeight: '700' },
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
  topBarTitle: { fontSize: 16, fontWeight: '700', color: '#18181B' },
  topBarSubtitle: { fontSize: 12, color: '#71717A' },
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

