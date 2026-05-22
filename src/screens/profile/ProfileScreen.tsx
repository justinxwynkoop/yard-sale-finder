import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../hooks/useAuth';
import { useFavorites } from '../../hooks/useFavorites';
import { useAppVersion } from '../../hooks/useAppVersion';
import { supabase } from '../../lib/supabase';
import { Profile, MainTabParamList } from '../../types';
import { Avatar, Badge, Button, Card, Input } from '../../components/ui';
import { toast } from '../../lib/toast';
import { formatSaleDate } from '../../utils/format';

type Nav = NativeStackNavigationProp<MainTabParamList, 'Profile'>;

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<Nav>();
  const { favorites } = useFavorites();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setProfile(data);
        setDisplayName(data?.display_name ?? '');
        setLoading(false);
      });
  }, [user]);

  const save = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'Sign in to save your profile.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Could not save', error.message);
    } else {
      toast.success('Profile saved');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="bg-white px-5 py-4">
        <Text className="text-2xl font-extrabold text-zinc-900">Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Card className="items-center px-6 py-8">
          <Avatar uri={profile?.avatar_url} name={displayName} size="xl" />
          <Text className="mt-4 text-lg font-bold text-zinc-900">
            {displayName || 'Add your name'}
          </Text>
          <Text className="mt-1 text-sm text-zinc-500">
            {profile?.email ?? (user ? user.email : 'Not signed in')}
          </Text>
          {!user && (
            <View className="mt-3">
              <Badge tone="winding">Dev bypass — no user</Badge>
            </View>
          )}
        </Card>

        <Card className="p-5">
          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            maxLength={50}
            containerClassName="mb-4"
          />
          <Button onPress={save} loading={saving} size="md">
            Save changes
          </Button>
        </Card>

        {/* Saved sales */}
        {favorites.length > 0 && (
          <Card className="p-5">
            <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
              Saved sales ({favorites.length})
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              {favorites.map((s) => {
                const cover = s.media?.find((m) => m.type === 'image');
                return (
                  <Pressable
                    key={s.id}
                    onPress={() =>
                      (navigation as any).navigate('Map', {
                        screen: 'SaleDetail',
                        params: { saleId: s.id },
                      })
                    }
                    style={{ width: 140 }}
                  >
                    <View
                      style={{
                        width: 140,
                        height: 100,
                        borderRadius: 12,
                        overflow: 'hidden',
                        backgroundColor: '#FFEDD5',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {cover ? (
                        <Image
                          source={{ uri: cover.url }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          transition={150}
                        />
                      ) : (
                        <Ionicons name="image-outline" size={28} color="#F97316" />
                      )}
                    </View>
                    <Text className="mt-1.5 text-sm font-semibold text-zinc-900" numberOfLines={1}>
                      {s.title}
                    </Text>
                    <Text className="text-xs text-zinc-500" numberOfLines={1}>
                      {formatSaleDate(s.start_date, s.end_date)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Card>
        )}

        <AppInfoCard />

        <DebugInfoCard />

        <View className="mt-2">
          <Button variant="outline" onPress={handleSignOut} textClassName="text-red-600"
            leftIcon={<Ionicons name="log-out-outline" size={18} color="#DC2626" />}>
            Sign out
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AppInfoCard() {
  const { appVersion, buildNumber } = useAppVersion();
  return (
    <Card className="p-5">
      <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
        App
      </Text>
      <View className="flex-row items-center" style={{ gap: 12 }}>
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
          <Ionicons
            name="information-circle-outline"
            size={20}
            color="#F97316"
          />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-zinc-900">
            Local Hauls
          </Text>
          <Text className="text-xs text-zinc-500">
            Version {appVersion}
            {buildNumber ? ` (${buildNumber})` : ''}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/**
 * Build / runtime / OTA-update metadata. updateId changes every time
 * an OTA applies — useful for confirming a tester is on the latest.
 */
function DebugInfoCard() {
  const { runtimeVersion, channel, updateId, isEmbedded, createdAt } =
    useAppVersion();
  return (
    <Card className="p-5">
      <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
        Build details
      </Text>
      <Row label="Runtime version" value={runtimeVersion} />
      <Row label="Channel" value={channel} />
      <Row
        label="Update"
        value={
          isEmbedded
            ? 'embedded (no OTA applied)'
            : (updateId ?? 'embedded').slice(0, 8)
        }
      />
      <Row
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
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      className="flex-row items-center justify-between py-1"
      style={{ gap: 12 }}
    >
      <Text className="text-xs text-zinc-500">{label}</Text>
      <Text
        className="text-xs font-mono text-zinc-700"
        selectable
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
