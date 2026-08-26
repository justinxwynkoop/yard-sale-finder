import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Marker, MapMarkerProps } from 'react-native-maps';

type Props = Omit<MapMarkerProps, 'tracksViewChanges'> & {
  /**
   * Encodes everything that changes the marker's rendered look (variant,
   * colors, count). A change re-arms one snapshot window so Android repaints.
   */
  redrawKey?: string | number;
};

/**
 * Marker that works around the Android/Google Maps snapshot quirk: with
 * `tracksViewChanges={false}` the custom child is rasterized ONCE on mount —
 * reliably before it has drawn, so the icon comes out as a blank bitmap and
 * every pin is invisible — and never again, so later variant changes (heart,
 * check, NEW tag) wouldn't repaint either.
 *
 * On Android this tracks view changes briefly on mount and again whenever
 * `redrawKey` changes, then freezes for performance. On iOS (Apple Maps) the
 * prop stays false and children render live — keeping the marker subtree
 * static, per the AIRMap insertReactSubview crash constraints in
 * MapHomeScreen.
 */
export function SnapshotMarker({ redrawKey, children, ...rest }: Props) {
  const [tracking, setTracking] = useState(Platform.OS === 'android');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    setTracking(true);
    // One settle window: long enough for the child's first draw (icon fonts
    // included), short enough that 45 pins don't keep invalidating the map.
    const t = setTimeout(() => setTracking(false), 500);
    return () => clearTimeout(t);
  }, [redrawKey]);
  return (
    <Marker
      {...rest}
      tracksViewChanges={Platform.OS === 'android' ? tracking : false}
    >
      {children}
    </Marker>
  );
}
