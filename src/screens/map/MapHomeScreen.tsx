import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Circle, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as SplashScreen from 'expo-splash-screen';
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
import { useSaleEvents } from '../../hooks/useSaleEvents';
import { useAuth } from '../../hooks/useAuth';
import { navigateToAuth } from '../../lib/navigationRef';
import { saleDisplayLocation } from '../../lib/locationPrivacy';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useLastMapRegion } from '../../hooks/useLastMapRegion';
import { useFavorites } from '../../hooks/useFavorites';
import { useVisited } from '../../hooks/useVisited';
import { useSeenSales } from '../../hooks/useSeenSales';
import { MapStackParamList, Sale } from '../../types';
import { MapPin } from '../../components/MapPin';
import { SnapshotMarker } from '../../components/SnapshotMarker';
import { SelectedPinCallout } from '../../components/SelectedPinCallout';
import { BottomSheet, SheetState } from '../../components/BottomSheet';
import SaleCard from '../../components/SaleCard';
import { haversineMeters } from '../../utils/distance';
import { isOpenNow, isRecentlyPosted } from '../../utils/saleStatus';
import { useMapFilters } from '../../lib/mapFilters';
import { saleMatchesFilters } from '../../lib/filterSales';
import { useSearchArea, setSearchArea } from '../../lib/searchArea';
import { useViewport, setViewport, regionContains } from '../../lib/viewport';
import { zoomBucket, thinPins } from '../../lib/pinThinning';
import { toast } from '../../lib/toast';
import { ROUTE_PLANNER_ENABLED } from '../../lib/featureFlags';

type Nav = NativeStackNavigationProp<MapStackParamList, 'MapHome'>;
type Route = RouteProp<MapStackParamList, 'MapHome'>;

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

// Map zoom (latitude/longitude delta) used when flying to a searched
// area — roughly a city-sized view.
const CITY_DELTA = 0.25;

// Peek is now just the slim header bar (count + "List" toggle) — no
// carousel — so it only needs ~the header height (grabber + two text
// lines ≈ 67pt). Sized snug so the map gets as much room as possible
// until the user expands to the list.
const SHEET_PEEK = 76;
// Open list fills most of the screen (leaving the search card + chips
// visible up top) so you can actually browse the whole list, not a
// 420pt window of it. Adapts to the device height.
const SHEET_OPEN = Math.round(Dimensions.get('window').height * 0.66);

// Screen size drives how coarse the pin-thinning grid is (so a cell lands at a
// sensible on-screen spacing). Read once — the map is portrait-locked.
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';


export default function MapHomeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const { sales, loading, error: salesError, refetch: refetchSales } = useSales();
  const { events: saleEvents, refetch: refetchEvents } = useSaleEvents();
  const { user } = useAuth();
  const { isFavorited, refetch: refetchFavorites } = useFavorites();
  const { isVisited, visitedCount } = useVisited();
  const { isSeen, seenCount } = useSeenSales();
  const userLocation = useUserLocation();
  const { region: lastRegion, save: saveLastRegion } = useLastMapRegion();

  // Active "search an area" target (e.g. "Muncie, IN"). When set it only
  // recenters the map there; the resulting viewport then scopes the list
  // (Zillow-style). Distance/sort still use GPS (markers) / the map center
  // (list) — searchArea does not change that math.
  const searchArea = useSearchArea();

  // Filter state — driven by the shared mapFilters store so the
  // FilterSheet modal can read/write the same object.
  const filters = useMapFilters();

  // The map's current visible region drives which sales show — Zillow
  // style, the viewport IS the filter. Updated on every settle below.
  const viewport = useViewport();

  // Inline area search (the text field in the top card). `areaQuery` is the
  // raw text; submitting geocodes it into a searchArea.
  const [areaQuery, setAreaQuery] = useState(searchArea?.label ?? '');
  const [areaSearching, setAreaSearching] = useState(false);

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
    if (searchArea) {
      return {
        latitude: searchArea.latitude,
        longitude: searchArea.longitude,
        latitudeDelta: CITY_DELTA,
        longitudeDelta: CITY_DELTA,
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
  }, [focusLat, focusLng, searchArea, userLocation, gpsTimedOut, lastRegion]);
  const mapReady = initialRegion != null;

  // Cold-start handoff from the native splash: MainGate leaves the splash up
  // when routing to MainTabs, and we drop it here only once the map is truly
  // presentable — region resolved (mapReady) AND the native map initialized
  // (onMapReady). Hiding on either alone flashes this screen's loading
  // placeholder (the "white screen with a spinner" between splash and map).
  // hideAsync is idempotent; App.tsx keeps a 5s safety net if neither fires.
  const [nativeMapReady, setNativeMapReady] = useState(false);
  useEffect(() => {
    if (mapReady && nativeMapReady) SplashScreen.hideAsync().catch(() => {});
  }, [mapReady, nativeMapReady]);

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

  // Refresh sales + favorites when Map is re-focused. Realtime pushes live
  // updates, but it's best-effort (events are lost across socket drops /
  // backgrounding / bursts), so this focus refetch reconciles any sales that
  // appeared while we weren't listening — otherwise the map can go stale.
  useFocusEffect(
    useCallback(() => {
      refetchSales();
      refetchFavorites();
      refetchEvents();
    }, [refetchSales, refetchFavorites, refetchEvents]),
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

  // Fly to a searched area when one is set; the viewport updates on settle,
  // which scopes the list to that area. When the area is CLEARED, fly back
  // to the user so the list refreshes to "near me" instead of staying
  // parked (and stale) on the old area.
  const prevSearchAreaRef = useRef(searchArea);
  useEffect(() => {
    const was = prevSearchAreaRef.current;
    prevSearchAreaRef.current = searchArea;
    if (searchArea) {
      mapRef.current?.animateToRegion(
        {
          latitude: searchArea.latitude,
          longitude: searchArea.longitude,
          latitudeDelta: CITY_DELTA,
          longitudeDelta: CITY_DELTA,
        },
        500,
      );
    } else if (was && userLocation) {
      // Area just cleared → return to the user's location.
      mapRef.current?.animateToRegion(
        {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        500,
      );
    }
  }, [searchArea, userLocation]);

  // MAP MARKER set — attribute filters (open now, categories, when, vibe)
  // + savedOnly only. Deliberately NOT viewport-scoped: re-filtering the
  // markers on every pan made react-native-maps add/remove AIRMap subviews
  // constantly, which crashes under the new architecture
  // (-[AIRMap insertReactSubview:atIndex:] object cannot be nil). Keeping
  // the marker set stable across pans avoids that churn. Sorted by distance
  // from the user so the closest sale wins on a priority tie while thinning.
  const mapSales = useMemo(() => {
    let result = sales.filter((s) => saleMatchesFilters(s, filters));
    if (filters.savedOnly) result = result.filter((s) => isFavorited(s.id));
    if (userLocation) {
      const d = (s: Sale) =>
        haversineMeters(
          userLocation.latitude,
          userLocation.longitude,
          s.latitude,
          s.longitude,
        );
      result = [...result].sort((a, b) => d(a) - d(b));
    }
    return result;
  }, [sales, filters, isFavorited, userLocation]);

  // VISUAL pin thinning (Zillow-style level of detail). CRUCIAL: we do NOT
  // add/remove markers to thin them. Under the new architecture, ANY change to
  // the mounted marker set churns AIRMap subviews and crashes
  // (-[AIRMap insertReactSubview:atIndex:] object cannot be nil) — that's why
  // the marker set is the full, stable mapSales. So every pin stays mounted
  // always; thinning just fades the non-representative ones to opacity 0 (a
  // prop update on an existing view, never a subview insert).
  //
  // `grid` is derived from the ZOOM only (a snapped integer bucket), so the
  // visible set changes only when zoom crosses a threshold, not on pan. Before
  // the first settle publishes a viewport we bucket off initialRegion. The
  // selected pin is always kept visible so its callout never floats over an
  // empty spot.
  const grid = useMemo(
    () =>
      zoomBucket(
        viewport ?? initialRegion ?? DEFAULT_REGION,
        SCREEN_W,
        SCREEN_H,
      ),
    [viewport, initialRegion],
  );
  // The thinned set, keyed ONLY on inputs that actually change it — so it
  // doesn't recompute on every pin tap/deselect.
  const baseVisibleIds = useMemo(
    () =>
      new Set(
        thinPins(mapSales, grid.kx, grid.ky, isFavorited, isVisited).map(
          (s) => s.id,
        ),
      ),
    // visitedCount changes when a visit is toggled (isVisited is stable), so
    // it's the dep that re-thins after you mark a sale visited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapSales, grid.kx, grid.ky, isFavorited, isVisited, visitedCount],
  );
  // Layer the selected pin on top (kept visible through a zoom that thinned it
  // out). When nothing is selected — or it's already shown — reuse the base set
  // so the markers' opacity props don't thrash on selection.
  const visibleIds = useMemo(() => {
    if (!selectedSaleId || baseVisibleIds.has(selectedSaleId)) {
      return baseVisibleIds;
    }
    return new Set(baseVisibleIds).add(selectedSaleId);
  }, [baseVisibleIds, selectedSaleId]);

  // Clear a selection whose sale has left the rendered set entirely (e.g. a
  // filter toggle removed it from mapSales while the FilterSheet was open).
  // Otherwise the callout overlay — driven by the full `sales` list, not
  // mapSales — would float over a now-empty spot with no pin beneath it.
  useEffect(() => {
    if (selectedSaleId && !mapSales.some((s) => s.id === selectedSaleId)) {
      setSelectedSaleId(null);
      setCalloutPoint(null);
    }
  }, [mapSales, selectedSaleId]);

  // LIST (bottom-sheet) set — the markers scoped to what's currently in the
  // map viewport (Zillow-style), sorted by distance from the map center.
  // This is the set that changes as you pan; the markers above don't.
  const sortedSales = useMemo(() => {
    if (!viewport) return mapSales;
    const inView = mapSales.filter((s) =>
      regionContains(viewport, s.latitude, s.longitude),
    );
    const d = (s: Sale) =>
      haversineMeters(
        viewport.latitude,
        viewport.longitude,
        s.latitude,
        s.longitude,
      );
    return [...inView].sort((a, b) => d(a) - d(b));
  }, [mapSales, viewport]);

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

  // The selected id in a ref so the pin press handler stays identity-stable:
  // selecting a pin must not rebuild the 45-marker array below.
  const selectedSaleIdRef = useRef<string | null>(null);
  useEffect(() => { selectedSaleIdRef.current = selectedSaleId; }, [selectedSaleId]);

  const onPinPress = useCallback(
    (sale: Sale, e: { stopPropagation?: () => void }) => {
      e.stopPropagation?.();
      if (sale.id === selectedSaleIdRef.current) {
        handleSaleTap(sale.id);
      } else {
        selectPin(sale);
      }
    },
    [handleSaleTap, selectPin],
  );

  // Re-derive openNow once a minute (a sale turning 8 AM should go green
  // without waiting for an unrelated re-render).
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // The 45-pin marker array, memoized so pans, selections, and unrelated
  // state changes stop re-running per-pin derivation on every render. The
  // seen/visited hooks are identity-stable module stores, so their COUNTS
  // are the honest cache keys; isFavorited's identity changes with the set.
  const saleMarkers = useMemo(
    () =>
      mapSales.map((sale) => {
        // Honor the host's address privacy: a 'reply'-mode sale shows a
        // deterministically-offset pin (near, not on, the real address)
        // to anyone but the owner. 'live'/legacy sales show exact.
        const loc = saleDisplayLocation(sale, {
          isOwner: !!user && sale.user_id === user.id,
        });
        // Zillow-style thinning WITHOUT churning the marker set: EVERY pin
        // stays mounted (adding/removing markers crashes AIRMap under the
        // new arch); thinned-out pins are merely faded to opacity 0 and made
        // non-interactive. Pins never swap their child or change key — they
        // stay static MapPins; the selected callout is a separate overlay.
        const visible = visibleIds.has(sale.id);
        const favorited = isFavorited(sale.id);
        const isNew = isRecentlyPosted(sale.created_at) && !isSeen(sale.id);
        const visited = isVisited(sale.id);
        const openNow = isOpenNow(sale);
        return (
          <SnapshotMarker
            key={sale.id}
            coordinate={{
              latitude: loc.latitude,
              longitude: loc.longitude,
            }}
            opacity={visible ? 1 : 0}
            onPress={visible ? (e) => onPinPress(sale, e) : undefined}
            redrawKey={`${sale.status}|${favorited}|${isNew}|${visited}|${openNow}`}
          >
            <MapPin
              status={sale.status}
              favorited={favorited}
              isNew={isNew}
              visited={visited}
              openNow={openNow}
            />
          </SnapshotMarker>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapSales, visibleIds, isFavorited, isVisited, isSeen, visitedCount, seenCount, minuteTick, user?.id, onPinPress],
  );

  const goToUserLocation = useCallback(async () => {
    // Tapping locate clears any active area search and returns to "me".
    setSearchArea(null);
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
      // The visible region IS the filter (Zillow-style): publish it so the
      // list + count rescope to what's now on screen.
      setViewport(region);
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

  // Geocode the typed text into a search area (built-in geocoder, no key).
  const handleAreaSearch = useCallback(async () => {
    const q = areaQuery.trim();
    if (!q) return;
    Keyboard.dismiss();
    setAreaSearching(true);
    try {
      // Typing a neighborhood sale's name should work like typing a city:
      // fly to its circle and open its page. Checked before geocoding so
      // "Maple Grove Sale" doesn't get swallowed by the place lookup.
      const qLower = q.toLowerCase();
      const eventMatch = saleEvents.find((e) =>
        e.title.toLowerCase().includes(qLower),
      );
      if (eventMatch) {
        // Route through the same searchArea mechanism the geocode branch
        // below uses (not a direct animateToRegion): the searchArea effect
        // drives the fly-to while the map is mounted, and — critically —
        // initialRegion reads searchArea ahead of sessionRegionRef, so
        // returning from EventDetail re-seeds the map here even though the
        // in-flight animation gets cut short by the MapView unmounting on
        // blur (isFocused ? <MapView/> : null).
        setSearchArea({
          latitude: eventMatch.latitude,
          longitude: eventMatch.longitude,
          label: eventMatch.title,
        });
        setAreaQuery(eventMatch.title);
        // onRegionChangeComplete (which normally keeps this ref current)
        // never fires because the animation is interrupted — seed it
        // directly so the fallback path (searchArea later cleared with no
        // GPS) still has a sane region instead of a stale pre-search one.
        sessionRegionRef.current = {
          latitude: eventMatch.latitude,
          longitude: eventMatch.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
        navigation.navigate('EventDetail', { eventId: eventMatch.id });
        return;
      }
      const results = await Location.geocodeAsync(q);
      if (!results.length) {
        toast.error(
          "Couldn't find that place",
          'Try a city and state, like “Muncie, IN”.',
        );
        return;
      }
      const { latitude, longitude } = results[0];
      let label = q;
      try {
        const rev = await Location.reverseGeocodeAsync({ latitude, longitude });
        const p = rev[0];
        const nice = [p?.city, p?.region].filter(Boolean).join(', ');
        if (nice) label = nice;
      } catch {
        /* keep typed text as the label */
      }
      setSearchArea({ latitude, longitude, label });
      setAreaQuery(label);
    } catch {
      toast.error("Couldn't search", 'Check your connection and try again.');
    } finally {
      setAreaSearching(false);
    }
  }, [areaQuery, saleEvents, navigation]);

  // Clear the text + any active area. When GPS is available the searchArea
  // effect flies back to the user (and the viewport/list refreshes on
  // settle). With no GPS there's nothing to fly to, so drop the viewport
  // scope instead — otherwise the list stays stuck on the old searched area.
  const handleClearArea = useCallback(() => {
    setAreaQuery('');
    setSearchArea(null);
    Keyboard.dismiss();
    if (!userLocation) setViewport(null);
  }, [userLocation]);

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
        onMapReady={() => setNativeMapReady(true)}
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
        {saleMarkers}
        {/* Neighborhood sale events — additive layer (spec: thinning untouched). */}
        {saleEvents.map((ev) => (
          <React.Fragment key={ev.id}>
            <Circle
              center={{ latitude: ev.latitude, longitude: ev.longitude }}
              radius={ev.radius_m}
              strokeColor="rgba(31,77,58,0.40)"
              fillColor="rgba(31,77,58,0.07)"
            />
            {/* No custom anchor: Fabric-Android displaces the tap hit-region
                for anchored markers (a center tap missed; a tap half a bitmap
                up landed) — the default bottom anchor is the code path the 45
                sale pins prove out. zIndex lifts the badge's hit-test above
                the transparent padding of overlapping pin bitmaps. */}
            <SnapshotMarker
              coordinate={{ latitude: ev.latitude, longitude: ev.longitude }}
              zIndex={10}
              redrawKey={ev.sale_count ?? 0}
              onPress={(e) => {
                e.stopPropagation?.();
                navigation.navigate('EventDetail', { eventId: ev.id });
              }}
            >
              {/* Android/new-arch gives a custom marker a fixed ~36dp bitmap
                  and crops the child into it top-left (verified empirically:
                  a 120×60 frame rendered only its top-left corner). So on
                  Android the event marker is a 32dp cluster-style count badge
                  that fits the box; iOS renders children live and keeps the
                  home-icon pill. */}
              {Platform.OS === 'android' ? (
                <View
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: '#1F4D3A',
                    borderWidth: 2, borderColor: '#fff',
                    alignItems: 'center', justifyContent: 'center',
                    // No elevation: the shadow inflates the drawn bounds past
                    // the marker's fixed bitmap and gets clipped anyway.
                  }}
                >
                  <Text
                    style={{
                      color: '#fff', fontSize: 11, fontWeight: '800',
                      includeFontPadding: false,
                    }}
                  >
                    {ev.sale_count ?? 0}
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: '#1F4D3A', paddingHorizontal: 9, paddingVertical: 5,
                    borderRadius: 999, borderWidth: 1.5, borderColor: '#fff',
                    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Ionicons name="home" size={11} color="#fff" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                    {ev.sale_count ?? 0}
                  </Text>
                </View>
              )}
            </SnapshotMarker>
          </React.Fragment>
        ))}
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
          value={areaQuery}
          onChangeText={setAreaQuery}
          onSubmit={handleAreaSearch}
          onClear={handleClearArea}
          hasArea={!!searchArea}
          searching={areaSearching}
          onFilters={handleFilterOpen}
        />

        {salesError && !loading ? (
          <Pressable
            onPress={refetchSales}
            accessibilityRole="button"
            accessibilityLabel="Retry loading sales"
            style={{
              marginTop: 8,
              backgroundColor: '#fff',
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 1,
              borderColor: '#F0D9D3',
            }}
          >
            <Ionicons name="cloud-offline-outline" size={15} color="#A23E2D" />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: INK }}>
              {"Couldn’t load sales. Tap to retry."}
            </Text>
          </Pressable>
        ) : null}

      </View>

      {/* Guest "Sign in" pill — persistent affordance while browsing without
          an account, so the door into the account flow is always visible
          (gated actions prompt too, but discoverability shouldn't require
          tripping a gate). Sits just below the search card, right-aligned. */}
      {!user && (
        <Pressable
          onPress={() => navigateToAuth('signin')}
          style={{
            position: 'absolute',
            right: 12,
            top: insets.top + 68,
            backgroundColor: BRAND,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign in or create an account"
        >
          <Ionicons name="person-circle-outline" size={15} color="#fff" />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#fff' }}>
            Sign in
          </Text>
        </Pressable>
      )}

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
        {/* Sheet dragging is disabled (see BottomSheet.tsx) — the
            List/Map pill in the header is the only open/close control.
            The open-state list is a PLAIN RN FlatList so it scrolls
            natively without gorhom routing the swipe into a sheet-drag. */}
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
          // Plain RN FlatList (NOT gorhom's) + dragging disabled on the
          // sheet: the list scrolls natively with nothing competing for
          // the gesture. With gorhom's BottomSheetFlatList the upward
          // swipe got eaten as a sheet-drag and collapsed the sheet.
          // flex:1 gives it the bounded height it needs to scroll.
          <FlatList
            style={{ flex: 1 }}
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
                    No sales in this area. Try zooming out or moving the map.
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
  value,
  onChangeText,
  onSubmit,
  onClear,
  hasArea,
  searching,
  onFilters,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  hasArea?: boolean;
  searching?: boolean;
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
      <Ionicons
        name={hasArea ? 'location' : 'search-outline'}
        size={16}
        color={hasArea ? BRAND : INK_SOFT}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="Search a city, ZIP, or area"
        placeholderTextColor={INK_MUTED}
        returnKeyType="search"
        autoCapitalize="words"
        autoCorrect={false}
        style={{
          flex: 1,
          marginLeft: 8,
          fontSize: 14,
          fontWeight: '600',
          color: INK,
          paddingVertical: 0,
        }}
        accessibilityLabel="Search an area"
      />
      {searching ? (
        <ActivityIndicator size="small" color={BRAND} style={{ marginLeft: 6 }} />
      ) : value ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          style={{ marginLeft: 6, padding: 2 }}
        >
          <Ionicons name="close-circle" size={18} color={INK_MUTED} />
        </Pressable>
      ) : null}
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
