import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
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

export default function MapHomeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const mapRef = useRef<MapView>(null);
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
    if (viewMode === 'list' && userLocation) {
      // Sort by distance (closest first) in list view when we have a location
      return [...filtered].sort((a, b) => {
        const da = haversineMeters(
          userLocation.latitude,
          userLocation.longitude,
          a.latitude,
          a.longitude,
        );
        const db = haversineMeters(
          userLocation.latitude,
          userLocation.longitude,
          b.latitude,
          b.longitude,
        );
        return da - db;
      });
    }
    return filtered;
  }, [sales, categoryFilter, viewMode, userLocation]);

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

  return (
    <View className="flex-1 bg-surface">
      {/* MAP MODE */}
      {viewMode === 'map' && (
        <>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={DEFAULT_REGION}
            onRegionChangeComplete={onRegionChangeComplete}
            showsUserLocation
            showsMyLocationButton={false}
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

          {/* Floating my-location button */}
          <View
            className="absolute bottom-6 right-4"
            pointerEvents="box-none"
            style={{ gap: 12 }}
          >
            <IconButton
              variant="solid"
              size="md"
              onPress={goToUserLocation}
              icon={<Ionicons name="locate" size={20} color="#18181B" />}
            />
          </View>
        </>
      )}

      {/* LIST MODE */}
      {viewMode === 'list' && (
        <View className="flex-1" style={{ paddingTop: 168 }}>
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
      )}

      {/* Floating top bar — same on both views */}
      <SafeAreaView
        className="absolute left-0 right-0 top-0"
        pointerEvents="box-none"
      >
        <View
          className="mx-4 mt-2 flex-row items-center rounded-2xl bg-white px-4 py-3 shadow"
          pointerEvents="box-none"
        >
          <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
            <Ionicons name="map" size={20} color="#F97316" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-zinc-900">
              Discover sales
            </Text>
            <Text className="text-xs text-zinc-500">
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
          <View
            className="ml-3 flex-row rounded-full bg-zinc-100 p-0.5"
            style={{ gap: 0 }}
          >
            <Pressable
              onPress={() => setViewMode('map')}
              className={[
                'h-8 w-8 items-center justify-center rounded-full',
                viewMode === 'map' ? 'bg-white shadow' : '',
              ].join(' ')}
            >
              <Ionicons
                name="map"
                size={16}
                color={viewMode === 'map' ? '#F97316' : '#71717A'}
              />
            </Pressable>
            <Pressable
              onPress={() => setViewMode('list')}
              className={[
                'h-8 w-8 items-center justify-center rounded-full',
                viewMode === 'list' ? 'bg-white shadow' : '',
              ].join(' ')}
            >
              <Ionicons
                name="list"
                size={16}
                color={viewMode === 'list' ? '#F97316' : '#71717A'}
              />
            </Pressable>
          </View>
        </View>
        <View className="mt-2">
          <FilterBar selected={categoryFilter} onSelect={setCategoryFilter} />
        </View>
      </SafeAreaView>
    </View>
  );
}
