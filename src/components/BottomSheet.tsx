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
      // Content panning MUST stay enabled — gorhom couples the inner
      // BottomSheetFlatList's scroll to this gesture, so disabling it
      // (which we briefly did to kill drag-quirkiness) also froze the
      // list. The original quirk came from a horizontal carousel fighting
      // the vertical drag; that carousel is gone, so panning is clean now.
      // The header pill is still the primary open/close control; this just
      // also lets the list scroll and pull-down-to-collapse from the top.
      enableContentPanningGesture
      // Handle isn't a drag affordance — the pill toggles. (Keeps the
      // grabber decorative so there's one obvious control.)
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
