import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Image } from 'expo-image';

import { SubHeader } from '../../components/SubHeader';
import { useFavorites } from '../../hooks/useFavorites';
import { useSales } from '../../hooks/useSales';
import { useUserLocation } from '../../hooks/useUserLocation';
import { toast } from '../../lib/toast';
import { Sale } from '../../types';
import {
  PLACEHOLDER_BLURHASH,
  transformedImageUrl,
} from '../../lib/imageUrl';
import {
  computeItinerary,
  fmtTime,
  nowMinutes,
  orderByBestLoop,
  orderByClosingSoonest,
  regionForCoords,
  Stop,
} from '../../lib/routeItinerary';
import { isOpenNow } from '../../utils/saleStatus';
import { formatDistanceMiles, haversineMeters } from '../../utils/distance';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';
const AMBER_BG = '#FBEFD6';
const AMBER_FG = '#6B4318';
const BLUE = '#3478F6';

type Mode = 'loop' | 'closing' | 'custom';

/**
 * Route planner builder. Seeds from saved sales (falls back to the
 * nearest open sales when nothing is saved). Recomputes itinerary
 * every time the order changes; flags any stop whose estimated
 * arrival exceeds its closing time.
 *
 * Drive-time estimates are approximate (straight-line × 1.3 detour
 * factor / 30 mph) — see routeItinerary.ts. When a Directions API is
 * wired, swap that single helper out and the rest of this screen
 * keeps working unchanged.
 */
export default function RoutePlannerScreen() {
  const navigation = useNavigation<any>();
  // Unmount the preview MapView the moment the screen loses focus so
  // we don't have two AIRMaps active during the push animation into
  // SaleDetail / ActiveRoute. Two AIRMaps reconciling subviews at the
  // same time crashes under Fabric. See SaleDetailScreen for the
  // mirror-image guard.
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const { favorites, toggle: toggleFavorite } = useFavorites();
  const { sales } = useSales();
  const userLocation = useUserLocation();

  // Seed pool: saved sales if any, otherwise the 4 nearest open sales.
  const seedSales = useMemo<Sale[]>(() => {
    if (favorites.length > 0) return favorites.slice(0, 6);
    const open = sales.filter(isOpenNow);
    if (open.length === 0) return [];
    if (!userLocation) return open.slice(0, 4);
    const sorted = [...open].sort(
      (a, b) =>
        haversineMeters(
          userLocation.latitude,
          userLocation.longitude,
          a.latitude,
          a.longitude,
        ) -
        haversineMeters(
          userLocation.latitude,
          userLocation.longitude,
          b.latitude,
          b.longitude,
        ),
    );
    return sorted.slice(0, 4);
  }, [favorites, sales, userLocation]);

  // Ordered list of stop ids drives the itinerary + UI.
  const [order, setOrder] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('loop');
  const [addOpen, setAddOpen] = useState(false);

  // Seed `order` exactly once — when the seed list first lands. The
  // ref-guard is essential: without it, removing the last stop drops
  // order.length to 0, the effect re-fires, and the seed silently
  // re-inserts the stops the user just removed (looks like "remove
  // doesn't work").
  const seededOnce = useRef(false);
  useEffect(() => {
    if (seededOnce.current) return;
    if (order.length > 0) {
      seededOnce.current = true;
      return;
    }
    if (seedSales.length === 0) return;
    seededOnce.current = true;
    const ordered = userLocation
      ? orderByBestLoop(
          seedSales,
          userLocation.latitude,
          userLocation.longitude,
        )
      : orderByBestLoop(seedSales);
    setOrder(ordered.map((s) => s.id));
  }, [seedSales, order.length, userLocation]);

  // Resolve order → live Sale objects. `useSales()` filters out ended
  // sales, so for those we fall back to the favorites store which keeps
  // every saved sale regardless of status. Anything still null after
  // both lookups is a *deleted* sale — handled by the prune effect
  // below.
  const stops = useMemo<Sale[]>(() => {
    return order
      .map((id) => sales.find((s) => s.id === id) ?? favorites.find((f) => f.id === id))
      .filter((s): s is Sale => !!s);
  }, [order, sales, favorites]);

  const endedStops = useMemo(
    () => stops.filter((s) => s.status === 'ended'),
    [stops],
  );
  const endedCount = endedStops.length;

  // Silently prune deleted sales from the order on data settle. Both
  // `sales` and `favorites` come from Supabase async — wait until the
  // user has at least one of them before we trust a "missing" id, so
  // we don't toast on cold-start before favorites have loaded.
  const lastPruneCheck = useRef<string>('');
  useEffect(() => {
    if (order.length === 0) return;
    if (favorites.length === 0 && sales.length === 0) return;
    const stopIds = new Set(stops.map((s) => s.id));
    const dropped = order.filter((id) => !stopIds.has(id));
    if (dropped.length === 0) return;
    // De-dup against this exact dropped set so the toast doesn't loop.
    const sig = dropped.slice().sort().join(',');
    if (sig === lastPruneCheck.current) return;
    lastPruneCheck.current = sig;
    setOrder((o) => o.filter((id) => stopIds.has(id)));
    // Also clear them from favorites so saved-sales count stays honest.
    dropped.forEach((id) => {
      if (favorites.some((f) => f.id === id)) toggleFavorite(id);
    });
    toast.info(
      dropped.length === 1
        ? '1 stop was removed'
        : `${dropped.length} stops were removed`,
      'They’re no longer available.',
    );
  }, [order, stops, favorites, sales, toggleFavorite]);

  // Bulk-remove every ended stop in one tap: unfavorite each (which
  // also removes them from any future seed) and drop them from the
  // current order.
  const clearEnded = useCallback(() => {
    const ids = endedStops.map((s) => s.id);
    if (ids.length === 0) return;
    setOrder((o) => o.filter((id) => !ids.includes(id)));
    ids.forEach((id) => toggleFavorite(id));
    toast.success(
      ids.length === 1 ? 'Removed 1 ended sale' : `Removed ${ids.length} ended sales`,
    );
  }, [endedStops, toggleFavorite]);

  const itin = useMemo<Stop[]>(() => {
    if (stops.length === 0) return [];
    return computeItinerary(stops, {
      startMin: nowMinutes(),
      startLat: userLocation?.latitude,
      startLng: userLocation?.longitude,
    });
  }, [stops, userLocation]);

  // Don't double-flag ended stops in the missed banner — they get
  // their own banner above. Only count stops that are still live but
  // we won't reach in time.
  const missedCount = itin.filter(
    (s) => s.missed && s.sale.status !== 'ended',
  ).length;
  const totalSpan =
    itin.length > 0 ? itin[itin.length - 1].depart - itin[0].arrival + itin[0].driveFromPrev : 0;
  const totalDrive = itin.reduce((sum, s) => sum + s.driveFromPrev, 0);

  const handleMode = (m: Mode) => {
    setMode(m);
    if (m === 'closing') {
      setOrder(orderByClosingSoonest(stops).map((s) => s.id));
    } else if (m === 'loop') {
      setOrder(
        orderByBestLoop(
          stops,
          userLocation?.latitude,
          userLocation?.longitude,
        ).map((s) => s.id),
      );
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= order.length) return;
    const next = [...order];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    setOrder(next);
    setMode('custom');
  };
  const remove = (id: string) => {
    setOrder((o) => o.filter((x) => x !== id));
    setMode('custom');
  };
  const add = (sale: Sale) => {
    setOrder((o) => [...o, sale.id]);
    setAddOpen(false);
    setMode('custom');
  };

  const handleReset = () => {
    const ordered = userLocation
      ? orderByBestLoop(seedSales, userLocation.latitude, userLocation.longitude)
      : orderByBestLoop(seedSales);
    setOrder(ordered.map((s) => s.id));
    setMode('loop');
    // Toast so the user gets explicit feedback even when the new
    // best-loop order happens to match the current order (then the
    // visual state doesn't change and Reset would otherwise feel inert).
    toast.info(
      seedSales.length === 0
        ? 'Nothing to reset to'
        : `Reset to ${seedSales.length} saved ${seedSales.length === 1 ? 'sale' : 'sales'}`,
    );
  };

  const handleStart = () => {
    if (stops.length === 0) return;
    navigation.navigate('ActiveRoute', { saleIds: stops.map((s) => s.id) });
  };

  // `useSales()` already filters out ended sales, but we also drop
  // anything already in the order so the picker doesn't offer dupes.
  const poolToAdd = useMemo(
    () => sales.filter((s) => !order.includes(s.id) && s.status !== 'ended'),
    [sales, order],
  );

  // Map region that fits all stops + the user's start.
  const mapRegion = useMemo(() => {
    const coords = stops.map((s) => ({
      latitude: s.latitude,
      longitude: s.longitude,
    }));
    if (userLocation) {
      coords.push({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      });
    }
    return regionForCoords(coords);
  }, [stops, userLocation]);

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader
        title="Saturday route"
        right={
          <Pressable
            onPress={handleReset}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Reset route"
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: BRAND }}>
              Reset
            </Text>
          </Pressable>
        }
      />

      {/* Map preview */}
      <View
        style={{
          height: 188,
          backgroundColor: BRAND_SOFT,
        }}
      >
        {mapRegion && isFocused ? (
          // Key the MapView on the set of stop ids so add/remove forces a
          // full remount rather than mutating the live AIRMap. Marker
          // removal from a mounted MapView under Fabric races
          // -[AIRMap insertReactSubview:atIndex:] and crashes with
          // "object cannot be nil". Reorders keep the same key (sorted)
          // so swapping stop order doesn't churn the MapView.
          <MapView
            key={[...stops.map((s) => s.id)].sort().join('|')}
            style={{ flex: 1 }}
            initialRegion={mapRegion}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            pointerEvents="none"
          >
            {stops.length > 1 ? (
              <Polyline
                coordinates={stops.map((s) => ({
                  latitude: s.latitude,
                  longitude: s.longitude,
                }))}
                strokeColor={BRAND}
                strokeWidth={3}
                lineDashPattern={[3, 6]}
              />
            ) : null}
            {stops.map((s, i) => (
              <Marker
                key={s.id}
                coordinate={{ latitude: s.latitude, longitude: s.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 99,
                    borderWidth: 3,
                    borderColor: '#fff',
                    backgroundColor: itin[i]?.missed ? ROSE : BRAND,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}
                  >
                    {i + 1}
                  </Text>
                </View>
              </Marker>
            ))}
            {userLocation ? (
              <Marker
                key="user-start"
                coordinate={{
                  latitude: userLocation.latitude,
                  longitude: userLocation.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 99,
                    borderWidth: 2,
                    borderColor: '#fff',
                    backgroundColor: BLUE,
                  }}
                />
              </Marker>
            ) : null}
          </MapView>
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator color={BRAND} />
          </View>
        )}
        {/* Summary chip */}
        {stops.length > 0 && (
          <View
            style={{
              position: 'absolute',
              left: 12,
              bottom: 10,
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: 10,
              paddingVertical: 7,
              paddingHorizontal: 11,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: INK }}>
              {stops.length} stops
            </Text>
            <Dot />
            <Text style={{ fontSize: 12, fontWeight: '600', color: INK_SOFT }}>
              {totalSpan} min
            </Text>
            <Dot />
            <Text style={{ fontSize: 12, fontWeight: '600', color: INK_SOFT }}>
              {totalDrive} min driving
            </Text>
          </View>
        )}
      </View>

      {/* Optimize toggle */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 4,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: INK_MUTED,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Order by
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
          <ModeChip
            label="Best loop"
            active={mode === 'loop'}
            onPress={() => handleMode('loop')}
          />
          <ModeChip
            label="Closing soonest"
            active={mode === 'closing'}
            onPress={() => handleMode('closing')}
          />
        </View>
      </View>

      {/* Ended-stops banner. Shows when one or more of the user's
          saved stops have officially ended (host called it). Single
          tap on "Remove ended" unfavorites them and drops them from
          the order. Distinct from the amber "may close" banner below
          — this is a hard signal (sale's over), that one is a soft
          signal (you might not arrive in time). */}
      {endedCount > 0 ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            padding: 10,
            backgroundColor: '#F5DDD7',
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
          }}
        >
          <Ionicons name="alert-circle" size={16} color={ROSE} />
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              color: ROSE,
              lineHeight: 17,
            }}
          >
            <Text style={{ fontWeight: '700' }}>
              {endedCount} saved sale{endedCount > 1 ? 's have' : ' has'} ended.
            </Text>{' '}
            They’re still on the route until you remove them.
          </Text>
          <Pressable
            onPress={clearEnded}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${endedCount} ended sale${endedCount > 1 ? 's' : ''}`}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: ROSE }}>
              Remove
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Conflict banner */}
      {missedCount > 0 && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            padding: 10,
            backgroundColor: AMBER_BG,
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
          }}
        >
          <Text style={{ fontSize: 15 }}>⚠️</Text>
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              color: AMBER_FG,
              lineHeight: 17,
            }}
          >
            <Text style={{ fontWeight: '700' }}>
              {missedCount} stop{missedCount > 1 ? 's' : ''} may close before
              you arrive.
            </Text>{' '}
            Try &ldquo;Closing soonest&rdquo;.
          </Text>
        </View>
      )}

      {/* Timeline. `flex: 1` is critical so the ScrollView claims the
          remaining column space below the map/toggle/banner — without
          it RN gives the ScrollView its content's natural size, the
          rows render at full height each, and nothing scrolls. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 120 + insets.bottom,
        }}
      >
        <StartRow startMin={nowMinutes()} />
        {stops.map((sale, i) => (
          <StopTimelineRow
            key={sale.id}
            sale={sale}
            stop={itin[i]}
            index={i}
            total={stops.length}
            onUp={() => move(i, -1)}
            onDown={() => move(i, 1)}
            onRemove={() => remove(sale.id)}
            onOpen={() =>
              navigation.navigate('SaleDetail', { saleId: sale.id })
            }
          />
        ))}
        {/* Add a stop */}
        <View style={{ flexDirection: 'row', gap: 11, marginTop: 14 }}>
          <View style={{ width: 28 }} />
          <Pressable
            onPress={() => setAddOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a stop"
            style={({ pressed }) => ({
              flex: 1,
              borderWidth: 1.5,
              borderColor: HAIRLINE,
              borderStyle: 'dashed',
              borderRadius: 14,
              padding: 13,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              backgroundColor: pressed ? '#fff' : 'transparent',
            })}
          >
            <Ionicons name="add" size={15} color={INK_SOFT} />
            <Text
              style={{ fontSize: 13, fontWeight: '600', color: INK_SOFT }}
            >
              Add a stop
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Sticky start */}
      {stops.length > 0 && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: HAIRLINE,
            paddingTop: 12,
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom, 12) + 14,
          }}
        >
          <Pressable
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel={`Start route, ${totalSpan} minutes`}
            style={({ pressed }) => ({
              backgroundColor: pressed ? '#163828' : BRAND,
              borderRadius: 14,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            })}
          >
            <Ionicons name="car-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
              Start route · {totalSpan} min
            </Text>
          </Pressable>
        </View>
      )}

      {/* Add stop modal */}
      <Modal
        visible={addOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAddOpen(false)}
      >
        <Pressable
          onPress={() => setAddOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(20,18,15,0.4)' }}
        />
        <View
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 12,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 16,
            maxHeight: '70%',
          }}
        >
          <View
            style={{
              width: 38,
              height: 4,
              backgroundColor: HAIRLINE,
              borderRadius: 99,
              alignSelf: 'center',
              marginBottom: 14,
            }}
          />
          <Text
            style={{
              fontSize: 17,
              fontWeight: '700',
              color: INK,
              marginBottom: 4,
            }}
          >
            Add a stop
          </Text>
          <Text style={{ fontSize: 12, color: INK_MUTED, marginBottom: 12 }}>
            Nearby sales open today
          </Text>
          <ScrollView>
            {poolToAdd.length === 0 ? (
              <Text
                style={{
                  fontSize: 12,
                  color: INK_MUTED,
                  paddingVertical: 12,
                  textAlign: 'center',
                }}
              >
                All nearby sales are already on your route.
              </Text>
            ) : (
              poolToAdd.map((s) => <AddStopRow key={s.id} sale={s} onAdd={add} userLat={userLocation?.latitude} userLng={userLocation?.longitude} />)
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Dot() {
  return (
    <View
      style={{
        width: 3,
        height: 3,
        borderRadius: 99,
        backgroundColor: HAIRLINE,
      }}
    />
  );
}

function ModeChip({
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
        paddingVertical: 7,
        paddingHorizontal: 13,
        borderRadius: 99,
        backgroundColor: active ? BRAND : '#fff',
        borderWidth: active ? 0 : 1,
        borderColor: HAIRLINE,
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: active ? '#fff' : INK,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StartRow({ startMin }: { startMin: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingBottom: 6,
      }}
    >
      <View
        style={{
          width: 28,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 99,
            backgroundColor: BLUE,
            borderWidth: 2,
            borderColor: '#fff',
          }}
        />
      </View>
      <Text style={{ fontSize: 12, color: INK_MUTED, fontWeight: '600' }}>
        Start · Your location · {fmtTime(startMin)}
      </Text>
    </View>
  );
}

function StopTimelineRow({
  sale,
  stop,
  index,
  total,
  onUp,
  onDown,
  onRemove,
  onOpen,
}: {
  sale: Sale;
  stop: Stop | undefined;
  index: number;
  total: number;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  // `ended` is the hard-stop case ("sale is over") and dominates the
  // visual treatment over `missed` ("you might arrive after close").
  // When both flags would apply, ended wins.
  const ended = sale.status === 'ended';
  const missed = !ended && (stop?.missed ?? false);
  const flagged = ended || missed;
  const firstImage = sale.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 200,
    height: 200,
    resize: 'cover',
    quality: 75,
  });
  return (
    <View>
      {/* connector */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 11,
          height: 22,
        }}
      >
        <View style={{ width: 28, alignItems: 'center', height: '100%' }}>
          <View
            style={{ width: 2, height: '100%', backgroundColor: HAIRLINE }}
          />
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Ionicons name="car-outline" size={11} color={INK_MUTED} />
          <Text
            style={{
              fontSize: 10,
              color: INK_MUTED,
              fontVariant: ['tabular-nums'],
            }}
          >
            {stop?.driveFromPrev ?? 0} min drive
          </Text>
        </View>
      </View>

      {/* stop card. Height is pinned at 88pt so the thumbnail's
          `height: '100%'` resolves to a real value and the reorder
          column's `flex: 1` Pressables split into two even halves. */}
      <View style={{ flexDirection: 'row', gap: 11, height: 88 }}>
        <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 99,
              backgroundColor: flagged ? ROSE : BRAND,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
              {index + 1}
            </Text>
          </View>
        </View>
        <View
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: flagged ? ROSE : HAIRLINE,
            overflow: 'hidden',
            flexDirection: 'row',
            alignItems: 'stretch',
            opacity: ended ? 0.65 : 1,
          }}
        >
          <Pressable onPress={onOpen} style={{ width: 64, height: '100%' }}>
            {thumb ? (
              <Image
                source={{ uri: thumb }}
                placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
                style={{ width: 64, height: '100%' }}
                contentFit="cover"
                transition={120}
              />
            ) : (
              <View
                style={{
                  width: 64,
                  height: '100%',
                  backgroundColor: BRAND_SOFT,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="image-outline" size={20} color={BRAND} />
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={onOpen}
            style={{ flex: 1, padding: 10 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  flex: 1,
                  fontSize: 13.5,
                  fontWeight: '700',
                  color: INK,
                }}
                numberOfLines={1}
              >
                {sale.title}
              </Text>
              {ended ? (
                <View
                  style={{
                    backgroundColor: '#F5DDD7',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 99,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: '700',
                      color: ROSE,
                      letterSpacing: 0.3,
                    }}
                  >
                    ENDED
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={{ fontSize: 11, color: INK_MUTED, marginTop: 1 }}
              numberOfLines={1}
            >
              {sale.address}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginTop: 5,
              }}
            >
              {ended ? (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: ROSE,
                  }}
                >
                  This sale has ended
                </Text>
              ) : (
                <>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: missed ? ROSE : BRAND,
                    }}
                  >
                    Arrive ~{stop ? fmtTime(stop.arrival) : '—'}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: missed ? ROSE : INK_MUTED,
                    }}
                  >
                    {missed && stop
                      ? `closes ${fmtTime(stop.closeMin)} ✕`
                      : stop
                      ? `open till ${fmtTime(stop.closeMin)}`
                      : ''}
                  </Text>
                </>
              )}
            </View>
          </Pressable>
          {/* reorder */}
          <View
            style={{
              borderLeftWidth: 1,
              borderLeftColor: HAIRLINE,
            }}
          >
            <Pressable
              onPress={onUp}
              disabled={index === 0}
              hitSlop={4}
              style={{
                flex: 1,
                paddingHorizontal: 10,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: index === 0 ? 0.3 : 1,
              }}
              accessibilityLabel="Move up"
            >
              <Ionicons name="chevron-up" size={14} color={INK_SOFT} />
            </Pressable>
            <Pressable
              onPress={onDown}
              disabled={index === total - 1}
              hitSlop={4}
              style={{
                flex: 1,
                paddingHorizontal: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderTopWidth: 1,
                borderTopColor: HAIRLINE,
                opacity: index === total - 1 ? 0.3 : 1,
              }}
              accessibilityLabel="Move down"
            >
              <Ionicons name="chevron-down" size={14} color={INK_SOFT} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* remove. Bigger tap target + visible press feedback so the
          control feels real. The old 10.5pt Text-only Pressable with
          hitSlop=4 was effectively a ~70x18pt target — most users
          tapped next to it and saw nothing happen. */}
      <View style={{ flexDirection: 'row', gap: 11, marginTop: 6 }}>
        <View style={{ width: 28 }} />
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove stop ${index + 1}`}
          hitSlop={10}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 8,
            backgroundColor: pressed ? '#F5DDD7' : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          })}
        >
          <Ionicons name="close-circle-outline" size={12} color={ROSE} />
          <Text
            style={{ fontSize: 11.5, color: ROSE, fontWeight: '600' }}
          >
            Remove stop
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function AddStopRow({
  sale,
  onAdd,
  userLat,
  userLng,
}: {
  sale: Sale;
  onAdd: (s: Sale) => void;
  userLat?: number;
  userLng?: number;
}) {
  const firstImage = sale.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 140,
    height: 140,
    resize: 'cover',
    quality: 75,
  });
  const open = isOpenNow(sale);
  const dist =
    userLat != null && userLng != null
      ? haversineMeters(userLat, userLng, sale.latitude, sale.longitude)
      : null;
  return (
    <Pressable
      onPress={() => onAdd(sale)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: HAIRLINE,
        backgroundColor: pressed ? BONE : 'transparent',
      })}
      accessibilityRole="button"
      accessibilityLabel={`Add ${sale.title}`}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 10,
          overflow: 'hidden',
          backgroundColor: BRAND_SOFT,
        }}
      >
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="image-outline" size={18} color={BRAND} />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 13.5, fontWeight: '700', color: INK }}
          numberOfLines={1}
        >
          {sale.title}
        </Text>
        <Text
          style={{ fontSize: 11, color: INK_MUTED, marginTop: 1 }}
          numberOfLines={1}
        >
          {dist != null ? `${formatDistanceMiles(dist)} · ` : ''}
          {open ? 'Open now' : 'Closed'}
        </Text>
      </View>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 99,
          backgroundColor: BRAND_SOFT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="add" size={16} color={BRAND} />
      </View>
    </Pressable>
  );
}
