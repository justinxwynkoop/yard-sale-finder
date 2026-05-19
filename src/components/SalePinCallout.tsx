import React from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sale } from '../types';
import { formatSaleDate, formatSaleTime } from '../utils/format';
import { Badge, Button, IconButton, StatusBadge } from './ui';

interface Props {
  sale: Sale;
  onClose: () => void;
  onViewDetails: () => void;
}

export default function SalePinCallout({ sale, onClose, onViewDetails }: Props) {
  const images = sale.media?.filter((m) => m.type === 'image') ?? [];
  const screenWidth = 360;

  return (
    <View className="absolute bottom-6 left-4 right-4 overflow-hidden rounded-3xl bg-white shadow-lg">
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
                style={{ width: screenWidth - 32, height: 180 }}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View className="h-32 items-center justify-center bg-brand-50">
            <Ionicons name="image-outline" size={40} color="#F97316" />
          </View>
        )}
        <View className="absolute right-3 top-3">
          <IconButton
            variant="glass"
            size="sm"
            icon={<Ionicons name="close" size={18} color="#18181B" />}
            onPress={onClose}
          />
        </View>
        <View className="absolute left-3 top-3">
          <StatusBadge status={sale.status} />
        </View>
      </View>

      {/* Body */}
      <View className="p-4">
        <Text className="mb-1 text-lg font-bold text-zinc-900" numberOfLines={1}>
          {sale.title}
        </Text>
        <View className="mb-1 flex-row items-center">
          <Ionicons name="location-outline" size={14} color="#71717A" />
          <Text className="ml-1 flex-1 text-sm text-zinc-500" numberOfLines={1}>
            {sale.address}
          </Text>
        </View>
        <View className="mb-3 flex-row items-center">
          <Ionicons name="time-outline" size={14} color="#F97316" />
          <Text className="ml-1 text-sm font-medium text-brand-600">
            {formatSaleDate(sale.start_date, sale.end_date)} ·{' '}
            {formatSaleTime(sale.start_time, sale.end_time)}
          </Text>
        </View>

        {sale.categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-3"
            contentContainerStyle={{ gap: 6 }}
          >
            {sale.categories.slice(0, 6).map((cat) => (
              <Badge key={cat} tone="neutral">
                {cat}
              </Badge>
            ))}
          </ScrollView>
        )}

        <Button
          onPress={onViewDetails}
          rightIcon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
        >
          View details
        </Button>
      </View>
    </View>
  );
}
