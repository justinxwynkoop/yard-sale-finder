import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Sale } from '../types';
import { formatSaleDate, formatSaleTime } from '../utils/format';
import { formatDistanceMiles, haversineMeters } from '../utils/distance';
import { isOpenNow } from '../utils/saleStatus';
import { PLACEHOLDER_BLURHASH, transformedImageUrl } from '../lib/imageUrl';
import { Badge, Card, StatusBadge } from './ui';

interface Props {
  sale: Sale;
  userLat?: number;
  userLng?: number;
  onPress: () => void;
}

function SaleListCardInner({
  sale,
  userLat,
  userLng,
  onPress,
}: Props) {
  const firstImage = sale.media?.find((m) => m.type === 'image');
  const open = isOpenNow(sale);
  // 200×200 server-side thumbnail — ~25KB instead of ~250KB for the
  // full-size image. Retina-friendly at the 96pt slot we render in.
  const thumbUrl = transformedImageUrl(firstImage?.url, {
    width: 200,
    height: 200,
    resize: 'cover',
    quality: 75,
  });

  const distance =
    userLat != null && userLng != null
      ? haversineMeters(userLat, userLng, sale.latitude, sale.longitude)
      : null;

  return (
    <Card className="overflow-hidden">
      <Pressable onPress={onPress} className="active:bg-zinc-50">
        <View className="flex-row p-3">
          {/* Cover */}
          <View
            className="overflow-hidden rounded-xl"
            style={{ width: 96, height: 96 }}
          >
            {thumbUrl ? (
              <Image
                source={{ uri: thumbUrl }}
                placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
              />
            ) : (
              <View className="h-full w-full items-center justify-center bg-brand-50">
                <Ionicons name="image-outline" size={28} color="#F97316" />
              </View>
            )}
          </View>

          {/* Info */}
          <View className="ml-3 flex-1">
            <View className="flex-row items-start">
              <Text
                className="flex-1 pr-2 text-base font-bold text-zinc-900"
                numberOfLines={1}
              >
                {sale.title}
              </Text>
              {open ? (
                <Badge tone="live" dot>
                  Open now
                </Badge>
              ) : (
                <StatusBadge status={sale.status} />
              )}
            </View>
            <View className="mt-1 flex-row items-center">
              <Ionicons name="location-outline" size={13} color="#71717A" />
              <Text
                className="ml-1 flex-1 text-xs text-zinc-500"
                numberOfLines={1}
              >
                {sale.address}
              </Text>
              {distance != null && (
                <Text className="ml-2 text-xs font-medium text-zinc-700">
                  {formatDistanceMiles(distance)}
                </Text>
              )}
            </View>
            <View className="mt-1 flex-row items-center">
              <Ionicons name="time-outline" size={13} color="#F97316" />
              <Text
                className="ml-1 flex-1 text-xs font-medium text-brand-600"
                numberOfLines={1}
              >
                {formatSaleDate(sale.start_date, sale.end_date)} ·{' '}
                {formatSaleTime(sale.start_time, sale.end_time)}
              </Text>
            </View>
            {sale.categories.length > 0 && (
              <View className="mt-2 flex-row" style={{ gap: 4 }}>
                {sale.categories.slice(0, 3).map((cat) => (
                  <View
                    key={cat}
                    className="rounded-full bg-zinc-100 px-2 py-0.5"
                  >
                    <Text className="text-2xs font-medium capitalize text-zinc-600">
                      {cat}
                    </Text>
                  </View>
                ))}
                {sale.categories.length > 3 && (
                  <Text className="text-2xs text-zinc-400">
                    +{sale.categories.length - 3}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </Card>
  );
}

/**
 * Memoize so FlatList rows don't re-render when their sibling rows
 * change. Sales come back as new objects from each fetch, so use a
 * shallow comparison on the fields the card actually reads.
 */
export default React.memo(SaleListCardInner, (prev, next) => {
  return (
    prev.sale.id === next.sale.id &&
    prev.sale.updated_at === next.sale.updated_at &&
    prev.sale.status === next.sale.status &&
    prev.userLat === next.userLat &&
    prev.userLng === next.userLng &&
    prev.onPress === next.onPress
  );
});
