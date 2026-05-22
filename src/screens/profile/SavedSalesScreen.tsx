import React from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFavorites } from '../../hooks/useFavorites';
import { useUserLocation } from '../../hooks/useUserLocation';
import SaleListCard from '../../components/SaleListCard';
import { EmptyState } from '../../components/ui';

/**
 * Full list of the user's saved sales. Replaces the horizontal
 * carousel that used to live inline on ProfileScreen -- breaking it
 * out follows the iOS pattern of one job per screen and lets us
 * present richer cards (images, distance, open-now status) without
 * sacrificing space on the main settings list.
 */
export default function SavedSalesScreen() {
  const navigation = useNavigation();
  const { favorites, loading } = useFavorites();
  const coords = useUserLocation();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
        }}
      >
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (favorites.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['bottom']}>
        <EmptyState
          icon={<Ionicons name="heart-outline" size={32} color="#F97316" />}
          title="No saved sales yet"
          description={
            'Tap the heart on any sale to save it for later. ' +
            "You'll find them all here."
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['bottom']}>
      <FlatList
        data={favorites}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => (
          <SaleListCard
            sale={item}
            userLat={coords?.latitude}
            userLng={coords?.longitude}
            onPress={() =>
              (navigation as any).navigate('Map', {
                screen: 'SaleDetail',
                params: { saleId: item.id },
              })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}
