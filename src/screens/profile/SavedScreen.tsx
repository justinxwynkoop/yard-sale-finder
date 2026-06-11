import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { SubHeader } from '../../components/SubHeader';
import SaleCard from '../../components/SaleCard';
import { useFavorites } from '../../hooks/useFavorites';
import { useUserLocation } from '../../hooks/useUserLocation';
import { haversineMeters } from '../../utils/distance';
import { toast } from '../../lib/toast';
import { ROUTE_PLANNER_ENABLED } from '../../lib/featureFlags';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';
const ROSE_SOFT = '#F5DDD7';

type Segment = 'sales' | 'routes';

/**
 * v3 redesign — push from Profile → "Saved & routes" or from the
 * Map's "Saved · N" chip. Two segments:
 * - Saved sales: brand banner ("Plan a route from saved") + Comfy
 *   SaleCards driven off useFavorites. Heart toggle removes here.
 * - Routes: saved multi-stop routes. Until route persistence ships,
 *   the segment renders a single in-flight banner pointing at
 *   RoutePlanner.
 */
export default function SavedScreen() {
  const navigation = useNavigation<any>();
  const [segment, setSegment] = useState<Segment>('sales');
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const userLocation = useUserLocation();

  // Sort by distance, then push ended sales to the bottom — they're
  // still here for the user's reference but shouldn't crowd live ones.
  const sortedSaved = useMemo(() => {
    const dist = (lat: number, lng: number) =>
      userLocation
        ? haversineMeters(
            userLocation.latitude,
            userLocation.longitude,
            lat,
            lng,
          )
        : Number.POSITIVE_INFINITY;
    return [...favorites].sort((a, b) => {
      const aEnded = a.status === 'ended' ? 1 : 0;
      const bEnded = b.status === 'ended' ? 1 : 0;
      if (aEnded !== bEnded) return aEnded - bEnded;
      return (
        dist(a.latitude, a.longitude) - dist(b.latitude, b.longitude)
      );
    });
  }, [favorites, userLocation]);

  const endedSaves = useMemo(
    () => favorites.filter((s) => s.status === 'ended'),
    [favorites],
  );
  const endedCount = endedSaves.length;

  const clearEnded = useCallback(() => {
    if (endedCount === 0) return;
    endedSaves.forEach((s) => toggleFavorite(s.id));
    toast.success(
      endedCount === 1
        ? 'Cleared 1 ended sale'
        : `Cleared ${endedCount} ended sales`,
    );
  }, [endedSaves, endedCount, toggleFavorite]);

  const openRoutePlanner = () => navigation.navigate('RoutePlanner');

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader title={ROUTE_PLANNER_ENABLED ? 'Saved & routes' : 'Saved sales'} />

      {/* Segmented control — only when the route planner is enabled.
          With it parked, this screen is just the saved-sales list. */}
      {ROUTE_PLANNER_ENABLED ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: HAIRLINE,
            padding: 4,
            flexDirection: 'row',
            marginHorizontal: 16,
            marginTop: 12,
          }}
        >
          <SegmentButton
            label={`Saved sales · ${favorites.length}`}
            active={segment === 'sales'}
            onPress={() => setSegment('sales')}
          />
          <SegmentButton
            label={`Routes · 0`}
            active={segment === 'routes'}
            onPress={() => setSegment('routes')}
          />
        </View>
      ) : null}

      {segment === 'sales' ? (
        <FlatList
          data={sortedSaved}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 14,
            paddingBottom: 24,
          }}
          ListHeaderComponent={
            favorites.length > 0 ? (
              <View>
                {endedCount > 0 ? (
                  <View
                    style={{
                      backgroundColor: ROSE_SOFT,
                      borderRadius: 12,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      marginHorizontal: 4,
                      marginBottom: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Ionicons name="alert-circle" size={14} color={ROSE} />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: ROSE,
                        fontWeight: '600',
                      }}
                    >
                      {endedCount === 1
                        ? '1 saved sale has ended'
                        : `${endedCount} saved sales have ended`}
                    </Text>
                    <Pressable
                      onPress={clearEnded}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Clear ${endedCount} ended sale${endedCount > 1 ? 's' : ''}`}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: ROSE,
                        }}
                      >
                        Clear ({endedCount})
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {ROUTE_PLANNER_ENABLED ? (
                <Pressable
                  onPress={openRoutePlanner}
                  accessibilityRole="button"
                  accessibilityLabel="Plan a route from your saved sales"
                  style={{
                    backgroundColor: BRAND,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 14,
                    marginHorizontal: 4,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name="git-network-outline"
                    size={20}
                    color="#fff"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}
                  >
                    Plan a route from saved
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.85)',
                      marginTop: 1,
                    }}
                  >
                    {favorites.length}{' '}
                    {favorites.length === 1 ? 'sale' : 'sales'} · we&rsquo;ll
                    order them for you
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#fff" />
              </Pressable>
                ) : null}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <SaleCard
              sale={item}
              index={index}
              density="comfy"
              userLat={userLocation?.latitude}
              userLng={userLocation?.longitude}
              onPress={() =>
                navigation.navigate('SaleDetail', { saleId: item.id })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="Nothing saved yet"
              description="Heart sales you want to revisit. They'll all live here."
            />
          }
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          <EmptyState
            title="No saved routes"
            description="Tap “Plan route” on the map to build a multi-stop run, then save it from there."
          />
        </ScrollView>
      )}
    </View>
  );
}

function SegmentButton({
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
        flex: 1,
        paddingVertical: 8,
        borderRadius: 9,
        backgroundColor: active ? BRAND : 'transparent',
        alignItems: 'center',
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: '700',
          color: active ? '#fff' : INK,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 24,
      }}
    >
      <Ionicons name="heart-outline" size={36} color={INK_MUTED} />
      <Text
        style={{
          marginTop: 12,
          fontSize: 16,
          fontWeight: '700',
          color: INK,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 13,
          color: INK_MUTED,
          textAlign: 'center',
        }}
      >
        {description}
      </Text>
    </View>
  );
}
