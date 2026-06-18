import React from 'react';
import { View } from 'react-native';
import { SaleStatus } from '../types';

const BRAND = '#1F4D3A';
const GRAY = '#8A857C';
const ROUTE_COLOR = '#4F46E5';
const ROSE = '#A23E2D';

/**
 * A plain colored dot. State is conveyed entirely by the dot's color
 * (green = live, gray = otherwise, indigo = in the route plan) plus a small
 * rose "saved" badge on the corner — nothing is drawn inside the dot.
 *
 * History note: a previous version layered an Animated.View pulse behind the
 * pin for active markers. Under the iOS new architecture (Fabric), multiple
 * native-driven Animated children inside AIRMap markers raced the mount path
 * and produced
 *
 *   NSInvalidArgumentException: -[__NSArrayM insertObject:atIndex:]:
 *   object cannot be nil
 *   ... -[AIRMap insertReactSubview:atIndex:] + 888
 *
 * on zoom / refetch. Keep this static — no Animated children.
 */
function MapPinInner({
  status,
  favorited,
  inRoute,
  openNow,
}: {
  status: SaleStatus;
  favorited?: boolean;
  /** True when this sale has been added to the route planner. */
  inRoute?: boolean;
  /** True when the sale's hours include the current time. */
  openNow?: boolean;
}) {
  const isLive = status === 'active' && openNow;
  const color = inRoute ? ROUTE_COLOR : isLive ? BRAND : GRAY;
  return (
    <View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: color,
          borderWidth: 2.5,
          borderColor: '#fff',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      />
      {favorited && !inRoute && (
        <View
          style={{
            position: 'absolute',
            top: -1,
            right: -1,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: ROSE,
            borderWidth: 1.5,
            borderColor: '#fff',
          }}
        />
      )}
    </View>
  );
}

export const MapPin = React.memo(MapPinInner);
