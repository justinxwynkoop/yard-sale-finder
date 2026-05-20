import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewStyle, StyleProp } from 'react-native';

export type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Shimmering placeholder block. Use it instead of an ActivityIndicator
 * for content that has a known size — feels faster because the layout
 * doesn't pop in.
 */
export function Skeleton({ width, height, radius = 12, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: '#E4E4E7', // zinc-200
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Pre-built skeleton for a SaleListCard / SaleCard row. */
export function SaleCardSkeleton() {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#F4F4F5',
      }}
    >
      <Skeleton width={88} height={88} radius={12} />
      <View style={{ flex: 1, marginLeft: 12, justifyContent: 'space-between' }}>
        <Skeleton width="80%" height={16} radius={6} />
        <Skeleton width="60%" height={12} radius={6} />
        <Skeleton width="70%" height={12} radius={6} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Skeleton width={48} height={18} radius={9} />
          <Skeleton width={56} height={18} radius={9} />
        </View>
      </View>
    </View>
  );
}
