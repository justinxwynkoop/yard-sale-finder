import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { SubHeader } from '../../components/SubHeader';
import { Avatar } from '../../components/ui';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

/**
 * v3 redesign — replaces the older BlockedUsersScreen. Push from
 * Profile → Blocked users. Short explainer + a single rounded card
 * listing every block with an Unblock pill action.
 */
export default function BlockedScreen() {
  const { blocks, unblock, loading } = useBlockedUsers();

  const handleUnblock = (id: string, name?: string | null) => {
    Alert.alert(
      'Unblock user?',
      `${name || 'This user'} will be visible in the app again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            const { error } = await unblock(id);
            if (error) Alert.alert('Could not unblock', error.message);
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader title="Blocked users" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text
          style={{
            fontSize: 12.5,
            color: INK_SOFT,
            lineHeight: 19,
            marginBottom: 16,
          }}
        >
          Blocked people can&rsquo;t message you or see your exact sale
          address. They won&rsquo;t be told they&rsquo;re blocked.
        </Text>

        {loading && blocks.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color={BRAND} />
          </View>
        ) : blocks.length === 0 ? (
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: HAIRLINE,
              padding: 18,
              alignItems: 'center',
            }}
          >
            <Ionicons name="shield-checkmark-outline" size={28} color={BRAND} />
            <Text
              style={{
                marginTop: 8,
                fontSize: 13,
                color: INK_MUTED,
                fontWeight: '600',
              }}
            >
              No one&rsquo;s blocked
            </Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: HAIRLINE,
              overflow: 'hidden',
            }}
          >
            {blocks.map((b, i) => {
              const blockedAt = b.created_at
                ? formatBlockedAt(b.created_at)
                : 'Blocked';
              const name = b.blocked?.display_name ?? 'Someone';
              return (
                <View
                  key={b.blocked_id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 14,
                    gap: 12,
                    borderBottomWidth: i < blocks.length - 1 ? 1 : 0,
                    borderBottomColor: HAIRLINE,
                  }}
                >
                  <Avatar
                    uri={b.blocked?.avatar_url ?? undefined}
                    name={name}
                    px={40}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13.5,
                        fontWeight: '600',
                        color: INK,
                      }}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    <Text
                      style={{ fontSize: 11, color: INK_MUTED, marginTop: 1 }}
                    >
                      {blockedAt}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleUnblock(b.blocked_id, name)}
                    style={({ pressed }) => ({
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: HAIRLINE,
                      borderRadius: 99,
                      backgroundColor: pressed ? '#F7F2E8' : '#fff',
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={`Unblock ${name}`}
                  >
                    <Text
                      style={{ fontSize: 12, fontWeight: '700', color: BRAND }}
                    >
                      Unblock
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function formatBlockedAt(iso: string): string {
  const d = new Date(iso);
  return `Blocked ${d.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  })}`;
}
