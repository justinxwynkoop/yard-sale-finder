import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { Avatar, Button, EmptyState } from '../../components/ui';

/**
 * Settings screen listing every user the current user has blocked,
 * with one-tap unblock. Required by Apple UGC guideline (1.2) — must
 * give the user a place to manage their block list.
 */
export default function BlockedUsersScreen() {
  const { blocks, unblock, loading, refetch } = useBlockedUsers();

  const handleUnblock = (blockedId: string, displayName?: string | null) => {
    Alert.alert(
      'Unblock user?',
      `${displayName || 'This user'} will be visible in the app again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            const { error } = await unblock(blockedId);
            if (error) {
              Alert.alert('Could not unblock', error.message);
            }
          },
        },
      ],
    );
  };

  if (loading && blocks.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FAFAF9',
        }}
      >
        <ActivityIndicator size="large" color="#2D5F3E" />
      </View>
    );
  }

  if (blocks.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAF9' }} edges={['bottom']}>
        <EmptyState
          icon={
            <Ionicons name="shield-checkmark-outline" size={32} color="#2D5F3E" />
          }
          title="No blocked users"
          description={
            "Anyone you block will appear here. " +
            "You can unblock them at any time."
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAF9' }} edges={['bottom']}>
      <FlatList
        data={blocks}
        keyExtractor={(b) => b.blocked_id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        refreshing={loading}
        onRefresh={refetch}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 12,
              gap: 12,
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#F4F4F5',
            }}
          >
            <Avatar
              uri={item.blocked?.avatar_url}
              name={item.blocked?.display_name}
              size="md"
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#18181B' }}>
                {item.blocked?.display_name ?? 'Unknown user'}
              </Text>
              <Text style={{ fontSize: 12, color: '#A1A1AA' }}>
                Blocked{' '}
                {new Date(item.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                handleUnblock(item.blocked_id, item.blocked?.display_name)
              }
              hitSlop={8}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: pressed ? '#FFEDD5' : '#FAFAF9',
                borderWidth: 1,
                borderColor: '#F4F4F5',
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#18181B' }}>
                Unblock
              </Text>
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
