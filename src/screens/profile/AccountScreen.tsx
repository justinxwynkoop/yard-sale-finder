import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { SubHeader } from '../../components/SubHeader';
import { Avatar } from '../../components/ui';
import { FieldEditor, FieldEditorConfig } from '../../components/FieldEditor';
import { useProfile, useUpdateProfile } from '../../hooks/useProfile';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useMySales } from '../../hooks/useSales';
import { uploadAvatar, deleteAvatar } from '../../lib/avatarUpload';
import { LocationPrivacy, PAYMENT_METHODS, Profile } from '../../types';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';
const ROSE_SOFT = '#F5DDD7';
const AMBER = '#B8772C';
const AMBER_SOFT = '#FBEFD6';

const BIO_MAX = 140;

/**
 * v7 Profile & account — a genuine editing surface. Every row opens the
 * reusable FieldEditor bottom-sheet; commits write to the profile row
 * and flash a "Saved" pill. The "Location & privacy" section is now
 * purely informational: yard sales always show their exact address,
 * while one-off listings only ever expose the general pickup area the
 * seller enters — so there's no per-account address-privacy toggle.
 */
export default function AccountScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { sales } = useMySales(user?.id);

  const [editor, setEditor] = useState<FieldEditorConfig | null>(null);
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  // Persist a single field, close the editor, flash. `key` is the
  // editor key; we map it to the actual profile column(s) here so the
  // editor configs stay UI-shaped.
  const commit = async (key: string, value: string | string[]) => {
    const patch: Partial<Profile> = {};
    if (key === 'name') patch.display_name = String(value);
    else if (key === 'neighborhood') {
      const [city, st] = String(value)
        .split(',')
        .map((s) => s.trim());
      patch.city = city || null;
      patch.state = (st || '').toUpperCase().slice(0, 2) || null;
    } else if (key === 'bio') patch.bio = String(value);
    else if (key === 'email') patch.email = String(value);
    else if (key === 'phone') patch.phone = String(value);
    else if (key === 'pay') patch.accepted_payments = value as string[];
    else if (key === 'locationPrivacy')
      patch.location_privacy = value as LocationPrivacy;
    else if (key === 'approxRadius') patch.blur_radius_blocks = Number(value);

    setEditor(null);
    const { error } = await updateProfile(patch);
    if (error) {
      Alert.alert('Could not save', error.message ?? 'Please try again.');
    } else {
      flash();
    }
  };

  // Real password change. Supabase's updateUser doesn't verify the old
  // password, so re-authenticate with it first — otherwise anyone with
  // the unlocked phone could silently take over the account.
  const changePassword = async (current: string, next: string) => {
    const email = user?.email;
    if (!email) {
      Alert.alert('Not signed in', 'Sign in again and retry.');
      return;
    }
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (reauthError) {
      Alert.alert(
        'Wrong current password',
        'The current password you entered didn\u2019t match.',
      );
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      Alert.alert('Could not update password', error.message);
      return;
    }
    flash();
  };

  const pickAvatar = async (source: 'camera' | 'library') => {
    setAvatarSheet(false);
    if (!user) return;
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Permission needed',
          `Allow ${
            source === 'camera' ? 'camera' : 'photo'
          } access to change your picture.`,
        );
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.9,
            });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(true);
      const url = await uploadAvatar(user.id, result.assets[0].uri);
      // Best-effort cleanup of the previous file.
      if (profile?.avatar_url) deleteAvatar(profile.avatar_url);
      const { error } = await updateProfile({ avatar_url: url });
      if (error) throw error;
      flash();
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarSheet(false);
    if (!profile?.avatar_url) return;
    deleteAvatar(profile.avatar_url);
    const { error } = await updateProfile({ avatar_url: null });
    if (!error) flash();
  };

  const handleDelete = () => {
    // The typed-DELETE confirmation already happened in the editor.
    navigation.navigate('DeleteAccount');
  };

  // ── Derived display strings ──────────────────────────────────────────
  const avatarName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    profile?.display_name ||
    '?';
  const nameValue = profile?.display_name || avatarName;
  const neighborhood =
    profile?.city && profile?.state
      ? `${profile.city}, ${profile.state}`
      : profile?.city || 'Add your neighborhood';
  const phoneMasked = profile?.phone || 'Add a phone number';
  const pay = profile?.accepted_payments ?? [];
  const memberYear = profile?.created_at
    ? new Date(profile.created_at).getFullYear()
    : new Date().getFullYear();

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader title="Profile & account" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: insets.bottom + 28,
        }}
      >
        {/* Avatar */}
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          <Pressable
            onPress={() => setAvatarSheet(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit photo"
            style={{ position: 'relative' }}
          >
            <Avatar
              uri={profile?.avatar_url ?? undefined}
              name={avatarName}
              px={88}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 30,
                height: 30,
                borderRadius: 99,
                backgroundColor: BRAND,
                borderWidth: 3,
                borderColor: BONE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="camera-outline" size={14} color="#fff" />
            </View>
          </Pressable>
          <Pressable onPress={() => setAvatarSheet(true)} hitSlop={8}>
            <Text
              style={{
                marginTop: 9,
                fontSize: 12.5,
                fontWeight: '600',
                color: BRAND,
              }}
            >
              {uploading ? 'Uploading…' : 'Edit photo'}
            </Text>
          </Pressable>
        </View>

        {/* Public info */}
        <SectionLabel>Public info</SectionLabel>
        <Caption>
          Shown on your public profile and every sale you host.
        </Caption>
        <Card>
          <Row
            label="Name"
            value={nameValue}
            onPress={() =>
              setEditor({
                type: 'text',
                key: 'name',
                title: 'Your name',
                value: profile?.display_name ?? '',
                placeholder: 'First L.',
              })
            }
          />
          <Row
            label="Neighborhood"
            value={neighborhood}
            muted={!profile?.city}
            onPress={() =>
              setEditor({
                type: 'text',
                key: 'neighborhood',
                title: 'Neighborhood',
                value:
                  profile?.city && profile?.state
                    ? `${profile.city}, ${profile.state}`
                    : '',
                placeholder: 'Town, State',
                hint: 'Buyers see this — not your street address.',
              })
            }
          />
          <Row
            label="Bio"
            value={profile?.bio || 'Add a short bio'}
            muted={!profile?.bio}
            last
            onPress={() =>
              setEditor({
                type: 'textarea',
                key: 'bio',
                title: 'Short bio',
                value: profile?.bio ?? '',
                max: BIO_MAX,
                placeholder:
                  'Downsizing collector. Tools, books, mid-century finds…',
              })
            }
          />
        </Card>

        {/* Contact & verification */}
        <SectionLabel>Contact &amp; verification</SectionLabel>
        <Card>
          <Row
            label="Email"
            value={profile?.email ?? ''}
            badge={profile?.email_verified ? <VerifiedPill /> : <VerifyPill />}
            onPress={() =>
              setEditor({
                type: 'text',
                key: 'email',
                title: 'Email',
                value: profile?.email ?? '',
                placeholder: 'you@email.com',
                keyboard: 'email-address',
              })
            }
          />
          <Row
            label="Phone"
            value={phoneMasked}
            muted={!profile?.phone}
            last
            badge={profile?.phone_verified ? <VerifiedPill /> : null}
            onPress={() =>
              setEditor({
                type: 'verifyPhone',
                key: 'phone',
                title: 'Phone number',
                value: profile?.phone ?? '',
              })
            }
          />
        </Card>
        <Caption top>
          Your phone number helps coordinate pickups if you choose to
          share it in chat. Contact info is never shown publicly.
        </Caption>

        {/* Payment accepted */}
        <SectionLabel>Payment accepted</SectionLabel>
        <Pressable
          onPress={() =>
            setEditor({
              type: 'chips',
              key: 'pay',
              title: 'Payment accepted',
              value: pay,
              options: PAYMENT_METHODS,
              hint: 'Shown on your sales so buyers come prepared.',
            })
          }
          style={{
            backgroundColor: '#fff',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: HAIRLINE,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
          }}
          accessibilityRole="button"
          accessibilityLabel="Edit payment methods"
        >
          <View
            style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
          >
            {pay.length ? (
              pay.map((p) => (
                <View
                  key={p}
                  style={{
                    backgroundColor: BRAND_SOFT,
                    paddingHorizontal: 11,
                    paddingVertical: 5,
                    borderRadius: 99,
                  }}
                >
                  <Text
                    style={{ fontSize: 12, fontWeight: '600', color: BRAND }}
                  >
                    {p}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ fontSize: 13, color: INK_MUTED }}>
                Add payment methods
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={14} color={INK_MUTED} />
        </Pressable>

        {/* Location & privacy — informational. Yard sales always show
            their exact address (shoppers need it); one-off listings only
            ever show the general pickup area the seller enters. There's
            no per-account toggle because the policy differs by content
            type. */}
        <SectionLabel>Location &amp; privacy</SectionLabel>
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: HAIRLINE,
            padding: 14,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Ionicons name="home-outline" size={18} color={BRAND} />
            <Text style={{ flex: 1, fontSize: 13, color: INK_SOFT, lineHeight: 19 }}>
              <Text style={{ fontWeight: '700', color: INK }}>Yard sales </Text>
              show your exact address on the map so shoppers can find you.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Ionicons name="pricetag-outline" size={18} color={BRAND} />
            <Text style={{ flex: 1, fontSize: 13, color: INK_SOFT, lineHeight: 19 }}>
              <Text style={{ fontWeight: '700', color: INK }}>One-off listings </Text>
              only show the general pickup area you enter — never your exact
              address. You arrange the meet-up by message.
            </Text>
          </View>
        </View>

        {/* Account */}
        <SectionLabel>Account</SectionLabel>
        <Card>
          <Row
            label="Change password"
            onPress={() =>
              setEditor({
                type: 'password',
                key: 'password',
                title: 'Change password',
              })
            }
          />
          <Row
            label="Privacy & data"
            onPress={() => navigation.navigate('Blocked')}
          />
          <Row label="Log out" muted onPress={() => signOut()} />
          <Row
            label="Delete account"
            danger
            last
            onPress={() =>
              setEditor({
                type: 'delete',
                key: 'delete',
                title: 'Delete account',
                summary: `This permanently removes your account, your ${
                  sales.length
                } ${
                  sales.length === 1 ? 'sale' : 'sales'
                }, listings, saved routes, and message history. This can’t be undone.`,
              })
            }
          />
        </Card>

        <Text
          style={{
            textAlign: 'center',
            marginTop: 16,
            fontSize: 10,
            color: INK_MUTED,
            letterSpacing: 0.4,
            fontVariant: ['tabular-nums'],
          }}
        >
          TROVE v2.0 · MEMBER SINCE {memberYear}
        </Text>
      </ScrollView>

      {/* Saved flash pill */}
      {saved ? (
        <View
          style={{
            position: 'absolute',
            bottom: insets.bottom + 24,
            alignSelf: 'center',
            backgroundColor: INK,
            paddingVertical: 9,
            paddingHorizontal: 16,
            borderRadius: 99,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          <Ionicons name="checkmark" size={14} color="#9CD89A" />
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#fff' }}>
            Saved
          </Text>
        </View>
      ) : null}

      {/* Avatar action sheet */}
      <Modal
        visible={avatarSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setAvatarSheet(false)}
      >
        <Pressable
          onPress={() => setAvatarSheet(false)}
          style={{ flex: 1, backgroundColor: 'rgba(20,18,15,0.42)' }}
        />
        <View
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <View
            style={{
              width: 38,
              height: 4,
              borderRadius: 99,
              backgroundColor: HAIRLINE,
              alignSelf: 'center',
              marginBottom: 14,
            }}
          />
          <Text
            style={{
              fontSize: 17,
              fontWeight: '700',
              color: INK,
              marginBottom: 12,
            }}
          >
            Profile photo
          </Text>
          <AvatarAction
            icon="camera-outline"
            label="Take photo"
            onPress={() => pickAvatar('camera')}
            first
          />
          <AvatarAction
            icon="grid-outline"
            label="Choose from library"
            onPress={() => pickAvatar('library')}
          />
          <AvatarAction
            icon="close"
            label="Remove photo"
            destructive
            onPress={removeAvatar}
          />
        </View>
      </Modal>

      {/* Field editor */}
      <FieldEditor
        editor={editor}
        onClose={() => setEditor(null)}
        onSave={commit}
        onDelete={handleDelete}
        onPassword={changePassword}
      />
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

function Row({
  label,
  value,
  onPress,
  last,
  badge,
  danger,
  muted,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
  badge?: React.ReactNode;
  danger?: boolean;
  muted?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 13,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: HAIRLINE,
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={{
          fontSize: 13.5,
          fontWeight: '600',
          color: danger ? ROSE : INK,
          flexShrink: 0,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 7,
          marginLeft: 8,
        }}
      >
        {badge}
        {value !== undefined ? (
          <Text
            style={{
              fontSize: 13,
              color: muted ? INK_MUTED : INK_SOFT,
              flexShrink: 1,
              textAlign: 'right',
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {!danger ? (
          <Ionicons name="chevron-forward" size={14} color={INK_MUTED} />
        ) : null}
      </View>
    </Pressable>
  );
}

function VerifiedPill() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: BRAND_SOFT,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 99,
      }}
    >
      <Ionicons name="checkmark" size={10} color={BRAND} />
      <Text
        style={{
          fontSize: 10,
          fontWeight: '700',
          color: BRAND,
          letterSpacing: 0.2,
        }}
      >
        Verified
      </Text>
    </View>
  );
}

function VerifyPill() {
  return (
    <View
      style={{
        backgroundColor: AMBER_SOFT,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 99,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: '700',
          color: AMBER,
          letterSpacing: 0.3,
        }}
      >
        Verify
      </Text>
    </View>
  );
}


function AvatarAction({
  icon,
  label,
  onPress,
  first,
  destructive,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  first?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: HAIRLINE,
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          backgroundColor: destructive ? ROSE_SOFT : BONE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={17} color={destructive ? ROSE : INK_SOFT} />
      </View>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: destructive ? ROSE : INK,
        }}
      >
        {label}
      </Text>
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
        marginTop: 18,
        marginBottom: 8,
        marginLeft: 4,
      }}
    >
      {children}
    </Text>
  );
}

function Caption({
  children,
  top,
}: {
  children: React.ReactNode;
  top?: boolean;
}) {
  return (
    <Text
      style={{
        fontSize: 11,
        color: INK_MUTED,
        lineHeight: 16,
        marginLeft: 4,
        marginRight: 4,
        marginTop: top ? 8 : -2,
        marginBottom: top ? 0 : 8,
      }}
    >
      {children}
    </Text>
  );
}
