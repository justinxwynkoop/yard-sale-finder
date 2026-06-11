import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Sale } from '../types';
import { isOpenNow } from '../utils/saleStatus';
import { formatDistanceMiles, haversineMeters } from '../utils/distance';
import { PLACEHOLDER_BLURHASH, transformedImageUrl } from '../lib/imageUrl';
import { saleDisplayLocation } from '../lib/locationPrivacy';
import { useAuth } from '../hooks/useAuth';

const BRAND = '#1F4D3A';

type Props = {
  sale: Sale;
  userLat?: number;
  userLng?: number;
  onPress: () => void;
};

/**
 * Brand-bg callout that replaces the pin dot when a sale is selected.
 * Static (no entry animation) — pulses inside markers race the iOS
 * Fabric layer and crash. See MapPin.tsx for the history note.
 */
export function SelectedPinCallout({ sale, userLat, userLng, onPress }: Props) {
  const { user } = useAuth();
  const open = isOpenNow(sale);
  const firstImage = sale.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 72,
    height: 72,
    resize: 'cover',
    quality: 75,
  });
  const loc = saleDisplayLocation(sale, { isOwner: !!user && sale.user_id === user.id });
  const dist =
    userLat != null && userLng != null
      ? haversineMeters(userLat, userLng, loc.latitude, loc.longitude)
      : null;
  const distLabel = dist != null ? formatDistanceMiles(dist) : '';

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: BRAND,
          borderRadius: 14,
          padding: 6,
          paddingRight: 12,
          flexDirection: 'row',
          alignItems: 'center',
          shadowColor: BRAND,
          shadowOpacity: 0.35,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
          maxWidth: 240,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.18)',
            marginRight: 9,
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
          ) : null}
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              color: '#fff',
              fontSize: 12.5,
              fontWeight: '700',
              letterSpacing: -0.2,
            }}
          >
            {sale.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 99,
                backgroundColor: open ? '#fff' : 'rgba(255,255,255,0.5)',
                marginRight: 5,
              }}
            />
            <Text
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 0.2,
              }}
            >
              {open ? 'OPEN' : 'CLOSED'}
              {distLabel ? ` · ${distLabel}` : ''}
            </Text>
          </View>
        </View>
      </Pressable>
      <View
        style={{
          width: 0,
          height: 0,
          marginTop: -1,
          borderLeftWidth: 7,
          borderRightWidth: 7,
          borderTopWidth: 8,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: BRAND,
        }}
      />
    </View>
  );
}
