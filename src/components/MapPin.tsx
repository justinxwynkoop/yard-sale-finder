import React from 'react';
import { View } from 'react-native';
import { SaleStatus } from '../types';

const BRAND = '#1F4D3A'; // live (open now)
const GRAY = '#8A857C'; // active but not open now
const ROUTE_COLOR = '#4F46E5'; // in the route plan
const ROSE = '#A23E2D'; // saved (ring)
const AMBER = '#E0922F'; // new (corner accent)

/**
 * A colored dot that reads three things at a glance via three independent
 * channels — so any combination shows at once:
 *   • FILL   — live status: green = open right now, gray = not open
 *              (indigo when the sale is in the route plan)
 *   • RING   — a rose border instead of the white one = saved by you
 *   • CORNER — a small amber dot = newly posted (≤ 3 days)
 *
 * Nothing is drawn INSIDE the dot (keeps it clean). All three are pure
 * functions of the sale's data, drawn as a static View.
 *
 * History note: a previous version layered an Animated.View pulse behind the
 * pin. Under the iOS new architecture (Fabric), native-driven Animated
 * children inside AIRMap markers raced the mount path and produced
 *   NSInvalidArgumentException: -[__NSArrayM insertObject:atIndex:]:
 *   object cannot be nil ... -[AIRMap insertReactSubview:atIndex:]
 * on zoom / refetch. Keep this static — no Animated children.
 */
function MapPinInner({
  status,
  favorited,
  inRoute,
  isNew,
  openNow,
}: {
  status: SaleStatus;
  /** Saved by the current user → draws the rose ring. */
  favorited?: boolean;
  /** True when this sale has been added to the route planner. */
  inRoute?: boolean;
  /** Posted within the last ~3 days → draws the amber corner dot. */
  isNew?: boolean;
  /** True when the sale's hours include the current time. */
  openNow?: boolean;
}) {
  const isLive = status === 'active' && openNow;
  const fill = inRoute ? ROUTE_COLOR : isLive ? BRAND : GRAY;
  return (
    <View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: fill,
          // Saved sales get a rose ring; everything else the usual white edge.
          borderWidth: favorited ? 3 : 2.5,
          borderColor: favorited ? ROSE : '#fff',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      />
      {isNew && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 11,
            height: 11,
            borderRadius: 5.5,
            backgroundColor: AMBER,
            borderWidth: 2,
            borderColor: '#fff',
          }}
        />
      )}
    </View>
  );
}

export const MapPin = React.memo(MapPinInner);
