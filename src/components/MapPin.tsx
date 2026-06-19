import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SaleStatus } from '../types';

const BRAND = '#1F4D3A'; // live (open now)
const GRAY = '#8A857C'; // active but not open now
const ROUTE_COLOR = '#4F46E5'; // in the route plan
const ROSE = '#A23E2D'; // saved
const AMBER = '#E0922F'; // new
const VISITED = '#A89C88'; // already visited (muted taupe + check)

const SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.25,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;

/**
 * Map marker for a sale, drawn so its kind is obvious without a legend:
 *   • SAVED → a rose heart
 *   • NEW (posted ≤ 3 days, and not yet visited) → a small "NEW" tag
 *   • VISITED → a muted taupe dot with a check (and never "NEW")
 *   • otherwise → a colored dot: green = open now, gray = not open
 *     (indigo = in the route plan)
 *
 * Saved takes precedence over new (a saved+new sale shows the heart). Every
 * variant is a single element centered on the coordinate, and all are static
 * (no Animated) so they can't revive the AIRMap insertReactSubview crash.
 */
function MapPinInner({
  status,
  favorited,
  inRoute,
  isNew,
  visited,
  openNow,
}: {
  status: SaleStatus;
  /** Saved by the current user → heart. */
  favorited?: boolean;
  /** In the route planner → indigo dot. */
  inRoute?: boolean;
  /** Posted within the last ~3 days → "NEW" tag. */
  isNew?: boolean;
  /** The current user has marked this sale visited → muted dot + check. */
  visited?: boolean;
  /** The sale's hours include the current time → green. */
  openNow?: boolean;
}) {
  // Saved — a white-outlined rose heart (the white heart behind gives the
  // contrast a plain glyph would lack on the map).
  if (favorited && !inRoute) {
    return (
      <View
        style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons
          name="heart"
          size={26}
          color="#fff"
          style={{ position: 'absolute' }}
        />
        <Ionicons name="heart" size={19} color={ROSE} />
      </View>
    );
  }

  // New — a small tag instead of a dot. A visited sale is no longer "new"
  // to you, so the tag is suppressed once you've marked it visited.
  if (isNew && !visited && !inRoute) {
    return (
      <View
        style={{
          backgroundColor: AMBER,
          borderRadius: 5,
          paddingHorizontal: 5,
          paddingVertical: 2,
          borderWidth: 1.5,
          borderColor: '#fff',
          ...SHADOW,
        }}
      >
        <Text
          style={{
            color: '#fff',
            fontSize: 9,
            fontWeight: '800',
            letterSpacing: 0.4,
            includeFontPadding: false,
          }}
        >
          NEW
        </Text>
      </View>
    );
  }

  // Otherwise a colored dot. Visited sales get a muted taupe fill + a check
  // so you can see at a glance which ones you've already been to.
  const isLive = status === 'active' && openNow;
  const fill = inRoute
    ? ROUTE_COLOR
    : visited
      ? VISITED
      : isLive
        ? BRAND
        : GRAY;
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: fill,
        borderWidth: 2.5,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        ...SHADOW,
      }}
    >
      {visited && !inRoute ? (
        <Ionicons name="checkmark" size={12} color="#fff" />
      ) : null}
    </View>
  );
}

export const MapPin = React.memo(MapPinInner);
