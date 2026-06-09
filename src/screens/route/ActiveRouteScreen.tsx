import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Linking,
  Platform,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useNavigation,
  useRoute,
  useIsFocused,
  RouteProp,
} from '@react-navigation/native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Image } from 'expo-image';

import { useSales } from '../../hooks/useSales';
import { useFavorites } from '../../hooks/useFavorites';
import { useAuth } from '../../hooks/useAuth';
import { useUserLocation } from '../../hooks/useUserLocation';
import {
  saleDisplayLocation,
  approximateAreaLabel,
} from '../../lib/locationPrivacy';
import { toast } from '../../lib/toast';
import { MapStackParamList, Sale } from '../../types';
import {
  PLACEHOLDER_BLURHASH,
  transformedImageUrl,
} from '../../lib/imageUrl';
import {
  computeItinerary,
  fmtTime,
  nowMinutes,
  regionForCoords,
} from '../../lib/routeItinerary';
import { HeaderButton } from '../../components/ui';

const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';
const ROSE_SOFT = '#F5DDD7';

type Route = RouteProp<MapStackParamList, 'ActiveRoute'>;

/**
 * Active route screen — in-progress, leg by leg.
 *
 * Trove plans the multi-stop loop; system maps drive each individual
 * leg. Tapping "Navigate" opens Apple Maps (iOS) / Google Maps with a
 * single-destination directions URL for the current stop. Tapping
 * "Visited" advances Trove's internal pointer so the map highlights
 * the next stop.
 *
 * No persistence in v1 — backing the user out of this screen drops
 * progress. That's fine for a single-Saturday flow.
 */
export default function ActiveRouteScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  // Unmount when not focused — pushing SaleDetail otherwise leaves two
  // AIRMap instances reconciling subviews concurrently and crashes
  // under Fabric. See SaleDetailScreen for the receiving-side guard.
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { sales, refetch: refetchSales } = useSales();
  // Saved sales survive the ended->not-returned-by-useSales filter, so
  // we fall back to them here. Without this an ended stop would just
  // silently vanish from the timeline instead of getting its skip CTA.
  const { favorites } = useFavorites();
  const { user } = useAuth();
  const userLocation = useUserLocation();

  const stops = useMemo<Sale[]>(() => {
    const ids = route.params?.saleIds ?? [];
    return ids
      .map(
        (id) =>
          sales.find((s) => s.id === id) ??
          favorites.find((f) => f.id === id),
      )
      .filter((s): s is Sale => !!s)
      // Bake address privacy into the routed sale (offset coords +
      // approximate address) for non-owner 'reply'-mode stops. This
      // closes the leak across markers, polyline, itinerary math, the
      // stop cards, AND the navigateLeg() external-maps hand-off, which
      // would otherwise send the user to the exact door.
      .map((s) => {
        const loc = saleDisplayLocation(s, {
          isOwner: !!user && s.user_id === user.id,
        });
        if (loc.showExactAddress) return s;
        return {
          ...s,
          latitude: loc.latitude,
          longitude: loc.longitude,
          address: approximateAreaLabel(s),
        };
      });
  }, [route.params?.saleIds, sales, favorites, user]);

  // Refetch sales on app foreground + on focus so a sale that flips to
  // `ended` mid-route gets surfaced as soon as the user looks at the
  // screen again. Cheap query — cached by Supabase and de-duped by the
  // hook.
  useEffect(() => {
    refetchSales();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetchSales();
    });
    return () => sub.remove();
  }, [refetchSales, isFocused]);

  const itin = useMemo(
    () =>
      computeItinerary(stops, {
        startMin: nowMinutes(),
        startLat: userLocation?.latitude,
        startLng: userLocation?.longitude,
      }),
    [stops, userLocation],
  );

  const [visited, setVisited] = useState<Set<string>>(new Set());
  const currentIdx = stops.findIndex((s) => !visited.has(s.id));
  const allDone = currentIdx === -1;
  const current = !allDone ? stops[currentIdx] : null;
  const nextStop =
    !allDone && currentIdx + 1 < stops.length ? stops[currentIdx + 1] : null;

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

  // Derive flags for the current stop. `ended` is the hard "host
  // closed it" signal; `missed` is "arrival > close time". When the
  // current stop is in either state we swap the bottom-card visual
  // to rose + change "Visited" → "Skip" so the user can keep moving
  // without polluting their completion stats with a real visit.
  const currentItin = currentIdx >= 0 ? itin[currentIdx] : null;
  const currentEnded = current?.status === 'ended';
  const currentMissed = !currentEnded && (currentItin?.missed ?? false);
  const currentFlagged = currentEnded || currentMissed;
  const lastWarned = useRef<string | null>(null);
  useEffect(() => {
    if (!current) return;
    if (!currentEnded) return;
    if (lastWarned.current === current.id) return;
    lastWarned.current = current.id;
    toast.info(
      'This sale has ended',
      'Tap Skip to move on to the next stop.',
    );
  }, [current, currentEnded]);

  const markVisited = () => {
    if (allDone || !current) return;
    setVisited((s) => new Set(s).add(current.id));
  };

  const navigateLeg = async () => {
    if (!current) return;
    const dest = `${current.latitude},${current.longitude}`;
    if (Platform.OS === 'ios') {
      await Linking.openURL(`maps://?daddr=${dest}`);
    } else {
      await Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`,
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      {/* Map */}
      <View style={{ flex: 1 }}>
        {mapRegion && isFocused ? (
          <MapView
            style={{ flex: 1 }}
            initialRegion={mapRegion}
            showsUserLocation
            showsMyLocationButton={false}
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
            {stops.map((s, i) => {
              const done = visited.has(s.id);
              const isCur = i === currentIdx;
              const size = isCur ? 36 : 26;
              return (
                <Marker
                  key={s.id}
                  coordinate={{
                    latitude: s.latitude,
                    longitude: s.longitude,
                  }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View
                    style={{
                      width: size,
                      height: size,
                      borderRadius: 99,
                      borderWidth: 3,
                      borderColor: '#fff',
                      backgroundColor: done ? INK_MUTED : BRAND,
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: isCur ? BRAND : '#000',
                      shadowOpacity: isCur ? 0.4 : 0.15,
                      shadowRadius: isCur ? 16 : 6,
                      shadowOffset: { width: 0, height: 6 },
                      elevation: isCur ? 8 : 4,
                    }}
                  >
                    <Text
                      style={{
                        color: '#fff',
                        fontSize: isCur ? 15 : 11,
                        fontWeight: '700',
                      }}
                    >
                      {done ? '✓' : i + 1}
                    </Text>
                  </View>
                </Marker>
              );
            })}
          </MapView>
        ) : null}

        {/* Top bar */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 14,
            right: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <HeaderButton
            onPress={() => navigation.goBack()}
            icon="close"
            variant="glass"
            accessibilityLabel="Close"
          />
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: 13,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>
              Saturday route
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: INK_SOFT }}>
              {visited.size}/{stops.length} done
            </Text>
          </View>
        </View>

        {/* Progress dots */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 58,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          {stops.map((s, i) => (
            <View
              key={s.id}
              style={{
                width: i === currentIdx ? 20 : 7,
                height: 7,
                borderRadius: 99,
                backgroundColor: visited.has(s.id)
                  ? BRAND
                  : i === currentIdx
                  ? BRAND
                  : 'rgba(20,18,15,0.18)',
              }}
            />
          ))}
        </View>
      </View>

      {/* Bottom action card */}
      <View
        style={{
          backgroundColor: '#fff',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingTop: 16,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 16,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: -8 },
          elevation: 12,
        }}
      >
        {allDone ? (
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ fontSize: 32 }}>🎉</Text>
            <Text
              style={{
                fontSize: 19,
                fontWeight: '800',
                color: INK,
                letterSpacing: -0.3,
                marginTop: 6,
              }}
            >
              Route complete
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: INK_SOFT,
                marginTop: 4,
                textAlign: 'center',
              }}
            >
              You hit all {stops.length} stops. Find anything good?
            </Text>
            <Pressable
              onPress={() => navigation.popToTop()}
              style={{
                marginTop: 16,
                alignSelf: 'stretch',
                paddingVertical: 13,
                backgroundColor: BRAND,
                borderRadius: 14,
                alignItems: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel="Back to map"
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                Back to map
              </Text>
            </Pressable>
          </View>
        ) : current ? (
          <>
            <Text
              style={{
                fontSize: 11,
                color: currentFlagged ? ROSE : BRAND,
                fontWeight: '700',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              Stop {currentIdx + 1} of {stops.length}
              {currentEnded
                ? ' · Ended'
                : currentMissed
                ? ' · May be closed'
                : ` · Arrive ~${fmtTime(itin[currentIdx]?.arrival ?? 0)}`}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginTop: 10,
              }}
            >
              <Thumb sale={current} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: '700',
                    color: INK,
                    letterSpacing: -0.3,
                  }}
                  numberOfLines={1}
                >
                  {current.title}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: currentFlagged ? ROSE : INK_MUTED,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {currentEnded
                    ? `${current.address} · This sale has ended`
                    : currentMissed
                    ? `${current.address} · closes ${fmtTime(itin[currentIdx]?.closeMin ?? 0)} ✕`
                    : `${current.address} · open till ${fmtTime(itin[currentIdx]?.closeMin ?? 0)}`}
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                marginTop: 14,
              }}
            >
              <Pressable
                onPress={() =>
                  navigation.navigate('SaleDetail', { saleId: current.id })
                }
                style={{
                  width: 52,
                  paddingVertical: 13,
                  borderWidth: 1,
                  borderColor: HAIRLINE,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#fff',
                }}
                accessibilityRole="button"
                accessibilityLabel="See sale detail"
              >
                <Ionicons name="list-outline" size={18} color={INK} />
              </Pressable>
              <Pressable
                onPress={navigateLeg}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  backgroundColor: BRAND,
                  borderRadius: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                }}
                accessibilityRole="button"
                accessibilityLabel="Navigate"
              >
                <Ionicons name="arrow-forward" size={15} color="#fff" />
                <Text
                  style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}
                >
                  Navigate
                </Text>
              </Pressable>
              <Pressable
                onPress={markVisited}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  backgroundColor: currentFlagged ? ROSE_SOFT : BRAND_SOFT,
                  borderRadius: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
                accessibilityRole="button"
                accessibilityLabel={currentFlagged ? 'Skip' : 'Mark visited'}
              >
                <Ionicons
                  name={currentFlagged ? 'play-forward' : 'checkmark'}
                  size={15}
                  color={currentFlagged ? ROSE : BRAND}
                />
                <Text
                  style={{
                    color: currentFlagged ? ROSE : BRAND,
                    fontSize: 14,
                    fontWeight: '700',
                  }}
                >
                  {currentFlagged ? 'Skip' : 'Visited'}
                </Text>
              </Pressable>
            </View>

            {nextStop && (
              <View
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: HAIRLINE,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: INK_MUTED,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  Next
                </Text>
                <Thumb sale={nextStop} size={32} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: '600',
                      color: INK,
                    }}
                    numberOfLines={1}
                  >
                    {nextStop.title}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: INK_MUTED }}>
                    {itin[currentIdx + 1]?.driveFromPrev ?? 0} min · arrive ~
                    {fmtTime(itin[currentIdx + 1]?.arrival ?? 0)}
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : null}
      </View>
    </View>
  );
}

function Thumb({ sale, size = 56 }: { sale: Sale; size?: number }) {
  const firstImage = sale.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: size * 2,
    height: size * 2,
    resize: 'cover',
    quality: 75,
  });
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size === 32 ? 8 : 12,
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
          <Ionicons name="image-outline" size={20} color={BRAND} />
        </View>
      )}
    </View>
  );
}
