import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { HeaderButton } from './ui';

const INK = '#171513';
const HAIRLINE = '#E5DECC';

/**
 * Push-screen header used across the Profile management surfaces
 * (Your sales, Your listings, Saved, Account, Notifications, Blocked).
 * White background with hairline bottom border, a back chevron in a
 * circular tap target, the title, and an optional right slot.
 */
export function SubHeader({
  title,
  right,
  onBack,
}: {
  title: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const handleBack = onBack ?? (() => navigation.goBack());
  return (
    <View
      style={{
        paddingTop: insets.top + 4,
        paddingBottom: 12,
        paddingHorizontal: 10,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: HAIRLINE,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <HeaderButton onPress={handleBack} accessibilityLabel="Back" />
      <Text
        style={{
          flex: 1,
          marginLeft: 6,
          fontSize: 17,
          fontWeight: '700',
          color: INK,
          letterSpacing: -0.3,
        }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {right}
    </View>
  );
}
