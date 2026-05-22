import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function ListingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="bg-white px-5 pt-4 pb-3">
        <Text className="text-2xl font-extrabold text-zinc-900">Listings</Text>
        <Text className="text-xs text-zinc-500">Items for sale near you</Text>
      </View>
      <View className="flex-1 items-center justify-center" style={{ gap: 12 }}>
        <Ionicons name="storefront-outline" size={48} color="#D4D4D8" />
        <Text className="text-base font-semibold text-zinc-400">
          Browse listings — coming soon
        </Text>
      </View>
    </SafeAreaView>
  );
}
