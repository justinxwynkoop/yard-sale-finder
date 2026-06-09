import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { SubHeader } from '../../components/SubHeader';
import { Avatar } from '../../components/ui';
import { useProfile } from '../../hooks/useProfile';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';

/**
 * v3 redesign — Profile & account. Centered avatar with camera badge
 * + three grouped field lists. Each field is a tap target that opens
 * a focused editor — for v1 we route to the existing EditProfileScreen
 * which already handles all field edits in one place. Future polish:
 * split into per-field editor screens for a smoother flow.
 */
export default function AccountScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useProfile();

  // Mask the phone number for the "Private" display value.
  const maskedPhone =
    profile?.phone && profile.phone.length >= 4
      ? `+1 (•••) •••-•${profile.phone.slice(-3)}`
      : 'Add a phone number';

  // Neighborhood is composed from city + state.
  const neighborhood =
    profile?.city && profile?.state
      ? `${profile.city}, ${profile.state}`
      : 'Add your neighborhood';

  const goEditProfile = () => navigation.navigate('EditProfile');

  // Pre-compute display strings — Babel's parser doesn't accept mixed
  // ?? / || in JSX expression containers even when fully parenthesized,
  // so we resolve them out here.
  const fullName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    'Add your name';
  const nameValue = profile?.display_name ?? fullName;

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader title="Profile & account" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: 24,
        }}
      >
        {/* Avatar editor */}
        <Pressable
          onPress={goEditProfile}
          style={{
            alignItems: 'center',
            marginBottom: 18,
          }}
          accessibilityRole="button"
          accessibilityLabel="Change photo"
        >
          <View style={{ position: 'relative' }}>
            <Avatar
              uri={profile?.avatar_url ?? undefined}
              name={
                [profile?.first_name, profile?.last_name]
                  .filter(Boolean)
                  .join(' ') ||
                profile?.display_name ||
                '?'
              }
              px={84}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 28,
                height: 28,
                borderRadius: 99,
                backgroundColor: BRAND,
                borderWidth: 2,
                borderColor: BONE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="camera-outline" size={14} color="#fff" />
            </View>
          </View>
          <Text
            style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: '600',
              color: BRAND,
            }}
          >
            Change photo
          </Text>
        </Pressable>

        <SectionLabel>Public info</SectionLabel>
        <Card>
          <FieldRow
            label="Name"
            value={nameValue}
            onPress={goEditProfile}
          />
          <FieldRow
            label="Neighborhood"
            value={neighborhood}
            onPress={goEditProfile}
          />
          <FieldRow
            label="Bio"
            value={profile?.bio || 'Add a short bio'}
            onPress={goEditProfile}
            last
          />
        </Card>

        <SectionLabel>Private</SectionLabel>
        <Card>
          <FieldRow
            label="Email"
            value={profile?.email ?? ''}
            onPress={goEditProfile}
          />
          <FieldRow
            label="Phone"
            value={maskedPhone}
            onPress={goEditProfile}
          />
          <FieldRow
            label="Payment methods"
            value="Venmo · Cash"
            onPress={goEditProfile}
            last
          />
        </Card>

        <SectionLabel>Account</SectionLabel>
        <Card>
          <FieldRow
            label="Privacy"
            value=""
            onPress={() => navigation.navigate('Blocked')}
          />
          <Pressable
            onPress={() => navigation.navigate('DeleteAccount')}
            style={({ pressed }) => ({
              paddingVertical: 13,
              paddingHorizontal: 14,
              backgroundColor: pressed ? '#FBEAE6' : 'transparent',
            })}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: ROSE }}>
              Delete account
            </Text>
          </Pressable>
        </Card>
      </ScrollView>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function FieldRow({
  label,
  value,
  onPress,
  last,
}: {
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 13,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: HAIRLINE,
        backgroundColor: pressed ? '#F7F2E8' : 'transparent',
      })}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: INK }}>
        {label}
      </Text>
      {/* Value + chevron grouped with a tight 6pt gap; value shrinks
          within the group rather than against an arbitrary maxWidth. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          flexShrink: 1,
          marginLeft: 8,
        }}
      >
        {value ? (
          <Text
            style={{ fontSize: 13, color: INK_MUTED, flexShrink: 1 }}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={14} color={INK_MUTED} />
      </View>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: INK_MUTED,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        marginTop: 14,
        marginBottom: 8,
        marginLeft: 4,
      }}
    >
      {children}
    </Text>
  );
}
