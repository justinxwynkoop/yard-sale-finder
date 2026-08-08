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
import {
  useNavigation,
  useFocusEffect,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';

import { useInbox } from '../../hooks/useInbox';
import { useAuth } from '../../hooks/useAuth';
import { Conversation, MessagesStackParamList } from '../../types';
import { Chip } from '../../components/ui';
import { GuestCta } from '../../components/GuestCta';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const ROSE = '#A23E2D';
const HAIRLINE = '#E5DECC';

type Filter = 'all' | 'unread' | 'buying' | 'selling';
type ViewMode = 'inbox' | 'archived';

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
  const route = useRoute<RouteProp<MessagesStackParamList, 'InboxHome'>>();
  // Person filter — set by "Message <name>" on a public profile: show only
  // conversations with that person. Cleared on blur so it never sticks to
  // the tab (same sticky-nested-param hazard as navigateToConversation).
  const filterUserId = route.params?.filterUserId;
  const filterName = route.params?.filterName;
  const { user } = useAuth();
  const {
    conversations,
    archived,
    loading,
    refreshing,
    refetch,
    silentRefetch,
    deleteConversations,
    archiveConversations,
    unarchiveConversations,
    markAsUnread,
    unreadCount,
  } = useInbox();

  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('inbox');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      silentRefetch();
    }, [silentRefetch]),
  );

  // Drop the person filter when leaving the screen — otherwise the nested
  // param sticks to the tab and re-tapping Messages shows a filtered inbox.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (filterUserId) {
          navigation.setParams({ filterUserId: undefined, filterName: undefined });
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterUserId]),
  );

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startSelect = useCallback((id: string) => {
    setSelectMode(true);
    setSelected(new Set([id]));
  }, []);

  const base = view === 'inbox' ? conversations : archived;
  const filtered = useMemo(() => {
    // Person filter applies to every view — it's "my messages with X".
    const pool = filterUserId
      ? base.filter(
          (c) =>
            (c.buyer_id === user?.id ? c.seller_id : c.buyer_id) === filterUserId,
        )
      : base;
    if (view === 'archived') return pool;
    return pool.filter((c) => {
      if (filter === 'unread') return c.has_unread;
      if (filter === 'buying') return c.buyer_id === user?.id;
      if (filter === 'selling') return c.seller_id === user?.id;
      return true;
    });
  }, [base, view, filter, user?.id, filterUserId]);

  const runBulk = (action: 'archive' | 'unarchive' | 'delete') => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action === 'delete') {
      Alert.alert(
        `Delete ${ids.length} conversation${ids.length === 1 ? '' : 's'}?`,
        'They’ll be removed from your inbox. The other person keeps their copy.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteConversations(ids);
              exitSelect();
            },
          },
        ],
      );
      return;
    }
    if (action === 'archive') archiveConversations(ids);
    else unarchiveConversations(ids);
    exitSelect();
  };

  const switchView = (next: ViewMode) => {
    exitSelect();
    setView(next);
  };

  // Guest mode: messaging is account-based — show the sign-in door instead.
  // (All hooks above already ran; they no-op without a user.)
  if (!user) {
    return (
      <GuestCta
        icon="chatbubble-ellipses-outline"
        title="Message buyers and sellers"
        description="Create a free account to chat about sales and listings — ask questions, make offers, and arrange pickups without sharing your phone number."
      />
    );
  }

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
            {selectMode
              ? `${selected.size} selected`
              : view === 'inbox'
                ? 'Inbox'
                : 'Archived'}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {selectMode ? (
              <Pressable onPress={exitSelect} hitSlop={8}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND }}>
                  Cancel
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() => switchView(view === 'inbox' ? 'archived' : 'inbox')}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={
                    view === 'inbox' ? 'View archived' : 'Back to inbox'
                  }
                >
                  <Ionicons
                    name={view === 'inbox' ? 'archive-outline' : 'chatbubbles-outline'}
                    size={22}
                    color={BRAND}
                  />
                </Pressable>
                {filtered.length > 0 ? (
                  <Pressable onPress={() => setSelectMode(true)} hitSlop={8}>
                    <Text
                      style={{ fontSize: 14, fontWeight: '600', color: BRAND }}
                    >
                      Select
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </View>

        {/* Filter chips — inbox view only, hidden while selecting */}
        {view === 'inbox' && !selectMode ? (
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
        ) : null}
      </View>

      {/* Person-filter banner — arrived via "Message <name>" on a profile. */}
      {filterUserId ? (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: '#E8EFE9',
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Ionicons name="person-outline" size={14} color={BRAND} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: BRAND }}>
            Messages with {filterName ?? 'this seller'}
          </Text>
          <Pressable
            onPress={() =>
              navigation.setParams({ filterUserId: undefined, filterName: undefined })
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Show all conversations"
          >
            <Ionicons name="close-circle" size={18} color={BRAND} />
          </Pressable>
        </View>
      ) : null}

      {loading && base.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
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
          <Ionicons
            name={view === 'archived' ? 'archive-outline' : 'chatbubbles-outline'}
            size={36}
            color={INK_MUTED}
          />
          <Text
            style={{ marginTop: 12, fontSize: 16, fontWeight: '700', color: INK }}
          >
            {filterUserId
              ? `No messages with ${filterName ?? 'them'} yet`
              : view === 'archived'
                ? 'Nothing archived'
                : filter === 'unread'
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
            {filterUserId
              ? 'Open one of their sales or listings and tap Message to start a conversation.'
              : view === 'archived'
                ? 'Threads you archive will show up here.'
                : 'When you message a seller, your conversation will show up here.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          refreshing={refreshing}
          onRefresh={refetch}
          contentContainerStyle={
            selectMode && selected.size > 0 ? { paddingBottom: 84 } : undefined
          }
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              selectMode={selectMode}
              selected={selected.has(item.id)}
              onPress={() => {
                if (selectMode) toggleSelect(item.id);
                else
                  navigation.navigate('Conversation', {
                    conversationId: item.id,
                  });
              }}
              onLongPress={() => startSelect(item.id)}
              onDelete={(id) => {
                Alert.alert(
                  'Delete conversation',
                  'It’ll be removed from your inbox. The other person keeps their copy.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => deleteConversations([id]),
                    },
                  ],
                );
              }}
              onMarkUnread={markAsUnread}
            />
          )}
        />
      )}

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: 'row',
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: HAIRLINE,
            paddingVertical: 12,
            paddingBottom: 24,
          }}
        >
          {view === 'inbox' ? (
            <ActionButton
              icon="archive-outline"
              label="Archive"
              color={BRAND}
              onPress={() => runBulk('archive')}
            />
          ) : (
            <ActionButton
              icon="arrow-undo-outline"
              label="Unarchive"
              color={BRAND}
              onPress={() => runBulk('unarchive')}
            />
          )}
          <ActionButton
            icon="trash-outline"
            label="Delete"
            color={ROSE}
            onPress={() => runBulk('delete')}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', gap: 3 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
    </Pressable>
  );
}

function ConversationRow({
  conversation,
  selectMode,
  selected,
  onPress,
  onLongPress,
  onDelete,
  onMarkUnread,
}: {
  conversation: Conversation;
  selectMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
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

  const Body = (
    <Pressable
      onPress={onPress}
      onLongPress={selectMode ? undefined : onLongPress}
      delayLongPress={250}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: selected ? '#EFE8D6' : BONE,
      }}
    >
      {selectMode ? (
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={selected ? BRAND : INK_MUTED}
          style={{ marginRight: 12 }}
        />
      ) : null}

      {/* Avatar with unread dot */}
      <View style={{ position: 'relative', marginRight: 12 }}>
        {other?.avatar_url ? (
          <Image
            source={{ uri: other.avatar_url }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFE8D6' }}
            contentFit="cover"
          />
        ) : conversation.target_image_url ? (
          <Image
            source={{ uri: conversation.target_image_url }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFE8D6' }}
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
        {unread && !selectMode && (
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
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
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
  );

  // In select mode, swipe actions are disabled (tap toggles selection).
  if (selectMode) return Body;

  const renderLeftActions = () => (
    <Pressable
      onPress={() => {
        swipeableRef.current?.close();
        onDelete(conversation.id);
      }}
      style={{
        width: 80,
        backgroundColor: ROSE,
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
      {Body}
    </Swipeable>
  );
}
