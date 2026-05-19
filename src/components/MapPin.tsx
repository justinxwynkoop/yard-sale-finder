import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SaleStatus } from '../types';

const STATUS_COLOR: Record<SaleStatus, string> = {
  active: '#10B981', // emerald-500 — bright green for go!
  winding_down: '#EAB308', // yellow-500 — clearly yellow
  ended: '#9CA3AF', // zinc — muted
};

export function MapPin({ status }: { status: SaleStatus }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status !== 'active') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  const color = STATUS_COLOR[status];

  return (
    <View className="items-center justify-center" style={{ width: 48, height: 48 }}>
      {status === 'active' && (
        <Animated.View
          style={{
            position: 'absolute',
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: color,
            transform: [{ scale }],
            opacity,
          }}
        />
      )}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: color,
          borderWidth: 3,
          borderColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        <Ionicons name="pricetag" size={16} color="#fff" />
      </View>
    </View>
  );
}
