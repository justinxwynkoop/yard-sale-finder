import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
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
import { useAuth } from '../../hooks/useAuth';
import {
  saleDisplayLocation,
  approximateAreaLabel,
} from '../../lib/locationPrivacy';
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
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import {
  countActiveFilters,
  setMapFilters,
  useMapFilters,
} from '../../lib/mapFilters';
import { ROUTE_PLANNER_ENABLED } from '../../lib/featureFlags';

type Nav = NativeStackNavigationProp<MapStackParamList, 'MapHome'>;
type Route = RouteProp<MapStackParamList, 'MapHome'>;

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

// Peek is now just the slim header bar (count + "List" toggle) — no
// carousel — so it only needs ~the header height. The map gets the
// rest of the screen until the user expands to the list.
const SHEET_PEEK = 100;
// Open list fills most of the screen (leaving the search card + chips
// visible up top) so you can actually browse the whole list, not a
// 420pt window of it. Adapts to the device height.
const SHEET_OPEN = Math.round(Dimensions.get('window').height * 0.66);

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';

type QuickCat = 'furniture' | 'tools';

export default function MapHomeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const { sales, loading } = useSales();
  const { user } = useAuth();
  const { isFavorited, refetch: refetchFavorites } = useFavorites();
  const userLocation = useUserLocation();
  const locationLabel = useLocationLabel(userLocation);
  const { region: lastRegion, save: saveLastRegion } = useLastMapRegion();

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
  // Screen-space position of the selected pin's callout. We render the
  // callout as a plain overlay (not a Marker child) because swapping a
  // Marker's child to a wide custom view mispositions it to the map's
  // top-left corner on iOS — and forcing a fresh marker to fix that
  // reintroduces the AIRMap subview-insert crash. An overlay sidesteps
  // both: pins stay static, the callout is ordinary RN positioned at
  // the pin's screen point via pointForCoordinate.
  const [calloutPoint, setCalloutPoint] = useState<{ x: number; y: number } | null>(null);
  const [calloutSize, setCalloutSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  const focusLat = route.params?.focusLat;
  const focusLng = route.params?.focusLng;

  // In-session pan memory. Survives MapView remounts (returning from a
  // sale detail, switching tabs) but NOT a cold launch — so each app
  // start re-centers on the user's *current* location instead of
  // wherever they last panned. This is the deliberate fix for "the map
  // opens far from me": the persisted disk region is no longer the
  // priority, only a last-resort fallback when GPS is unavailable.
  const sessionRegionRef = useRef<Region | null>(null);

  // If GPS is denied or never resolves, fall back after a short wait so
  // the map isn't a permanent spinner.
  const [gpsTimedOut, setGpsTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGpsTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // Region to seed the MapView with. We can't pass null — react-native-maps
  // falls back to (0,0) — so we keep a bone placeholder until we have a
  // real region, in priority order:
  //   1. focus param (deep link / "show on map")
  //   2. where the user was looking earlier THIS session
  //   3. current GPS location  ← the default on every fresh launch
  //   4. (only if GPS is unavailable after a wait) last disk region / US view
  const initialRegion: Region | null = useMemo(() => {
    if (focusLat != null && focusLng != null) {
      return {
        latitude: focusLat,
        longitude: focusLng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    if (sessionRegionRef.current) return sessionRegionRef.current;
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    if (gpsTimedOut) {
      if (lastRegion) {
        const isStale =
          Math.abs(lastRegion.latitude - DEFAULT_REGION.latitude) < 1 &&
          Math.abs(lastRegion.longitude - DEFAULT_REGION.longitude) < 1;
        if (!isStale) return lastRegion;
      }
      return DEFAULT_REGION;
    }
    return null;
  }, [focusLat, focusLng, userLocation, gpsTimedOut, lastRegion]);
  const mapReady = initialRegion != null;
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

  // A focus target ("show on map" / deep link) is consumed by
  // initialRegion seeding on the next MapView mount. If the map is
  // already mounted, animate to it (the seed only applies to a fresh
  // mount). Then clear the param so a later return to the Map tab
  // re-centers normally rather than snapping back to the old target.
  useEffect(() => {
    if (focusLat == null || focusLng == null) return;
    mapRef.current?.animateToRegion(
      {
        latitude: focusLat,
        longitude: focusLng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      600,
    );
    const t = setTimeout(
      () => navigation.setParams({ focusLat: undefined, focusLng: undefined }),
      700,
    );
    return () => clearTimeout(t);
  }, [focusLat, focusLng, navigation]);

  // Center on the user's location the moment GPS resolves. This is the
  // safety net for the slow-GPS case: if the fix takes longer than the
  // fallback timeout, the map may have already mounted on the US-center
  // default (initialRegion is frozen after mount, so re-seeding can't
  // move it) — so we animate here instead. Fires once per session, and
  // only while there's no explicit focus target. We deliberately don't
  // guard on sessionRegionRef: onRegionChangeComplete sets it from the
  // initial settle too, so guarding on it would wrongly suppress the
  // very first centering.
  const didAutoCenterRef = useRef(false);
  useEffect(() => {
    if (!userLocation) return;
    if (didAutoCenterRef.current) return;
    if (focusLat != null && focusLng != null) return;
    didAutoCenterRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      600,
    );
  }, [userLocation, focusLat, focusLng]);

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

  // Compute the on-screen point for a coordinate so the callout overlay
  // can sit above that pin. pointForCoordinate is async on iOS.
  const positionCalloutFor = useCallback(
    async (latitude: number, longitude: number) => {
      if (!mapRef.current) return;
      try {
        const pt = await mapRef.current.pointForCoordinate({
          latitude,
          longitude,
        });
        setCalloutPoint(pt);
      } catch {
        setCalloutPoint(null);
      }
    },
    [],
  );

  const selectPin = useCallback(
    (sale: Sale) => {
      const l = saleDisplayLocation(sale, {
        isOwner: !!user && sale.user_id === user.id,
      });
      setSelectedSaleId(sale.id);
      setCalloutSize({ w: 0, h: 0 });
      positionCalloutFor(l.latitude, l.longitude);
    },
    [user, positionCalloutFor],
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
      // Remember the pan for THIS session so returning from a detail
      // screen restores the view (initialRegion reads this ref).
      sessionRegionRef.current = region;
      const isDefault =
        Math.abs(region.latitude - DEFAULT_REGION.latitude) < 1 &&
        Math.abs(region.longitude - DEFAULT_REGION.longitude) < 1;
      if (isDefault) return;
      // Also persist to disk — used only as the GPS-denied fallback on a
      // future launch, never as the primary center.
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
        onPanDrag={() => {
          // Dismiss the callout when the user starts panning so it never
          // drifts off its pin. (Selecting a pin doesn't move the region,
          // so this only fires on a real drag.)
          if (selectedSaleId) {
            setSelectedSaleId(null);
            setCalloutPoint(null);
          }
        }}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => {
          setSelectedSaleId(null);
          setCalloutPoint(null);
        }}
      >
        {sortedSales.map((sale, idx) => {
          // Honor the host's address privacy: a 'reply'-mode sale shows a
          // deterministically-offset pin (near, not on, the real address)
          // to anyone but the owner. 'live'/legacy sales show exact.
          const loc = saleDisplayLocation(sale, {
            isOwner: !!user && sale.user_id === user.id,
          });
          // Pins NEVER swap their child or change key — they stay static
          // MapPins. The selected callout is a separate overlay (see
          // below). Swapping a Marker's child to a wide custom view
          // mispositions it to the map's top-left on iOS, and changing
          // the key to fix that reintroduces the AIRMap subview crash.
          return (
            <Marker
              key={sale.id}
              coordinate={{
                latitude: loc.latitude,
                longitude: loc.longitude,
              }}
              onPress={(e) => {
                e.stopPropagation?.();
                if (sale.id === selectedSaleId) {
                  handleSaleTap(sale.id);
                } else {
                  selectPin(sale);
                }
              }}
              tracksViewChanges={false}
            >
              <MapPin
                status={sale.status}
                favorited={isFavorited(sale.id)}
                num={idx + 1}
                openNow={isOpenNow(sale)}
              />
            </Marker>
          );
        })}
      </MapView>
      ) : null}

      {/* Selected-pin callout — plain overlay positioned at the pin's
          screen point. Hidden until measured (calloutSize) to avoid a
          one-frame flash at the wrong spot. Tapping it opens the sale. */}
      {selectedSale && calloutPoint ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: calloutPoint.x,
            top: calloutPoint.y,
          }}
        >
          <Pressable
            onPress={() => handleSaleTap(selectedSale.id)}
            onLayout={(e) =>
              setCalloutSize({
                w: e.nativeEvent.layout.width,
                h: e.nativeEvent.layout.height,
              })
            }
            style={{
              position: 'absolute',
              // Center horizontally on the pin; sit the tail tip ~16pt
              // above the pin's center (pins are ~30pt tall).
              left: -calloutSize.w / 2,
              top: -calloutSize.h - 16,
              opacity: calloutSize.h > 0 ? 1 : 0,
            }}
          >
            <SelectedPinCallout
              sale={selectedSale}
              userLat={userLocation?.latitude}
              userLng={userLocation?.longitude}
              onPress={() => handleSaleTap(selectedSale.id)}
            />
          </Pressable>
        </View>
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

      {/* Route planner pill — hidden behind ROUTE_PLANNER_ENABLED while
          the planner is parked. Anchored just below the chip row
          baseline when shown. */}
      {ROUTE_PLANNER_ENABLED && savedCount > 0 && (
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

      {/* My-location FAB — FIXED just above the peek sheet, never moves.
          Rendered BEFORE <BottomSheet/> in the tree, so when the sheet
          expands to the open snap it slides up and over the FAB,
          hiding it cleanly (no point offering "locate" while the list
          covers the map). Previously the FAB animated its own `bottom`
          between two values to track the sheet, which jumped instantly
          while the sheet eased over ~300ms — that mismatch was the
          jank. A fixed anchor + natural occlusion removes it entirely. */}
      <Pressable
        onPress={goToUserLocation}
        accessibilityRole="button"
        accessibilityLabel="My location"
        style={{
          position: 'absolute',
          right: 16,
          bottom: SHEET_PEEK + 14,
          width: 44,
          height: 44,
          borderRadius: 22,
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
        <Ionicons name="locate" size={20} color={BRAND} />
      </Pressable>

      {/* Bottom sheet */}
      <BottomSheet
        state={sheetState}
        onStateChange={setSheetState}
        peekHeight={SHEET_PEEK}
        openHeight={SHEET_OPEN}
      >
        {/* Gorhom owns ALL dragging: the grabber handle drags from
            anywhere, and BottomSheetFlatList coordinates vertical
            scroll ↔ sheet collapse natively in the open state. We do
            NOT layer our own PanGestureHandler on top — doing so made
            two gesture systems set sheetState in the same frame and
            the sheet "fought" the drag. The header's List/Map pill is
            the explicit tap-to-toggle. */}
        <SheetHeader
          state={sheetState}
          count={sortedSales.length}
          onToggle={() =>
            setSheetState((s) => (s === 'open' ? 'peek' : 'open'))
          }
        />
        {/* Peek shows only the slim header bar — no cards. The map gets
            the space, and tapping the header expands to the full list.
            (Carousel cards were getting clipped by the peek height.) */}
        {sheetState === 'open' ? (
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
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
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
        ) : null}
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
  // Dragging is disabled (see BottomSheet.tsx), so the ENTIRE header is
  // a single tap target that toggles peek ↔ open — a big, unambiguous
  // button. The "List/Map" pill on the right is the explicit visual
  // affordance.
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={state === 'open' ? 'Show map' : 'Show full list'}
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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 6,
          paddingLeft: 12,
          paddingRight: 10,
          borderRadius: 99,
          backgroundColor: BRAND_SOFT,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>
          {state === 'open' ? 'Map' : 'List'}
        </Text>
        <Ionicons
          name={state === 'open' ? 'chevron-down' : 'chevron-up'}
          size={16}
          color={BRAND}
          style={{ marginLeft: 3 }}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BONE },
});
