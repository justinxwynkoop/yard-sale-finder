import React from 'react';
import { Modal, Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPickSale: () => void;
  onPickListing: () => void;
};

export function PostMenu({ visible, onClose, onPickSale, onPickListing }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1">
        <Pressable
          onPress={onClose}
          className="flex-1"
          style={{ backgroundColor: 'rgba(20,18,15,0.4)' }}
          accessibilityLabel="Close post menu"
          accessibilityRole="button"
        />
        <View
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom + 12, 30),
          }}
        >
          <View
            style={{
              width: 38,
              height: 4,
              borderRadius: 99,
              backgroundColor: '#E5DECC',
              alignSelf: 'center',
              marginBottom: 14,
            }}
          />
          <Text
            className="text-ink-900 mb-3"
            style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.3 }}
          >
            What are you posting?
          </Text>

          <PostRow
            iconBg="bg-brand-soft"
            iconColor="#1F4D3A"
            iconName="location-outline"
            title="A yard sale"
            subtitle="Show up on the map with a pin and hours"
            onPress={() => {
              onClose();
              onPickSale();
            }}
            first
          />
          <PostRow
            iconBg="bg-winding-bg"
            iconColor="#B8772C"
            iconName="pricetag-outline"
            title="A single item"
            subtitle="Sell one thing — no yard required"
            onPress={() => {
              onClose();
              onPickListing();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function PostRow({
  iconBg,
  iconColor,
  iconName,
  title,
  subtitle,
  onPress,
  first,
}: {
  iconBg: string;
  iconColor: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  first?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className={[
        'flex-row items-center py-3',
        first ? '' : 'border-t border-hairline',
      ].join(' ')}
    >
      <View
        className={`mr-3 h-11 w-11 items-center justify-center rounded-xl ${iconBg}`}
      >
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-ink-900 text-[14px] font-bold">{title}</Text>
        <Text className="text-ink-500 mt-px text-[12px]">{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#8A857C" />
    </Pressable>
  );
}
