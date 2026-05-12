import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSales } from '../../hooks/useSales';
import { Sale, MapStackParamList } from '../../types';
import FilterBar from '../../components/FilterBar';
import SalePinCallout from '../../components/SalePinCallout';

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
  const [mapBounds, setMapBounds] = useState<{
    minLat: number; maxLat: number; minLng: number; maxLng: number;
  } | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const { sales, loading } = useSales(mapBounds);

  const filteredSales = categoryFilter
    ? sales.filter(s => s.categories.includes(categoryFilter as any))
    : sales;

  const goToUserLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    mapRef.current?.animateToRegion({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }, 800);
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
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => setSelectedSale(null)}
      >
        {filteredSales.map(sale => (
          <Marker
            key={sale.id}
            coordinate={{ latitude: sale.latitude, longitude: sale.longitude }}
            onPress={() => setSelectedSale(sale)}
          >
            <View style={[
              styles.pin,
              sale.status === 'winding_down' && styles.pinWindingDown,
            ]}>
              <Text style={styles.pinText}>🏷️</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.topBarInner} pointerEvents="box-none">
          <Text style={styles.topTitle}>Yard Sales</Text>
          {loading && <ActivityIndicator color="#2563EB" style={{ marginLeft: 8 }} />}
        </View>
        <FilterBar selected={categoryFilter} onSelect={setCategoryFilter} />
      </SafeAreaView>

      {/* My location button */}
      <TouchableOpacity style={styles.locationBtn} onPress={goToUserLocation}>
        <Text style={styles.locationBtnText}>📍</Text>
      </TouchableOpacity>

      {/* Sale callout */}
      {selectedSale && (
        <SalePinCallout
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onViewDetails={() => {
            setSelectedSale(null);
            navigation.navigate('SaleDetail', { saleId: selectedSale.id });
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  pin: {
    backgroundColor: '#2563EB',
    borderRadius: 20,
    padding: 6,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pinWindingDown: {
    backgroundColor: '#F59E0B',
  },
  pinText: { fontSize: 16 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  topTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  locationBtn: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 28,
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  locationBtnText: { fontSize: 24 },
});
