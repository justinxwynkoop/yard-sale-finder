import React from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sale } from '../types';
import { formatSaleDate, formatSaleTime } from '../utils/format';
import { Badge, IconButton, StatusBadge } from './ui';

interface Props {
  sale: Sale;
  onClose: () => void;
  onViewDetails: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_HORIZONTAL_MARGIN = 16;
const IMAGE_WIDTH = SCREEN_WIDTH - CARD_HORIZONTAL_MARGIN * 2;
const IMAGE_HEIGHT = 160;

export default function SalePinCallout({
  sale,
  onClose,
  onViewDetails,
}: Props) {
  const images = sale.media?.filter((m) => m.type === 'image') ?? [];

  return (
    <View
      className="absolute bottom-6 left-4 right-4 overflow-hidden rounded-3xl bg-white"
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      {/* The entire card body (everything except the close button) is tappable */}
      <Pressable onPress={onViewDetails} android_ripple={{ color: '#F4F4F5' }}>
        {/* Media */}
        <View className="relative">
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
            >
              {images.map((m) => (
                <Image
                  key={m.id}
                  source={{ uri: m.url }}
                  style={{ width: IMAGE_WIDTH, height: IMAGE_HEIGHT }}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View
              className="items-center justify-center bg-brand-50"
              style={{ height: IMAGE_HEIGHT }}
            >
              <Ionicons name="image-outline" size={40} color="#F97316" />
              <Text className="mt-2 text-xs font-medium text-brand-700">
                No photos
              </Text>
            </View>
          )}
          <View className="absolute left-3 top-3">
            <StatusBadge status={sale.status} />
          </View>
          {images.length > 1 && (
            <View className="absolute bottom-2 right-3 flex-row items-center rounded-full bg-black/55 px-2 py-0.5">
              <Ionicons name="images" size={11} color="#fff" />
              <Text className="ml-1 text-2xs font-semibold text-white">
                {images.length}
              </Text>
            </View>
          )}
        </View>

        {/* Body */}
        <View className="px-4 pb-4 pt-3">
          <View className="flex-row items-start">
            <View className="flex-1 pr-2">
              <Text
                className="text-lg font-bold text-zinc-900"
                numberOfLines={1}
              >
                {sale.title}
              </Text>
              <View className="mt-1 flex-row items-center">
                <Ionicons name="location-outline" size={14} color="#71717A" />
                <Text
                  className="ml-1 flex-1 text-sm text-zinc-500"
                  numberOfLines={1}
                >
                  {sale.address}
                </Text>
              </View>
              <View className="mt-1 flex-row items-center">
                <Ionicons name="time-outline" size={14} color="#F97316" />
                <Text
                  className="ml-1 flex-1 text-sm font-medium text-brand-600"
                  numberOfLines={1}
                >
                  {formatSaleDate(sale.start_date, sale.end_date)} ·{' '}
                  {formatSaleTime(sale.start_time, sale.end_time)}
                </Text>
              </View>
            </View>

            {/* Chevron makes the affordance obvious */}
            <View className="ml-1 mt-1 h-9 w-9 items-center justify-center rounded-full bg-zinc-100">
              <Ionicons name="chevron-forward" size={18} color="#27272A" />
            </View>
          </View>

          {sale.categories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-3"
              contentContainerStyle={{ gap: 6 }}
            >
              {sale.categories.slice(0, 6).map((cat) => (
                <Badge key={cat} tone="neutral">
                  {cat}
                </Badge>
              ))}
            </ScrollView>
          )}

          <Text className="mt-3 text-center text-xs font-medium text-zinc-400">
            Tap to view full details & directions
          </Text>
        </View>
      </Pressable>

      {/* Close button sits above the Pressable so it doesn't trigger the open action */}
      <View className="absolute right-3 top-3">
        <IconButton
          variant="glass"
          size="sm"
          icon={<Ionicons name="close" size={18} color="#18181B" />}
          onPress={onClose}
        />
      </View>
    </View>
  );
}
