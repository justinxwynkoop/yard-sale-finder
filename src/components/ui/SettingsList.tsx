import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * iOS-style grouped settings rows.
 *
 *   <SettingsGroup title="Account">
 *     <SettingsRow icon="person-outline" label="Edit profile" onPress={...} />
 *     <SettingsRow icon="heart-outline" label="Saved sales" detail="3" onPress={...} />
 *   </SettingsGroup>
 *
 * The Group renders a white rounded card with hairline separators
 * between children. The Row handles the icon tile / label / right
 * detail / chevron and respects a `destructive` variant for the
 * delete-account row.
 */

const BRAND = '#F97316';
const BRAND_TINT = '#FFEDD5';
const DESTRUCTIVE = '#DC2626';
const DESTRUCTIVE_TINT = '#FEE2E2';
const DIVIDER = '#F4F4F5';

type RowProps = {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconTint?: string;
  iconBg?: string;
  label: string;
  detail?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  /** Show the right-chevron. Defaults to true when onPress is set. */
  showChevron?: boolean;
  /** Style as a destructive action (red label + red icon). */
  destructive?: boolean;
  disabled?: boolean;
};

export function SettingsRow({
  icon,
  iconTint,
  iconBg,
  label,
  detail,
  right,
  onPress,
  showChevron,
  destructive,
  disabled,
}: RowProps) {
  const tint = destructive ? DESTRUCTIVE : iconTint ?? BRAND;
  const bg = destructive ? DESTRUCTIVE_TINT : iconBg ?? BRAND_TINT;
  const labelColor = destructive ? DESTRUCTIVE : '#18181B';
  const showChev = (showChevron ?? !!onPress) && !right;

  const Body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 52,
        gap: 12,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={17} color={tint} />
        </View>
      ) : null}
      <Text
        style={{
          flex: 1,
          fontSize: 16,
          color: labelColor,
          fontWeight: destructive ? '600' : '500',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {detail ? (
        <Text style={{ fontSize: 15, color: '#71717A' }} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      {right}
      {showChev ? (
        <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
      ) : null}
    </View>
  );

  if (!onPress || disabled) {
    return Body;
  }

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#F4F4F5' }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? '#FAFAFA' : 'transparent',
      })}
    >
      {Body}
    </Pressable>
  );
}

type GroupProps = {
  title?: string;
  footer?: string;
  children: React.ReactNode;
  /** Less vertical margin above when used as the first group on a screen. */
  compact?: boolean;
};

export function SettingsGroup({
  title,
  footer,
  children,
  compact,
}: GroupProps) {
  const rows = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={{ marginTop: compact ? 8 : 24 }}>
      {title ? (
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: '#A1A1AA',
            paddingHorizontal: 16,
            paddingBottom: 6,
          }}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#F4F4F5',
        }}
      >
        {rows.map((child, i) => (
          <View key={i}>
            {i > 0 ? (
              <View
                style={{
                  height: 1,
                  marginLeft: 58,
                  backgroundColor: DIVIDER,
                }}
              />
            ) : null}
            {child}
          </View>
        ))}
      </View>
      {footer ? (
        <Text
          style={{
            fontSize: 12,
            color: '#A1A1AA',
            paddingHorizontal: 16,
            paddingTop: 8,
            lineHeight: 16,
          }}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
