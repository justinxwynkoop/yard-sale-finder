import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { useAppVersion } from '../../hooks/useAppVersion';
import { ProfileStackParamList } from '../../types';
import {
  Avatar,
  Button,
  SettingsGroup,
  SettingsRow,
} from '../../components/ui';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

const BRAND = '#F97316';
const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@localhauls.app';

/**
 * Identity + settings hub. Two sections only -- Account and About --
 * per the 2026-05-22 Profile redesign spec. App name is sourced from
 * Expo config (never hardcoded). Build details are gated behind a
 * tap-version-7-times easter egg so the main surface stays clean.
 *
 * Account deletion remains a destructive row in the Account group
 * because Apple App Store Guideline 5.1.1(v) requires in-app
 * account deletion for any app that creates accounts.
 */
export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();
  const { profile, loading, error, refetch } = useProfile();
  const { appVersion, buildNumber } = useAppVersion();
  const [debugOpen, setDebugOpen] = useState(false);

  const appName = Constants.expoConfig?.name ?? '';

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleHelp = () => {
    const subject = encodeURIComponent(`${appName || 'App'} support`);
    const body = encodeURIComponent(
      `\n\n---\nDevice: ${Platform.OS} ${Platform.Version}\nVersion: ${appVersion}${
        buildNumber ? ` (${buildNumber})` : ''
      }\n`,
    );
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
        }}
      >
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Ionicons name="cloud-offline-outline" size={36} color="#A1A1AA" />
          <Text
            style={{
              marginTop: 12,
              fontSize: 17,
              fontWeight: '600',
              color: '#18181B',
            }}
          >
            Profile not ready yet
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 14,
              color: '#71717A',
              textAlign: 'center',
            }}
          >
            {error ?? 'Give it a moment, then tap retry.'}
          </Text>
          <View style={{ marginTop: 16 }}>
            <Button variant="outline" onPress={refetch}>
              Retry
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = profile.display_name ?? '';
  const email = profile.email ?? '';

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 48,
        }}
      >
        <View style={{ paddingHorizontal: 4, paddingTop: 4, paddingBottom: 8 }}>
          <Text
            style={{ fontSize: 28, fontWeight: '800', color: '#18181B' }}
          >
            Profile
          </Text>
        </View>

        {/* Identity hero */}
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <Pressable
            onPress={() => navigation.navigate('EditProfile')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${displayName || 'Profile'} avatar, opens Edit Profile`}
          >
            <Avatar uri={profile.avatar_url} name={displayName} size="xl" />
          </Pressable>
          <Text
            style={{
              marginTop: 14,
              fontSize: 20,
              fontWeight: '700',
              color: '#18181B',
            }}
            numberOfLines={1}
          >
            {displayName || 'Add your name'}
          </Text>
          {email ? (
            <Text
              style={{ marginTop: 2, fontSize: 14, color: '#71717A' }}
              numberOfLines={1}
            >
              {email}
            </Text>
          ) : null}
          <View style={{ marginTop: 14 }}>
            <Button
              variant="outline"
              onPress={() => navigation.navigate('EditProfile')}
            >
              Edit Profile
            </Button>
          </View>
        </View>

        {/* Account */}
        <SettingsGroup title="Account">
          <SettingsRow
            icon="person-circle-outline"
            label="Edit Profile"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <SettingsRow
            icon="log-out-outline"
            label="Sign Out"
            destructive
            showChevron={false}
            onPress={handleSignOut}
          />
          <SettingsRow
            icon="trash-outline"
            label="Delete Account"
            destructive
            onPress={() => navigation.navigate('DeleteAccount')}
          />
        </SettingsGroup>

        {/* About */}
        <SettingsGroup title="About">
          <VersionRow
            label={`Version ${appVersion}${buildNumber ? ` (${buildNumber})` : ''}`}
            onUnlock={() => setDebugOpen(true)}
          />
          <SettingsRow
            icon="mail-outline"
            label="Help & Feedback"
            onPress={handleHelp}
          />
        </SettingsGroup>

        {appName ? (
          <Text
            style={{
              marginTop: 24,
              fontSize: 12,
              color: '#A1A1AA',
              textAlign: 'center',
            }}
          >
            {appName}
          </Text>
        ) : null}
      </ScrollView>

      <DebugInfoModal
        visible={debugOpen}
        onClose={() => setDebugOpen(false)}
      />
    </SafeAreaView>
  );
}

/**
 * Version row that opens the debug modal after 7 taps within 3
 * seconds. Resets the counter on any pause longer than that, so
 * casual mistaps don't open it.
 */
function VersionRow({
  label,
  onUnlock,
}: {
  label: string;
  onUnlock: () => void;
}) {
  const taps = useRef(0);
  const lastTap = useRef(0);

  const handle = () => {
    const now = Date.now();
    if (now - lastTap.current > 3000) {
      taps.current = 0;
    }
    lastTap.current = now;
    taps.current += 1;
    if (taps.current >= 7) {
      taps.current = 0;
      onUnlock();
    }
  };

  return (
    <SettingsRow
      icon="information-circle-outline"
      label={label}
      showChevron={false}
      onPress={handle}
    />
  );
}

function DebugInfoModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { runtimeVersion, channel, updateId, isEmbedded, createdAt } =
    useAppVersion();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.35)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 20,
            width: '100%',
            maxWidth: 360,
            gap: 8,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight: '700',
              color: '#18181B',
              marginBottom: 8,
            }}
          >
            Build details
          </Text>
          <DebugRow label="Runtime" value={runtimeVersion} />
          <DebugRow label="Channel" value={channel} />
          <DebugRow
            label="Update"
            value={
              isEmbedded
                ? 'embedded (no OTA applied)'
                : (updateId ?? 'embedded').slice(0, 8)
            }
          />
          <DebugRow
            label="Pushed"
            value={
              createdAt
                ? createdAt.toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : '—'
            }
          />
          <View style={{ marginTop: 12 }}>
            <Button variant="outline" onPress={onClose}>
              Close
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <Text style={{ fontSize: 13, color: '#71717A' }}>{label}</Text>
      <Text
        selectable
        numberOfLines={1}
        style={{
          fontSize: 13,
          color: '#27272A',
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          flexShrink: 1,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
