import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSales } from '../../hooks/useSales';
import { Sale, MapStackParamList } from '../../types';
import FilterBar from '../../components/FilterBar';
import SalePinCallout from '../../components/SalePinCallout';
import { MapPin } from '../../components/MapPin';
import { IconButton } from '../../components/ui';

type Nav = NativeStackNavigationProp<MapStackParamList, 'MapHome'>;

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

export default function MapHomeScreen() {
  const navigation = useNavigation<Nav>();
  const mapRef = useRef<MapView>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
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

  const { sales, loading } = useSales(mapBounds);

  const filteredSales = categoryFilter
    ? sales.filter((s) => s.categories.includes(categoryFilter as any))
    : sales;

  const liveCount = filteredSales.filter((s) => s.status === 'active').length;

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
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={DEFAULT_REGION}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => setSelectedSale(null)}
      >
        {filteredSales.map((sale) => (
          <Marker
            key={sale.id}
            coordinate={{ latitude: sale.latitude, longitude: sale.longitude }}
            onPress={() => setSelectedSale(sale)}
            tracksViewChanges={false}
          >
            <MapPin status={sale.status} />
          </Marker>
        ))}
      </MapView>

      {/* Floating top bar */}
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
                : liveCount > 0
                ? `${liveCount} live now in this area`
                : 'Pan the map to find sales'}
            </Text>
          </View>
          {loading && <ActivityIndicator color="#F97316" />}
        </View>
        <View className="mt-2">
          <FilterBar selected={categoryFilter} onSelect={setCategoryFilter} />
        </View>
      </SafeAreaView>

      {/* Floating action stack — bottom right */}
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

      {/* Callout */}
      {selectedSale && (
        <SalePinCallout
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onViewDetails={() => {
            const id = selectedSale.id;
            setSelectedSale(null);
            navigation.navigate('SaleDetail', { saleId: id });
          }}
        />
      )}
    </View>
  );
}
