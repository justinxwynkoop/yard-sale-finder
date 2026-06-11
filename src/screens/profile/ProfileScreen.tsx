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
import { useMySales } from '../../hooks/useSales';
import { useMyListings } from '../../hooks/useListings';
import { useFavorites } from '../../hooks/useFavorites';
import { useReviews } from '../../hooks/useReviews';
import { ROUTE_PLANNER_ENABLED } from '../../lib/featureFlags';
import { ProfileStackParamList } from '../../types';
import { Avatar, Button } from '../../components/ui';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';

const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@trove.app';

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();
  const { profile, loading, error, refetch } = useProfile();
  const { appVersion, buildNumber } = useAppVersion();
  const { sales } = useMySales(profile?.id);
  const { listings } = useMyListings(profile?.id);
  const { favorites } = useFavorites();
  const { summary: reviewSummary } = useReviews(profile?.id);
  const [debugOpen, setDebugOpen] = useState(false);

  // Sublabel breakdowns shown on the Manage rows — match the
  // "{X} active · {Y} ended" / "{X} live · {Y} sold" copy from the
  // v6 screenshots so the row gives at-a-glance status without
  // needing to push in.
  const activeSalesCount = sales.filter((s) => s.status !== 'ended').length;
  const endedSalesCount = sales.length - activeSalesCount;
  const liveListingsCount = listings.filter((l) => l.status === 'available').length;
  const soldListingsCount = listings.length - liveListingsCount;

  const appName = Constants.expoConfig?.name ?? '';

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleEmailSupport = () => {
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
          backgroundColor: BONE,
        }}
      >
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BONE }} edges={['top']}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Ionicons name="cloud-offline-outline" size={36} color={INK_MUTED} />
          <Text
            style={{
              marginTop: 12,
              fontSize: 17,
              fontWeight: '600',
              color: INK,
            }}
          >
            Profile not ready yet
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 14,
              color: INK_MUTED,
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

  const displayName = profile.display_name ?? 'Your profile';
  // Prefer first+last for the avatar so it reliably shows two initials
  // (e.g. "JR") even when display_name is a single token. Falls back to
  // display_name, then '?'.
  const avatarName =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.display_name ||
    '?';
  const location =
    profile.city && profile.state
      ? `${profile.city}, ${profile.state}`
      : profile.city ?? profile.state ?? null;
  const joined = profile.created_at
    ? `Joined ${new Date(profile.created_at).toLocaleString(undefined, {
        year: 'numeric',
      })}`
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 48 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 4,
            paddingBottom: 14,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: '800',
              color: INK,
              letterSpacing: -0.5,
            }}
          >
            You
          </Text>
          <Pressable
            onPress={() => navigation.navigate('Notifications')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: HAIRLINE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={15} color={INK} />
          </Pressable>
        </View>

        {/* Profile card — tap to preview your public profile */}
        <Pressable
          onPress={() =>
            profile?.id &&
            navigation.navigate('PublicProfile', {
              userId: profile.id,
              self: true,
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Preview public profile"
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: HAIRLINE,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Avatar
            uri={profile.avatar_url}
            name={avatarName}
            px={56}
          />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text
              style={{
                fontSize: 17,
                fontWeight: '700',
                color: INK,
                letterSpacing: -0.3,
              }}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontSize: 12,
                color: INK_MUTED,
              }}
              numberOfLines={1}
            >
              {[location, joined].filter(Boolean).join(' · ')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 7,
              }}
            >
              <Ionicons name="star" size={11} color="#B8772C" />
              {/* The numeric rating is emphasized (dark, bold); the
                  trailing "· N sales hosted" recedes in muted ink —
                  matches the two-tone treatment in 09-profile.png. */}
              {reviewSummary.review_count > 0 ? (
                <Text style={{ marginLeft: 4, fontSize: 11 }}>
                  <Text style={{ fontWeight: '700', color: INK }}>
                    {reviewSummary.avg_stars.toFixed(1)}
                  </Text>
                  <Text style={{ color: INK_MUTED }}>
                    {` · ${sales.length} ${
                      sales.length === 1 ? 'sale' : 'sales'
                    } hosted`}
                  </Text>
                </Text>
              ) : (
                <Text
                  style={{ marginLeft: 4, fontSize: 11, color: INK_MUTED }}
                >
                  {`${sales.length} ${
                    sales.length === 1 ? 'sale' : 'sales'
                  } hosted`}
                </Text>
              )}
            </View>
          </View>
          {/* The trailing element is a "View →" affordance rather than
              a bare chevron — matches 09-profile.png. Reinforces that
              tapping the card opens the public-profile preview. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: BRAND }}>
              View
            </Text>
            <Ionicons name="chevron-forward" size={14} color={BRAND} />
          </View>
        </Pressable>

        {/* MANAGE */}
        <SectionLabel>Manage</SectionLabel>
        <RowList>
          <Row
            icon="pricetag-outline"
            label="Your sales"
            sublabel={
              sales.length === 0
                ? 'No sales yet'
                : `${activeSalesCount} active · ${endedSalesCount} ended`
            }
            badge={activeSalesCount > 0 ? String(activeSalesCount) : undefined}
            onPress={() => navigation.navigate('MySales')}
          />
          <Row
            icon="storefront-outline"
            label="Your listings"
            sublabel={
              listings.length === 0
                ? 'No listings yet'
                : `${liveListingsCount} live · ${soldListingsCount} sold`
            }
            onPress={() => navigation.navigate('MyListings')}
          />
          <Row
            icon="heart-outline"
            label={ROUTE_PLANNER_ENABLED ? 'Saved & routes' : 'Saved sales'}
            sublabel={
              favorites.length > 0
                ? `${favorites.length} ${favorites.length === 1 ? 'sale' : 'sales'} saved`
                : 'Sales you heart show up here'
            }
            onPress={() => navigation.navigate('Saved')}
            last
          />
        </RowList>

        {/* SETTINGS */}
        <SectionLabel>Settings</SectionLabel>
        <RowList>
          <Row
            icon="person-outline"
            label="Profile & account"
            onPress={() => navigation.navigate('Account')}
          />
          <Row
            icon="notifications-outline"
            label="Notifications"
            sublabel={
              profile.notify_sales_nearby
                ? 'Pings for sales within 1 mi'
                : 'Customize alerts'
            }
            onPress={() => navigation.navigate('Notifications')}
          />
          <Row
            icon="shield-checkmark-outline"
            label="Blocked users"
            onPress={() => navigation.navigate('Blocked')}
            last
          />
        </RowList>

        {/* About */}
        <SectionLabel>About</SectionLabel>
        <RowList>
          <Row
            icon="mail-outline"
            label="Email support"
            sublabel={SUPPORT_EMAIL}
            onPress={handleEmailSupport}
          />
          {__DEV__ ? (
            <VersionRow
              label={`Version ${appVersion}${buildNumber ? ` (${buildNumber})` : ''}`}
              onUnlock={() => setDebugOpen(true)}
            />
          ) : (
            <Row
              icon="information-circle-outline"
              label={`Version ${appVersion}${buildNumber ? ` (${buildNumber})` : ''}`}
              chevron={false}
              onPress={() => {}}
              last
            />
          )}
        </RowList>

        {/* Destructive actions */}
        <View style={{ marginTop: 20 }}>
          <Pressable
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: HAIRLINE,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: ROSE }}>
              Sign out
            </Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('DeleteAccount')}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            style={{ marginTop: 12, alignItems: 'center', paddingVertical: 8 }}
          >
            <Text style={{ fontSize: 12, color: INK_MUTED }}>Delete account</Text>
          </Pressable>
        </View>
      </ScrollView>

      <DebugInfoModal
        visible={debugOpen}
        onClose={() => setDebugOpen(false)}
      />
    </SafeAreaView>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        marginTop: 14,
        marginBottom: 8,
        marginLeft: 4,
        fontSize: 11,
        fontWeight: '700',
        color: INK_MUTED,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
  );
}

function RowList({ children }: { children: React.ReactNode }) {
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
  icon,
  label,
  sublabel,
  badge,
  onPress,
  chevron = true,
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sublabel?: string;
  badge?: string;
  onPress: () => void;
  chevron?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: HAIRLINE,
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          backgroundColor: BONE,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Ionicons name={icon} size={16} color={INK_SOFT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: INK }}>
          {label}
        </Text>
        {sublabel ? (
          <Text
            style={{ marginTop: 1, fontSize: 11, color: INK_MUTED }}
            numberOfLines={1}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View
          style={{
            backgroundColor: BRAND,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 99,
            marginRight: chevron ? 6 : 0,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
            {badge}
          </Text>
        </View>
      ) : null}
      {chevron ? (
        <Ionicons name="chevron-forward" size={16} color={INK_MUTED} />
      ) : null}
    </Pressable>
  );
}

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
    if (now - lastTap.current > 3000) taps.current = 0;
    lastTap.current = now;
    taps.current += 1;
    if (taps.current >= 7) {
      taps.current = 0;
      onUnlock();
    }
  };
  return (
    <Row
      icon="information-circle-outline"
      label={label}
      chevron={false}
      onPress={handle}
      last
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
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight: '700',
              color: INK,
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
        marginVertical: 4,
      }}
    >
      <Text style={{ fontSize: 13, color: INK_MUTED }}>{label}</Text>
      <Text
        selectable
        numberOfLines={1}
        style={{
          fontSize: 13,
          color: INK,
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          flexShrink: 1,
          marginLeft: 8,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
