import React from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuth } from '../../hooks/useAuth';
import { useFollowing } from '../../hooks/useFollowing';
import { ProfileStackParamList, Profile } from '../../types';
import { Avatar } from '../../components/ui';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'Following'>;

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

function nameOf(p: Profile): string {
  return (
    p.display_name ||
    [p.first_name, p.last_name].filter(Boolean).join(' ') ||
    'Someone'
  );
}

function locationOf(p: Profile): string | null {
  if (p.city && p.state) return `${p.city}, ${p.state}`;
  return p.city ?? p.state ?? null;
}

export default function FollowingScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { following, loading, unfollow } = useFollowing(user?.id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: 10,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
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
        >
          <Ionicons name="chevron-back" size={18} color={INK} />
        </Pressable>
        <Text
          style={{
            marginLeft: 12,
            fontSize: 20,
            fontWeight: '800',
            color: INK,
            letterSpacing: -0.4,
          }}
        >
          Following
        </Text>
      </View>

      {loading && following.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 48 }}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : (
        <FlatList
          data={following}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 32,
          }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('PublicProfile', { userId: item.id })
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#fff',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: HAIRLINE,
                padding: 10,
                marginTop: 10,
              }}
              accessibilityRole="button"
              accessibilityLabel={`View ${nameOf(item)}'s profile`}
            >
              <Avatar uri={item.avatar_url} name={nameOf(item)} px={44} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 15, fontWeight: '700', color: INK }}
                >
                  {nameOf(item)}
                </Text>
                {locationOf(item) ? (
                  <Text
                    numberOfLines={1}
                    style={{ marginTop: 2, fontSize: 12, color: INK_MUTED }}
                  >
                    {locationOf(item)}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => unfollow(item.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Unfollow ${nameOf(item)}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: HAIRLINE,
                  borderRadius: 99,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                }}
              >
                <Ionicons name="checkmark" size={13} color={BRAND} />
                <Text
                  style={{
                    marginLeft: 4,
                    fontSize: 12,
                    fontWeight: '700',
                    color: BRAND,
                  }}
                >
                  Following
                </Text>
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={
            <View
              style={{
                alignItems: 'center',
                paddingHorizontal: 24,
                paddingVertical: 64,
              }}
            >
              <Ionicons name="people-outline" size={36} color={INK_MUTED} />
              <Text
                style={{
                  marginTop: 12,
                  fontSize: 16,
                  fontWeight: '700',
                  color: INK,
                }}
              >
                {"You're not following anyone yet"}
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: INK_MUTED,
                  textAlign: 'center',
                }}
              >
                Follow a seller from their profile to get notified when they
                post a new sale.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
