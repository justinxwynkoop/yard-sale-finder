import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SaleStatus } from '../types';

const BRAND = '#1F4D3A';
const GRAY = '#8A857C';
const ROUTE_COLOR = '#4F46E5';
const ROSE = '#A23E2D';

/**
 * History note: a previous version layered an Animated.View pulse
 * behind the pin for `status === 'active'` markers. Under the
 * iOS new architecture (Fabric), multiple native-driven Animated
 * children inside AIRMap markers raced the mount path and produced
 *
 *   NSInvalidArgumentException: -[__NSArrayM insertObject:atIndex:]:
 *   object cannot be nil
 *   ... -[AIRMap insertReactSubview:atIndex:] + 888
 *
 * on zoom / refetch. Keep this static.
 */
function MapPinInner({
  status,
  favorited,
  inRoute,
  num,
  openNow,
}: {
  status: SaleStatus;
  favorited?: boolean;
  /** True when this sale has been added to the route planner. */
  inRoute?: boolean;
  /** 1-indexed pin number (distance-sorted). When set, renders the number instead of an icon. */
  num?: number;
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
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        {inRoute ? (
          <Ionicons name="checkmark" size={12} color="#fff" />
        ) : typeof num === 'number' ? (
          <Text
            style={{
              color: '#fff',
              fontSize: 10,
              fontWeight: '700',
              includeFontPadding: false,
            }}
          >
            {num}
          </Text>
        ) : (
          <Ionicons
            name={favorited ? 'heart' : 'pricetag'}
            size={12}
            color="#fff"
          />
        )}
      </View>
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
