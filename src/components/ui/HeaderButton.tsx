import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const HAIRLINE = '#E5DECC';
const INK = '#171513';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * The single canonical top-of-screen button used across the app, so every
 * back / close / cancel control looks identical.
 *
 * - variant="tile" (default): a 36×36 rounded-square white tile with a
 *   hairline border + faint shadow. Reads clearly on BOTH bone pages and
 *   white header bars, which is why it's white-with-shadow rather than a
 *   bone fill (bone would vanish on a bone page). Used in every header bar
 *   and inside SubHeader.
 * - variant="glass": a frosted circular button for controls that float
 *   OVER a hero photo / colored band / camera (Sale + Listing detail,
 *   Public profile, Capture) — near-opaque white so the ink icon stays
 *   legible on any background.
 *
 * NOTE: styles are static objects (no function-form `style={({pressed})}`)
 * because NativeWind v4 silently drops function-form Pressable styles.
 */
export function HeaderButton({
  onPress,
  icon = 'chevron-back',
  variant = 'tile',
  accessibilityLabel = 'Back',
}: {
  onPress: () => void;
  icon?: IoniconName;
  variant?: 'tile' | 'glass';
  accessibilityLabel?: string;
}) {
  const glass = variant === 'glass';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: glass ? 999 : 12,
        backgroundColor: glass ? 'rgba(255,255,255,0.92)' : '#fff',
        borderWidth: glass ? 0 : 1,
        borderColor: HAIRLINE,
        shadowColor: '#000',
        shadowOpacity: glass ? 0.18 : 0.06,
        shadowRadius: glass ? 6 : 4,
        shadowOffset: { width: 0, height: glass ? 2 : 1 },
        elevation: glass ? 3 : 1,
      }}
    >
      <Ionicons name={icon} size={20} color={INK} />
    </Pressable>
  );
}
