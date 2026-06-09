import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  useNavigation,
  useRoute,
  RouteProp,
  useFocusEffect,
  useIsFocused,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useSales } from '../../hooks/useSales';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useLocationLabel } from '../../hooks/useLocationLabel';
import { useLastMapRegion } from '../../hooks/useLastMapRegion';
import { useFavorites } from '../../hooks/useFavorites';
import { MapStackParamList, ItemCategory, Sale } from '../../types';
import { MapPin } from '../../components/MapPin';
import { SelectedPinCallout } from '../../components/SelectedPinCallout';
import { BottomSheet, SheetState } from '../../components/BottomSheet';
import SaleCard from '../../components/SaleCard';
import { Chip } from '../../components/ui';
import { haversineMeters, formatDistanceMiles } from '../../utils/distance';
import { isOpenNow } from '../../utils/saleStatus';
import { formatSaleTime } from '../../utils/format';
import {
  PLACEHOLDER_BLURHASH,
  transformedImageUrl,
} from '../../lib/imageUrl';
import { Image } from 'expo-image';
import { BottomSheetFlatList, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import {
  PanGestureHandler,
  State as GestureState,
  PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import {
  countActiveFilters,
  setMapFilters,
  useMapFilters,
} from '../../lib/mapFilters';

type Nav = NativeStackNavigationProp<MapStackParamList, 'MapHome'>;
type Route = RouteProp<MapStackParamList, 'MapHome'>;

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

const SHEET_PEEK = 240;
const SHEET_OPEN = 420;

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';

type QuickCat = 'furniture' | 'tools';

export default function MapHomeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const initialPanDone = useRef(false);

  const { sales, loading } = useSales();
  const { isFavorited, refetch: refetchFavorites } = useFavorites();
  const userLocation = useUserLocation();
  const locationLabel = useLocationLabel(userLocation);
  const {
    region: lastRegion,
    save: saveLastRegion,
    ready: regionReady,
  } = useLastMapRegion();

  // Filter state — driven by the shared mapFilters store so the
  // FilterSheet modal can read/write the same object.
  const filters = useMapFilters();
  const openNowFilter = filters.openNow;
  const savedOnly = filters.savedOnly;
  const todayOnly = filters.when === 'today';
  // Quick-access chip-row selections for furniture / tools live inside
  // filters.categories. The map-level chip toggles them in/out.
  const quickCats = useMemo(
    () => new Set(filters.categories.filter((c) => c === 'furniture' || c === 'tools') as QuickCat[]),
    [filters.categories],
  );
  const activeFilterCount = countActiveFilters(filters);

  const [sheetState, setSheetState] = useState<SheetState>('peek');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  // Region to seed the MapView with. We can't pass null — react-native-maps
  // will fall back to (0,0) — so we defer rendering until we have a real
  // region from one of three sources, in priority order:
  //   1. focus param (deep link / navigated push)
  //   2. lastRegion from disk (returning user)
  //   3. userLocation (first-time / cleared storage)
  // While none of those is available we render a bone-colored placeholder
  // instead of flashing the geographic center of the US (Kansas) for a
  // second while permissions resolve.
  const initialRegion: Region | null = useMemo(() => {
    if (route.params?.focusLat != null && route.params?.focusLng != null) {
      return {
        latitude: route.params.focusLat,
        longitude: route.params.focusLng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    if (lastRegion) {
      // Treat the cached default-region marker as "no real history" so we
      // wait for GPS instead of flashing Kansas to the user.
      const isStale =
        Math.abs(lastRegion.latitude - DEFAULT_REGION.latitude) < 1 &&
        Math.abs(lastRegion.longitude - DEFAULT_REGION.longitude) < 1;
      if (!isStale) return lastRegion;
    }
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    return null;
  }, [
    route.params?.focusLat,
    route.params?.focusLng,
    lastRegion,
    userLocation,
  ]);
  const mapReady = regionReady && initialRegion != null;
  // Only one AIRMap instance can safely exist at a time under the new
  // architecture. Push transitions to SaleDetail / RoutePlanner mount
  // an additional MapView; if this one stays alive in the background
  // the reconciliation race throws
  //   -[__NSArrayM insertObject:atIndex:]: object cannot be nil
  // from -[AIRMap insertReactSubview:atIndex:]. Unmount when blurred —
  // user can't see this map behind the pushed screen anyway. Region is
  // restored from AsyncStorage (useLastMapRegion) when we remount on
  // pop-back, so the user lands where they left off.
  const isFocused = useIsFocused();

  // Refresh favorites when Map is re-focused so saved-state is current.
  useFocusEffect(
    useCallback(() => {
      refetchFavorites();
    }, [refetchFavorites]),
  );

  // Initial pan: focus param > last region > user location.
  const focusLat = route.params?.focusLat;
  const focusLng = route.params?.focusLng;
  useEffect(() => {
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

    if (lastRegion) {
      const isStale =
        Math.abs(lastRegion.latitude - DEFAULT_REGION.latitude) < 1 &&
        Math.abs(lastRegion.longitude - DEFAULT_REGION.longitude) < 1;
      if (!isStale) {
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
            {
              latitude: last.coords.latitude,
              longitude: last.coords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            },
            500,
          );
        }
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
        // swallow
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusLat, focusLng, navigation, regionReady, lastRegion]);

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

  // Filtered + distance-sorted list. The pin numbers (1..N) reflect this order.
  const sortedSales = useMemo(() => {
    let result = sales;
    if (filters.openNow) result = result.filter((s) => isOpenNow(s));
    if (filters.savedOnly) result = result.filter((s) => isFavorited(s.id));
    if (filters.categories.length > 0) {
      result = result.filter((s) =>
        s.categories.some((c) => filters.categories.includes(c)),
      );
    }
    if (filters.vibeTags.length > 0) {
      result = result.filter((s) =>
        (s.vibe_tags ?? []).some((v) => filters.vibeTags.includes(v as any)),
      );
    }
    if (filters.when === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      result = result.filter(
        (s) => s.start_date <= today && s.end_date >= today,
      );
    }
    if (filters.radiusMiles != null && userLocation) {
      const radiusMeters = filters.radiusMiles * 1609.34;
      result = result.filter(
        (s) =>
          haversineMeters(
            userLocation.latitude,
            userLocation.longitude,
            s.latitude,
            s.longitude,
          ) <= radiusMeters,
      );
    }
    const dist = (s: Sale) =>
      userLocation
        ? haversineMeters(
            userLocation.latitude,
            userLocation.longitude,
            s.latitude,
            s.longitude,
          )
        : Number.POSITIVE_INFINITY;
    return [...result].sort((a, b) => dist(a) - dist(b));
  }, [sales, filters, userLocation, isFavorited]);

  const savedCount = useMemo(
    () => sales.filter((s) => isFavorited(s.id)).length,
    [sales, isFavorited],
  );

  const handleSaleTap = useCallback(
    (saleId: string) => {
      navigation.navigate('SaleDetail', { saleId });
    },
    [navigation],
  );

  const toggleQuickCat = useCallback(
    (cat: QuickCat) => {
      const cur = new Set(filters.categories);
      if (cur.has(cat)) cur.delete(cat);
      else cur.add(cat);
      setMapFilters({ categories: Array.from(cur) as ItemCategory[] });
    },
    [filters.categories],
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
      const isDefault =
        Math.abs(region.latitude - DEFAULT_REGION.latitude) < 1 &&
        Math.abs(region.longitude - DEFAULT_REGION.longitude) < 1;
      if (isDefault) return;
      saveLastRegion(region);
    },
    [saveLastRegion],
  );

  const handleFilterOpen = useCallback(() => {
    navigation.navigate('FilterSheet');
  }, [navigation]);

  const handleRoutePlanner = useCallback(() => {
    navigation.navigate('RoutePlanner');
  }, [navigation]);

  // ── Render ──────────────────────────────────────────────────────────────

  const selectedSale = useMemo(
    () => sales.find((s) => s.id === selectedSaleId) ?? null,
    [sales, selectedSaleId],
  );

  return (
    <View style={styles.root}>
      {/* Bone placeholder while we wait for a real region. Hides the
          Kansas flash that happens when react-native-maps' initialRegion
          is set to the geographic center of the US. */}
      {!mapReady || !isFocused ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: BONE,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          {!mapReady ? <ActivityIndicator color={BRAND} /> : null}
        </View>
      ) : null}
      {isFocused ? (
      <MapView
        ref={mapRef}
        style={[
          StyleSheet.absoluteFill,
          { opacity: mapReady ? 1 : 0 },
        ]}
        initialRegion={initialRegion ?? DEFAULT_REGION}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => setSelectedSaleId(null)}
      >
        {sortedSales.map((sale, idx) => {
          const selected = sale.id === selectedSaleId;
          // Single Marker per sale, single stable key. Earlier we keyed
          // on the selection state to force a fresh native marker (so a
          // stale onPress closure wouldn't fire), but rapid mount /
          // unmount inside AIRMap under Fabric races RCTLegacyView
          // ManagerInteropComponentView.finalizeUpdates and crashes
          // with `-[__NSArrayM insertObject:atIndex:]: object cannot
          // be nil`. See MapPin.tsx for the original incident report.
          // The reused-marker approach avoids the race entirely:
          // - the Marker instance stays mounted, only its child swaps,
          // - the onPress prop is a fresh closure on every render so it
          //   always reads the current selection,
          // - tracksViewChanges toggles to true only while showing the
          //   wider callout so iOS re-sizes the annotation view.
          return (
            <Marker
              key={sale.id}
              coordinate={{
                latitude: sale.latitude,
                longitude: sale.longitude,
              }}
              anchor={selected ? { x: 0.5, y: 1 } : undefined}
              onPress={(e) => {
                e.stopPropagation?.();
                if (selected) {
                  handleSaleTap(sale.id);
                } else {
                  setSelectedSaleId(sale.id);
                }
              }}
              tracksViewChanges={selected}
            >
              {selected ? (
                <SelectedPinCallout
                  sale={sale}
                  userLat={userLocation?.latitude}
                  userLng={userLocation?.longitude}
                  onPress={() => handleSaleTap(sale.id)}
                />
              ) : (
                <MapPin
                  status={sale.status}
                  favorited={isFavorited(sale.id)}
                  num={idx + 1}
                  openNow={isOpenNow(sale)}
                />
              )}
            </Marker>
          );
        })}
      </MapView>
      ) : null}

      {/* Top: Search/location card */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 12,
          right: 12,
        }}
      >
        <SearchCard
          locationLabel={locationLabel ?? 'Near you'}
          radiusLabel={
            userLocation
              ? formatDistanceMiles(
                  haversineMeters(
                    userLocation.latitude,
                    userLocation.longitude,
                    userLocation.latitude + 0.05,
                    userLocation.longitude,
                  ),
                )
              : '5 mi'
          }
          countLabel={`${sortedSales.length} sales`}
          onPress={() => navigation.navigate('Search')}
          onFilters={handleFilterOpen}
        />

        {/* Chip row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 10, paddingRight: 12 }}
          style={{ marginHorizontal: -12, paddingHorizontal: 12 }}
        >
          <Chip
            label="Open now"
            icon="flame"
            tone={openNowFilter ? 'active' : 'default'}
            onPress={() => setMapFilters({ openNow: !openNowFilter })}
          />
          <View style={{ width: 6 }} />
          <Chip
            label={`Saved · ${savedCount}`}
            icon="heart-outline"
            tone={savedOnly ? 'active' : 'default'}
            onPress={() => setMapFilters({ savedOnly: !savedOnly })}
          />
          <View style={{ width: 6 }} />
          <Chip
            label="Furniture"
            tone={quickCats.has('furniture') ? 'active' : 'default'}
            onPress={() => toggleQuickCat('furniture')}
          />
          <View style={{ width: 6 }} />
          <Chip
            label="Tools"
            tone={quickCats.has('tools') ? 'active' : 'default'}
            onPress={() => toggleQuickCat('tools')}
          />
          <View style={{ width: 6 }} />
          <Chip
            label="Today"
            tone={todayOnly ? 'active' : 'default'}
            onPress={() =>
              setMapFilters({ when: todayOnly ? null : 'today' })
            }
          />
        </ScrollView>
      </View>

      {/* Route planner pill — only when at least one saved sale.
          Anchored just below the chip row baseline. The prototype
          spec places it at top: 168 measured from the top of the
          visible area (which already accounts for the iOS notch);
          adding insets.top + 168 here would double-count the safe
          area and drop the pill into the middle of the map. */}
      {savedCount > 0 && (
        <Pressable
          onPress={handleRoutePlanner}
          style={{
            position: 'absolute',
            right: 12,
            top: insets.top + 108,
            backgroundColor: '#fff',
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
          accessibilityRole="button"
          accessibilityLabel="Plan route"
        >
          <Ionicons name="git-network-outline" size={14} color={BRAND} />
          <Text
            style={{
              marginLeft: 6,
              marginRight: 8,
              fontSize: 12,
              fontWeight: '700',
              color: INK,
            }}
          >
            Plan route
          </Text>
          <View
            style={{
              backgroundColor: BRAND,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 99,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
              {savedCount}
            </Text>
          </View>
        </Pressable>
      )}

      {/* My-location FAB. Anchored 12pt above whichever snap point
          the sheet is at. The gorhom snap-point math already accounts
          for `insets.bottom` on the open snap only (see BottomSheet.tsx),
          so we mirror that here -- peek = SHEET_PEEK, open = SHEET_OPEN
          + insets.bottom. Adding insets.bottom to both pushes the FAB
          ~40pt above the peek sheet on notched devices, which leaves
          it floating in the middle of the map. */}
      <Pressable
        onPress={goToUserLocation}
        accessibilityRole="button"
        accessibilityLabel="My location"
        style={{
          position: 'absolute',
          right: 14,
          bottom:
            (sheetState === 'open'
              ? SHEET_OPEN + insets.bottom
              : SHEET_PEEK) + 12,
          width: 42,
          height: 42,
          borderRadius: 14,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
          elevation: 5,
        }}
      >
        <Ionicons name="locate-outline" size={18} color={INK} />
      </Pressable>

      {/* Bottom sheet */}
      <BottomSheet
        state={sheetState}
        onStateChange={setSheetState}
        peekHeight={SHEET_PEEK}
        openHeight={SHEET_OPEN}
      >
        {/* Explicit pan handler wrapping the ENTIRE sheet content — header
            AND carousel. Gorhom's built-in content-panning gesture is
            blocked by the horizontal scroll wrapper around the carousel,
            so swipes that start over a peek card never propagate to the
            sheet's snap logic. With activeOffsetY={[-10, 10]} +
            failOffsetX={[-15, 15]} we get:
            - vertical drag ≥10pt activates this handler and the sheet
              snaps to the other state on release,
            - horizontal drag ≥15pt fails this handler and falls through
              to the inner ScrollView so the carousel still scrolls,
            - taps still register on PeekCard / SaleCard since they
              never cross the activeOffset threshold. */}
        <PanGestureHandler
          activeOffsetY={[-10, 10]}
          failOffsetX={[-15, 15]}
          onHandlerStateChange={(e: PanGestureHandlerStateChangeEvent) => {
            if (e.nativeEvent.oldState !== GestureState.ACTIVE) return;
            const { translationY, velocityY } = e.nativeEvent;
            if (translationY < -30 || velocityY < -500) {
              setSheetState('open');
            } else if (translationY > 30 || velocityY > 500) {
              setSheetState('peek');
            }
          }}
        >
          {/* collapsable={false} so RN keeps this view as a real native
              node — required for the gesture handler to attach. */}
          <View collapsable={false} style={{ flex: 1 }}>
            <SheetHeader
              state={sheetState}
              count={sortedSales.length}
              onToggle={() =>
                setSheetState((s) => (s === 'open' ? 'peek' : 'open'))
              }
            />
            {sheetState === 'peek' ? (
              <BottomSheetScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 12,
                  paddingBottom: 12,
                }}
              >
                {sortedSales.slice(0, 12).map((sale, idx) => (
                  <PeekCard
                    key={sale.id}
                    sale={sale}
                    index={idx}
                    userLat={userLocation?.latitude}
                    userLng={userLocation?.longitude}
                    onPress={() => handleSaleTap(sale.id)}
                  />
                ))}
                {loading && sortedSales.length === 0 ? (
                  <View
                    style={{
                      width: 220,
                      height: 200,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ActivityIndicator color={BRAND} />
                  </View>
                ) : null}
              </BottomSheetScrollView>
            ) : (
              <BottomSheetFlatList
                data={sortedSales}
                keyExtractor={(s) => s.id}
                contentContainerStyle={{
                  paddingHorizontal: 12,
                  paddingBottom: insets.bottom + 12,
                }}
                renderItem={({ item, index }) => (
                  <SaleCard
                    sale={item}
                    index={index}
                    density="comfy"
                    userLat={userLocation?.latitude}
                    userLng={userLocation?.longitude}
                    onPress={() => handleSaleTap(item.id)}
                  />
                )}
                ListEmptyComponent={
                  loading ? (
                    <View
                      style={{ alignItems: 'center', paddingVertical: 40 }}
                    >
                      <ActivityIndicator color={BRAND} />
                    </View>
                  ) : (
                    <View
                      style={{
                        alignItems: 'center',
                        paddingVertical: 40,
                        paddingHorizontal: 20,
                      }}
                    >
                      <Text style={{ color: INK_SOFT, textAlign: 'center' }}>
                        No sales match your filters.
                      </Text>
                    </View>
                  )
                }
              />
            )}
          </View>
        </PanGestureHandler>
      </BottomSheet>
    </View>
  );
}

function SearchCard({
  locationLabel,
  radiusLabel,
  countLabel,
  onPress,
  onFilters,
}: {
  locationLabel: string;
  radiusLabel: string;
  countLabel: string;
  onPress: () => void;
  onFilters: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 11,
        paddingHorizontal: 14,
        shadowColor: '#141210',
        shadowOpacity: 0.1,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      }}
    >
      <Pressable
        onPress={onPress}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
        accessibilityRole="button"
        accessibilityLabel="Change location"
      >
        <Ionicons name="search-outline" size={16} color={INK_SOFT} />
        <View style={{ marginLeft: 8, flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: INK,
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            {locationLabel}
          </Text>
          <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 1 }}>
            {radiusLabel} · {countLabel}
          </Text>
        </View>
      </Pressable>
      <View
        style={{
          width: 1,
          height: 22,
          backgroundColor: '#E5DECC',
          marginHorizontal: 10,
        }}
      />
      <Pressable
        onPress={onFilters}
        accessibilityRole="button"
        accessibilityLabel="Open filters"
        hitSlop={6}
        style={{
          width: 28,
          height: 28,
          borderRadius: 10,
          backgroundColor: '#E1ECDF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="options-outline" size={16} color={BRAND} />
      </Pressable>
    </View>
  );
}

function SheetHeader({
  state,
  count,
  onToggle,
}: {
  state: SheetState;
  count: number;
  onToggle: () => void;
}) {
  // The header container is a plain View so gorhom's pan-up gesture can
  // capture vertical drags over the title area — a Pressable here would
  // swallow the touch and break the swipe-to-open interaction. The toggle
  // affordance is its own small Pressable on the right so taps still work.
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 10,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: INK }}>
          {count} {count === 1 ? 'sale' : 'sales'} nearby
        </Text>
        <Text style={{ fontSize: 12, color: INK_MUTED, marginTop: 1 }}>
          Sorted by distance
        </Text>
      </View>
      <Pressable
        onPress={onToggle}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={state === 'open' ? 'Show map' : 'Show full list'}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 6,
          paddingLeft: 10,
          paddingRight: 8,
          borderRadius: 10,
          backgroundColor: pressed ? '#E1ECDF' : 'transparent',
        })}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>
          {state === 'open' ? 'Map' : 'List'}
        </Text>
        <Ionicons
          name={state === 'open' ? 'chevron-down' : 'chevron-up'}
          size={16}
          color={BRAND}
          style={{ marginLeft: 2 }}
        />
      </Pressable>
    </View>
  );
}

function PeekCard({
  sale,
  index,
  userLat,
  userLng,
  onPress,
}: {
  sale: Sale;
  index: number;
  userLat?: number;
  userLng?: number;
  onPress: () => void;
}) {
  const open = isOpenNow(sale);
  // Sales sometimes have media records pointing at deleted / RLS-blocked
  // storage objects. The Image's blurhash placeholder hides the failure
  // silently — the card just looks broken. Track explicit error state
  // and swap in the icon fallback when expo-image reports a load error.
  const [imgFailed, setImgFailed] = useState(false);
  const firstImage = sale.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 440,
    height: 220,
    resize: 'cover',
    quality: 75,
  });
  const dist =
    userLat != null && userLng != null
      ? haversineMeters(userLat, userLng, sale.latitude, sale.longitude)
      : null;
  const driveMin = dist != null ? Math.max(1, Math.round(dist / 805)) : null;
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 220,
        marginRight: 10,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5DECC',
        overflow: 'hidden',
      }}
    >
      <View style={{ height: 102, backgroundColor: '#E1ECDF' }}>
        {thumb && !imgFailed ? (
          <Image
            source={{ uri: thumb }}
            placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="image-outline" size={28} color={BRAND} />
          </View>
        )}
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            backgroundColor: BRAND,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 99,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>
            {index + 1}
          </Text>
        </View>
      </View>
      <View style={{ padding: 10 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 13.5,
            fontWeight: '700',
            color: INK,
            letterSpacing: -0.2,
          }}
        >
          {sale.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 11, color: INK_MUTED, marginTop: 3 }}
        >
          {sale.address}
          {dist != null ? ` · ${formatDistanceMiles(dist)}` : ''}
        </Text>
        <View
          style={{
            marginTop: 8,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="time-outline" size={11} color={INK_MUTED} />
          <Text style={{ fontSize: 11, color: INK_SOFT, marginLeft: 4 }}>
            {formatSaleTime(sale.start_time, sale.end_time)}
          </Text>
          {driveMin != null && (
            <>
              <Ionicons
                name="car-outline"
                size={11}
                color={BRAND}
                style={{ marginLeft: 8 }}
              />
              <Text
                style={{
                  fontSize: 11,
                  color: INK,
                  marginLeft: 4,
                  fontWeight: '600',
                }}
              >
                {driveMin} min
              </Text>
            </>
          )}
          <View style={{ flex: 1 }} />
          {open && (
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                backgroundColor: BRAND,
              }}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BONE },
});
