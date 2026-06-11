import React, { useEffect, useRef } from 'react';
import { Animated, View, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type SheetState = 'peek' | 'open';

type Props = {
  state: SheetState;
  /** Kept for API compatibility. Unused — the sheet has no drag, so it
   *  only changes state when the parent's header pill flips `state`. */
  onStateChange?: (s: SheetState) => void;
  /** Peek height in pt. Default 240. */
  peekHeight?: number;
  /** Open height in pt (safe-area inset is added on top). Default 420. */
  openHeight?: number;
  children: React.ReactNode;
};

/**
 * Two-height bottom panel for the Map screen. Deliberately NOT a gorhom
 * sheet: it's button-controlled (the header List/Map pill), so the only
 * thing that ever needed gorhom — the drag gesture — is unwanted here,
 * and that gesture system actively fought the inner list's scroll
 * (either freezing it or hijacking the swipe to collapse the sheet).
 *
 * A plain Animated height container has no gesture layer, so a normal
 * <FlatList style={{ flex: 1 }}> child gets a real bounded height and
 * scrolls natively. State changes animate the height.
 */
export function BottomSheet({
  state,
  peekHeight = 240,
  openHeight = 420,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const target = state === 'open' ? openHeight + insets.bottom : peekHeight;
  const height = useRef(new Animated.Value(target)).current;

  useEffect(() => {
    Animated.timing(height, {
      toValue: target,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      // height isn't supported by the native driver.
      useNativeDriver: false,
    }).start();
  }, [target, height]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height,
        backgroundColor: '#fff',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: -8 },
        elevation: 12,
      }}
    >
      {/* Decorative grabber (no drag — the pill toggles). */}
      <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}>
        <View
          style={{
            width: 38,
            height: 4,
            borderRadius: 99,
            backgroundColor: '#E5DECC',
          }}
        />
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}
