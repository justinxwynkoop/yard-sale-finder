import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Alert,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Share,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as StoreReview from 'expo-store-review';
import { useAuth } from '../../hooks/useAuth';
import { useFavorites } from '../../hooks/useFavorites';
import { useAppVersion } from '../../hooks/useAppVersion';
import { useMySales } from '../../hooks/useSales';
import { supabase } from '../../lib/supabase';
import { Profile, ProfileStackParamList } from '../../types';
import {
  Avatar,
  Button,
  SettingsGroup,
  SettingsRow,
} from '../../components/ui';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

const SUPPORT_EMAIL = 'jasonwynkoop1@yahoo.com';
const PRIVACY_URL = 'https://justinxwynkoop.github.io/yard-sale-finder/privacy.html';
const TERMS_URL = 'https://justinxwynkoop.github.io/yard-sale-finder/terms.html';
const SUPPORT_URL = 'https://justinxwynkoop.github.io/yard-sale-finder/';
const APP_STORE_URL = 'https://apps.apple.com/app/id6771190709';

/**
 * Grouped-settings-list style profile screen modeled on iOS
 * Settings.app conventions (and approachable enough to feel
 * native on Android too). Sections:
 *
 *   - Profile header card (avatar + name + email + Edit)
 *   - My Activity (Saved sales, future: own sales count)
 *   - Support  (Contact, Rate, Share)
 *   - Legal    (Privacy Policy, Terms of Service)
 *   - About    (Version + build, expandable build details in dev)
 *   - Sign Out (destructive button)
 *   - Delete Account (destructive link to a dedicated screen)
 *
 * Sub-screens (Edit Profile, Saved Sales, Delete Account) live in
 * the same ProfileNavigator stack and push on top of this one.
 */
export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<Nav>();
  const { favorites } = useFavorites();
  const { sales: mySales } = useMySales(user?.id);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data ?? null);
        setLoading(false);
      });
  }, [user]);

  // Re-fetch whenever the screen comes back into focus, so an edit on
  // EditProfileScreen reflects here immediately when the user pops back.
  useFocusEffect(loadProfile);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleContact = () => {
    const subject = encodeURIComponent('Local Hauls support');
    const body = encodeURIComponent(
      `\n\n---\nDevice: ${Platform.OS} ${Platform.Version}\n`,
    );
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
  };

  const handleRate = async () => {
    try {
      if (await StoreReview.isAvailableAsync()) {
        if (await StoreReview.hasAction()) {
          await StoreReview.requestReview();
          return;
        }
      }
    } catch {}
    // Fallback: deep-link to the App Store page.
    Linking.openURL(APP_STORE_URL);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message:
          'Local Hauls — find yard sales near you on a live map. ' +
          APP_STORE_URL,
        url: APP_STORE_URL,
      });
    } catch {}
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
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  const displayName = profile?.display_name ?? '';
  const email = profile?.email ?? user?.email ?? '';

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="bg-white px-5 py-4">
        <Text className="text-2xl font-extrabold text-zinc-900">Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
      >
        {/* Header card */}
        <Pressable
          onPress={() => navigation.navigate('EditProfile')}
          android_ripple={{ color: '#F4F4F5' }}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#FAFAFA' : '#FFFFFF',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#F4F4F5',
            padding: 16,
            marginTop: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          })}
        >
          <Avatar
            uri={profile?.avatar_url}
            name={displayName || email}
            size="lg"
          />
          <View style={{ flex: 1 }}>
            <Text className="text-lg font-bold text-zinc-900">
              {displayName || 'Add your name'}
            </Text>
            {email ? (
              <Text className="text-sm text-zinc-500" numberOfLines={1}>
                {email}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
        </Pressable>

        {/* My Activity */}
        <SettingsGroup title="My Activity">
          <SettingsRow
            icon="pricetag-outline"
            label="My sales"
            detail={String(mySales?.length ?? 0)}
            onPress={() =>
              (navigation as any).navigate('MySales', {
                screen: 'MySalesHome',
              })
            }
          />
          <SettingsRow
            icon="heart-outline"
            label="Saved sales"
            detail={String(favorites.length)}
            onPress={() => navigation.navigate('SavedSales')}
          />
        </SettingsGroup>

        {/* Support */}
        <SettingsGroup title="Support">
          <SettingsRow
            icon="help-circle-outline"
            label="Help & support"
            onPress={() => Linking.openURL(SUPPORT_URL)}
          />
          <SettingsRow
            icon="mail-outline"
            label="Contact us"
            onPress={handleContact}
          />
          <SettingsRow
            icon="star-outline"
            label="Rate Local Hauls"
            onPress={handleRate}
            showChevron={false}
          />
          <SettingsRow
            icon="share-social-outline"
            label="Share Local Hauls"
            onPress={handleShare}
            showChevron={false}
          />
        </SettingsGroup>

        {/* Legal */}
        <SettingsGroup title="Legal">
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => Linking.openURL(PRIVACY_URL)}
            showChevron={false}
            right={
              <Ionicons name="open-outline" size={16} color="#A1A1AA" />
            }
          />
          <SettingsRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => Linking.openURL(TERMS_URL)}
            showChevron={false}
            right={
              <Ionicons name="open-outline" size={16} color="#A1A1AA" />
            }
          />
        </SettingsGroup>

        <AboutFooter />

        {/* Sign Out */}
        <View style={{ marginTop: 24 }}>
          <Button
            variant="outline"
            size="lg"
            onPress={handleSignOut}
            textClassName="text-red-600"
            leftIcon={
              <Ionicons name="log-out-outline" size={18} color="#DC2626" />
            }
          >
            Sign out
          </Button>
        </View>

        {/* Delete Account */}
        <View style={{ marginTop: 12, alignItems: 'center' }}>
          <Pressable
            onPress={() => navigation.navigate('DeleteAccount')}
            hitSlop={12}
          >
            <Text
              style={{
                color: '#DC2626',
                fontSize: 14,
                fontWeight: '600',
                paddingVertical: 12,
              }}
            >
              Delete account
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Centered "Local Hauls · vX.Y.Z (build N)" string at the bottom of
 * the screen, the iOS convention. In dev builds we also show the
 * runtime/channel/update-id for QA.
 */
function AboutFooter() {
  const {
    appVersion,
    buildNumber,
    runtimeVersion,
    channel,
    updateId,
    isEmbedded,
  } = useAppVersion();
  return (
    <View
      style={{
        alignItems: 'center',
        marginTop: 28,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#71717A' }}>
        Local Hauls
      </Text>
      <Text style={{ fontSize: 12, color: '#A1A1AA' }}>
        Version {appVersion}
        {buildNumber ? ` (${buildNumber})` : ''}
      </Text>
      {__DEV__ ? (
        <Text
          selectable
          style={{
            fontSize: 11,
            color: '#A1A1AA',
            marginTop: 2,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          }}
        >
          rt {runtimeVersion} · {channel} ·{' '}
          {isEmbedded ? 'embedded' : (updateId ?? '').slice(0, 8)}
        </Text>
      ) : null}
    </View>
  );
}
