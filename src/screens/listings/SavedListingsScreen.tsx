import React, { useCallback } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFavoriteListings } from '../../hooks/useFavoriteListings';
import { ListingsStackParamList, Listing } from '../../types';
import { EmptyState } from '../../components/ui';
import { SubHeader } from '../../components/SubHeader';

function isNew(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 3 * 24 * 60 * 60 * 1000;
}

type Nav = NativeStackNavigationProp<ListingsStackParamList, 'SavedListings'>;

export default function SavedListingsScreen() {
  const navigation = useNavigation<Nav>();
  const { favorites, loading, refetch } = useFavoriteListings();

  // Re-fetch when the screen regains focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F2E8' }} edges={['bottom']}>
      <SubHeader title="Saved listings" />
      <FlatList
        data={favorites}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
          gap: 12,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            tintColor="#1F4D3A"
            colors={['#1F4D3A']}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                icon={<Ionicons name="heart-outline" size={32} color="#1F4D3A" />}
                title="No saved listings yet"
                description="Tap the heart on any listing to save it here for later."
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <SavedListingCard
            listing={item}
            onPress={() =>
              navigation.navigate('ListingDetail', { listingId: item.id })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function SavedListingCard({
  listing,
  onPress,
}: {
  listing: Listing;
  onPress: () => void;
}) {
  const thumb = listing.media?.find((m) => m.type === 'image')?.url;
  const showNew = isNew(listing.created_at);
  const price =
    listing.price === 0 ? 'Free' : `$${listing.price.toLocaleString()}`;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 14,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      }}
    >
      {/* Thumbnail */}
      <View
        style={{
          width: 96,
          height: 96,
          backgroundColor: '#F4F4F5',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={{ width: 96, height: 96 }}
            resizeMode="cover"
          />
        ) : (
          <Ionicons name="image-outline" size={28} color="#D4D4D8" />
        )}
        {showNew && (
          <View
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              backgroundColor: '#1F4D3A',
              borderRadius: 999,
              paddingHorizontal: 7,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>
              NEW
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1, padding: 12, gap: 4 }}>
        <Text
          numberOfLines={2}
          style={{ fontSize: 15, fontWeight: '600', color: '#18181B' }}
        >
          {listing.title}
        </Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F4D3A' }}>
          {price}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: '#A1A1AA' }}>
          {listing.pickup_display}
        </Text>
      </View>

      <View
        style={{
          justifyContent: 'center',
          paddingRight: 12,
        }}
      >
        <Ionicons name="chevron-forward" size={16} color="#D4D4D8" />
      </View>
    </Pressable>
  );
}
