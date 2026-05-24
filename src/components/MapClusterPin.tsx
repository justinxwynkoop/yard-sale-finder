import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * The orange bubble we show in place of a tight group of sales /
 * listings when the user is zoomed out. Sized in three buckets so a
 * cluster of 87 looks visually different from one of 3.
 *
 * The white border + drop shadow keep the bubble legible against any
 * map background (light streets, dark satellite, water, etc).
 */
export function MapClusterPin({ count }: { count: number }) {
  const size = count < 10 ? 38 : count < 100 ? 46 : 56;
  const fontSize = count < 10 ? 14 : count < 100 ? 16 : 17;
  return (
    <View
      style={[
        styles.bubble,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.label, { fontSize }]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  label: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
