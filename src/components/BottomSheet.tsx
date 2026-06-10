import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import GorhomBottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type SheetState = 'peek' | 'open';

type Props = {
  state: SheetState;
  onStateChange: (s: SheetState) => void;
  /** Peek height in pt. Default 240. */
  peekHeight?: number;
  /** Open height in pt. Default 420. */
  openHeight?: number;
  children: React.ReactNode;
};

/**
 * Two-snap sheet used on the Map screen. Driven externally so the
 * map (FAB position, list/map toggle button) can re-anchor to the
 * sheet's height in sync.
 */
export function BottomSheet({
  state,
  onStateChange,
  peekHeight = 240,
  openHeight = 420,
  children,
}: Props) {
  const ref = useRef<GorhomBottomSheet>(null);
  const insets = useSafeAreaInsets();
  // Tracks the index gorhom has actually settled at. Used to break the
  // feedback loop: a user drag fires onChange → onStateChange → parent
  // sets `state` → this effect runs. Without the guard the effect would
  // call snapToIndex again for the index gorhom is ALREADY at, which
  // re-triggers the spring and makes the sheet feel like it "fights"
  // the drag. We only programmatically snap when the requested state
  // genuinely differs from where the sheet already is (i.e. a header
  // tap, not a drag).
  const currentIndex = useRef(0);

  // Gorhom takes snap points as numbers (heights from the bottom).
  // index 0 = peek, 1 = open.
  const snapPoints = useMemo(
    () => [peekHeight, openHeight + insets.bottom],
    [peekHeight, openHeight, insets.bottom],
  );

  useEffect(() => {
    const idx = state === 'open' ? 1 : 0;
    if (currentIndex.current === idx) return;
    ref.current?.snapToIndex(idx);
  }, [state]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      currentIndex.current = index;
      const next: SheetState = index === 1 ? 'open' : 'peek';
      onStateChange(next);
    },
    [onStateChange],
  );

  return (
    <GorhomBottomSheet
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      // Dragging the sheet is DISABLED — the header pill is the only
      // open/close control. With content panning enabled, gorhom routed
      // the list's upward scroll into a sheet-drag and collapsed it. The
      // consumer pairs this with a PLAIN RN FlatList (not gorhom's), which
      // then scrolls natively with no gesture competing. Net: button
      // toggles the sheet, the list scrolls — no fighting.
      enableContentPanningGesture={false}
      enableHandlePanningGesture={false}
      enablePanDownToClose={false}
      handleIndicatorStyle={{
        width: 38,
        height: 4,
        borderRadius: 99,
        backgroundColor: '#E5DECC',
      }}
      backgroundStyle={{
        backgroundColor: '#fff',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
      }}
      animationConfigs={undefined}
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: -8 },
        elevation: 12,
      }}
    >
      <BottomSheetView style={{ flex: 1 }}>{children}</BottomSheetView>
    </GorhomBottomSheet>
  );
}
