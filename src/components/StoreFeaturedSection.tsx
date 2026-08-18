import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Listing } from '../types';
import { transformedImageUrl, PLACEHOLDER_BLURHASH } from '../lib/imageUrl';

const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const HAIRLINE = '#E5DECC';
const AMBER = '#FBCB6B';

interface Props {
  listings: Listing[];
  onPress: (listing: Listing) => void;
}

export function StoreFeaturedSection({ listings, onPress }: Props) {
  if (listings.length === 0) return null;

  return (
    <View style={{ paddingTop: 18 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 16,
          marginBottom: 10,
        }}
      >
        <Ionicons name="star" size={12} color={AMBER} />
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: INK,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Featured
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {listings.map((listing) => {
          const firstImage = listing.media?.find((m) => m.type === 'image');
          const thumb = transformedImageUrl(firstImage?.url, {
            width: 320,
            height: 200,
            resize: 'cover',
            quality: 75,
          });
          return (
            <Pressable
              key={listing.id}
              onPress={() => onPress(listing)}
              style={{
                width: 160,
                backgroundColor: '#fff',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: HAIRLINE,
                overflow: 'hidden',
              }}
              accessibilityRole="button"
              accessibilityLabel={listing.title}
            >
              <View style={{ height: 100, backgroundColor: BRAND_SOFT }}>
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
        })}
      </ScrollView>
    </View>
  );
}
