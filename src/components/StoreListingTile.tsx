import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Listing } from '../types';
import { transformedImageUrl, PLACEHOLDER_BLURHASH } from '../lib/imageUrl';

const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const HAIRLINE = '#E5DECC';

interface Props {
  listing: Listing;
  onPress: () => void;
}

export function StoreListingTile({ listing, onPress }: Props) {
  const firstImage = listing.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 280,
    height: 280,
    resize: 'cover',
    quality: 75,
  });

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: '47%',
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        overflow: 'hidden',
      }}
      accessibilityRole="button"
      accessibilityLabel={listing.title}
    >
      <View style={{ height: 110, backgroundColor: BRAND_SOFT }}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
          />
        ) : null}
      </View>
      <View style={{ padding: 9 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: INK }}>
          ${listing.price.toFixed(0)}
        </Text>
        <Text
          style={{ fontSize: 11, fontWeight: '600', color: INK, marginTop: 1 }}
          numberOfLines={1}
        >
          {listing.title}
        </Text>
      </View>
    </Pressable>
  );
}
