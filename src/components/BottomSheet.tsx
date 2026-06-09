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

  // Gorhom takes snap points as strings/numbers. We translate the
  // two named states into indices: 0 = peek, 1 = open.
  const snapPoints = useMemo(
    () => [peekHeight, openHeight + insets.bottom],
    [peekHeight, openHeight, insets.bottom],
  );

  useEffect(() => {
    const idx = state === 'open' ? 1 : 0;
    ref.current?.snapToIndex(idx);
  }, [state]);

  const handleSheetChanges = useCallback(
    (index: number) => {
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
