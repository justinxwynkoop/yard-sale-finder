import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';

const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';

/**
 * Shows the host's accepted payment methods (set once on their profile) on a
 * sale / item detail, so buyers see what's accepted in context. Renders
 * nothing when the host hasn't set any.
 */
export function PaymentAccepted({
  methods,
  style,
}: {
  methods?: string[] | null;
  style?: StyleProp<ViewStyle>;
}) {
  if (!methods || methods.length === 0) return null;
  return (
    <View style={style}>
      <Text
        style={{ fontSize: 13, fontWeight: '700', color: INK, marginBottom: 8 }}
      >
        Payment accepted
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {methods.map((m) => (
          <View
            key={m}
            style={{
              backgroundColor: BRAND_SOFT,
              borderRadius: 99,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: BRAND }}>
              {m}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
