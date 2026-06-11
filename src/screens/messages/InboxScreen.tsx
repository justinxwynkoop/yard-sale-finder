import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';

import { useInbox } from '../../hooks/useInbox';
import { useAuth } from '../../hooks/useAuth';
import { Conversation } from '../../types';
import { Chip } from '../../components/ui';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';

type Filter = 'all' | 'unread' | 'buying' | 'selling';

function formatMessageDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
}

export default function InboxScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const {
    conversations,
    loading,
    refreshing,
    refetch,
    silentRefetch,
    deleteConversation,
    markAsUnread,
    unreadCount,
  } = useInbox();

  const [filter, setFilter] = useState<Filter>('all');

  useFocusEffect(
    useCallback(() => {
      silentRefetch();
    }, [silentRefetch]),
  );

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (filter === 'unread') return c.has_unread;
      if (filter === 'buying') return c.buyer_id === user?.id;
      if (filter === 'selling') return c.seller_id === user?.id;
      return true;
    });
  }, [conversations, filter, user?.id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
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
            Inbox
          </Text>
          {unreadCount > 0 ? (
            <Pressable
              onPress={() => {
                /* future: mark-all-read */
              }}
              hitSlop={8}
            >
              <Text
                style={{ fontSize: 12, fontWeight: '600', color: BRAND }}
              >
                Mark read
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Chip row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 12, marginHorizontal: -16, paddingHorizontal: 16 }}
        >
          <Chip
            label="All"
            tone={filter === 'all' ? 'active' : 'default'}
            onPress={() => setFilter('all')}
          />
          <View style={{ width: 6 }} />
          <Chip
            label={`Unread · ${unreadCount}`}
            tone={filter === 'unread' ? 'active' : 'default'}
            onPress={() => setFilter('unread')}
          />
          <View style={{ width: 6 }} />
          <Chip
            label="Buying"
            tone={filter === 'buying' ? 'active' : 'default'}
            onPress={() => setFilter('buying')}
          />
          <View style={{ width: 6 }} />
          <Chip
            label="Selling"
            tone={filter === 'selling' ? 'active' : 'default'}
            onPress={() => setFilter('selling')}
          />
        </ScrollView>
      </View>

      {loading && conversations.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      ) : filtered.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
          }}
        >
          <Ionicons name="chatbubbles-outline" size={36} color={INK_MUTED} />
          <Text
            style={{
              marginTop: 12,
              fontSize: 16,
              fontWeight: '700',
              color: INK,
            }}
          >
            {filter === 'unread'
              ? 'You’re all caught up'
              : 'No messages yet'}
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 13,
              color: INK_MUTED,
              textAlign: 'center',
            }}
          >
            When you message a seller, your conversation will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          refreshing={refreshing}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              onPress={() =>
                navigation.navigate('Conversation', { conversationId: item.id })
              }
              onDelete={(id) => {
                Alert.alert(
                  'Delete conversation',
                  'This will permanently delete this conversation and all messages.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => deleteConversation(id),
                    },
                  ],
                );
              }}
              onMarkUnread={markAsUnread}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ConversationRow({
  conversation,
  onPress,
  onDelete,
  onMarkUnread,
}: {
  conversation: Conversation;
  onPress: () => void;
  onDelete: (id: string) => void;
  onMarkUnread: (id: string) => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const other = conversation.other_profile;
  const preview = conversation.last_message_preview ?? 'Tap to view';
  const targetTitle = conversation.target_title ?? '(deleted)';
  const formattedDate = conversation.last_message_at
    ? formatMessageDate(conversation.last_message_at)
    : '';
  const unread = !!conversation.has_unread;

  const renderLeftActions = () => (
    <Pressable
      onPress={() => {
        swipeableRef.current?.close();
        onDelete(conversation.id);
      }}
      style={{
        width: 80,
        backgroundColor: '#A23E2D',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Ionicons name="trash-outline" size={22} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 11, marginTop: 4, fontWeight: '600' }}>
        Delete
      </Text>
    </Pressable>
  );

  const renderRightActions = () => (
    <Pressable
      onPress={() => {
        swipeableRef.current?.close();
        onMarkUnread(conversation.id);
      }}
      style={{
        width: 110,
        backgroundColor: '#3B82F6',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Ionicons name="mail-unread-outline" size={22} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 11, marginTop: 4, fontWeight: '600' }}>
        Mark Unread
      </Text>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      renderLeftActions={renderLeftActions}
      renderRightActions={unread ? undefined : renderRightActions}
    >
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: 'row',
          backgroundColor: BONE,
        }}
      >
        {/* Avatar with unread dot */}
        <View style={{ position: 'relative', marginRight: 12 }}>
          {other?.avatar_url ? (
            <Image
              source={{ uri: other.avatar_url }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#EFE8D6',
              }}
              contentFit="cover"
            />
          ) : conversation.target_image_url ? (
            <Image
              source={{ uri: conversation.target_image_url }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#EFE8D6',
              }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#EFE8D6',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="person-outline" size={20} color={BRAND} />
            </View>
          )}
          {unread && (
            <View
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 11,
                height: 11,
                borderRadius: 99,
                backgroundColor: BRAND,
                borderWidth: 2,
                borderColor: BONE,
              }}
            />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 14,
                fontWeight: unread ? '700' : '600',
                color: INK,
              }}
            >
              {other?.display_name ?? 'Unknown'}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: INK_MUTED,
                fontVariant: ['tabular-nums'],
                marginLeft: 6,
              }}
            >
              {formattedDate}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              color: BRAND,
              letterSpacing: 0.4,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            RE: {targetTitle.toUpperCase()}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 3,
              fontSize: 12.5,
              color: unread ? INK : INK_SOFT,
              fontWeight: unread ? '500' : '400',
            }}
          >
            {preview}
          </Text>
        </View>
      </Pressable>
    </Swipeable>
  );
}
