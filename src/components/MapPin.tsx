import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SaleStatus } from '../types';

const STATUS_COLOR: Record<SaleStatus, string> = {
  active: '#10B981', // emerald-500 — bright green for go!
  winding_down: '#EAB308', // yellow-500 — clearly yellow
  ended: '#9CA3AF', // zinc — muted
};

/**
 * Map marker view: a colored circle with a price-tag (or heart) icon.
 *
 * History note: a previous version layered an Animated.View pulse
 * behind the pin for `status === 'active'` markers. Under the
 * iOS new architecture (Fabric), multiple native-driven Animated
 * children inside AIRMap markers raced the mount path and produced
 *
 *   NSInvalidArgumentException: -[__NSArrayM insertObject:atIndex:]:
 *   object cannot be nil
 *   ... -[AIRMap insertReactSubview:atIndex:] + 888
 *
 * on zoom / refetch. The pulse was a cosmetic nicety; stability
 * matters more, so we ship a static colored circle.
 */
function MapPinInner({ status, favorited }: { status: SaleStatus; favorited?: boolean }) {
  const color = STATUS_COLOR[status];
  return (
    <View>
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
        <Ionicons name={favorited ? 'heart' : 'pricetag'} size={16} color="#fff" />
      </View>
      {/* Small heart badge in corner when favorited */}
      {favorited && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: '#F43F5E',
            borderWidth: 1.5,
            borderColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
      )}
    </View>
  );
}

// Pins re-render constantly when the map pans; memo by status so
// React skips reconciliation when the data hasn't actually changed.
export const MapPin = React.memo(MapPinInner);
