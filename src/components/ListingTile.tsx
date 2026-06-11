import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Listing } from '../types';
import { PLACEHOLDER_BLURHASH, transformedImageUrl } from '../lib/imageUrl';
import { useFavoriteListings } from '../hooks/useFavoriteListings';
import { formatDistanceMiles, haversineMeters } from '../utils/distance';

const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const ROSE = '#A23E2D';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

type Props = {
  listing: Listing;
  userLat?: number;
  userLng?: number;
  onPress: () => void;
};

function ListingTileInner({ listing, userLat, userLng, onPress }: Props) {
  const { isFavorited, toggle } = useFavoriteListings();
  const saved = isFavorited(listing.id);
  const firstImage = listing.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 320,
    height: 320,
    resize: 'cover',
    quality: 75,
  });

  const distance =
    userLat != null && userLng != null
      ? haversineMeters(
          userLat,
          userLng,
          listing.pickup_lat,
          listing.pickup_lng,
        )
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: HAIRLINE,
        overflow: 'hidden',
      }}
    >
      <View style={{ height: 140, backgroundColor: BRAND_SOFT }}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="image-outline" size={28} color={BRAND} />
          </View>
        )}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            toggle(listing.id);
          }}
          hitSlop={8}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 99,
            backgroundColor: 'rgba(255,255,255,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={14}
            color={saved ? ROSE : INK}
          />
        </Pressable>
      </View>
      <View style={{ padding: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: INK }}>
          {listing.price === 0
            ? 'Free'
            : `$${listing.price % 1 === 0 ? listing.price : listing.price.toFixed(2)}`}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            marginTop: 4,
            fontSize: 12,
            fontWeight: '600',
            color: INK,
            lineHeight: 16,
          }}
        >
          {listing.title}
        </Text>
        <View
          style={{
            marginTop: 6,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="location-outline" size={11} color={INK_MUTED} />
          <Text
            numberOfLines={1}
            style={{
              fontSize: 10,
              color: INK_MUTED,
              marginLeft: 3,
              flex: 1,
            }}
          >
            {distance != null
              ? formatDistanceMiles(distance)
              : listing.pickup_display}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default React.memo(ListingTileInner);
