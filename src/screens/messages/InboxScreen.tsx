import React, { useCallback, useRef } from 'react';
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
import { Image } from 'expo-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { useInbox } from '../../hooks/useInbox';
import { EmptyState } from '../../components/ui';
import { Conversation } from '../../types';

/** Format last_message_at for the inbox row.
 *  today        → "3:42 PM"
 *  this week    → "Mon"
 *  this year    → "Jun 3"
 *  older        → "1/5/24"
 */
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
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
}

export default function InboxScreen() {
  const navigation = useNavigation<any>();
  const { conversations, loading, refreshing, refetch, silentRefetch, deleteConversation, markAsUnread } =
    useInbox();

  // Silently re-fetch when the screen comes into focus so unread dots
  // clear after opening a conversation — no spinner shown for this.
  useFocusEffect(useCallback(() => { silentRefetch(); }, [silentRefetch]));

  if (loading && conversations.length === 0) {
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

  if (conversations.length === 0) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#FAFAF9' }}
        edges={['bottom']}
      >
        <EmptyState
          icon={<Ionicons name="chatbubbles-outline" size={32} color="#2D5F3E" />}
          title="No messages yet"
          description={
            'When you message a seller about a sale or listing, your ' +
            'conversation will show up here.'
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#FAFAF9' }}
      edges={['bottom']}
    >
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        refreshing={refreshing}
        onRefresh={refetch}
        contentContainerStyle={{ paddingVertical: 4 }}
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
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, marginLeft: 16, backgroundColor: '#F4F4F5' }} />
        )}
      />
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

  const renderLeftActions = () => (
    // Revealed when the user swipes RIGHT → delete
    <Pressable
      onPress={() => {
        swipeableRef.current?.close();
        onDelete(conversation.id);
      }}
      style={{
        width: 80,
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
      <Text style={{ color: '#FFFFFF', fontSize: 11, marginTop: 4, fontWeight: '600' }}>
        Delete
      </Text>
    </Pressable>
  );

  const renderRightActions = () => (
    // Revealed when the user swipes LEFT → mark as unread
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
      <Ionicons name="mail-unread-outline" size={22} color="#FFFFFF" />
      <Text style={{ color: '#FFFFFF', fontSize: 11, marginTop: 4, fontWeight: '600' }}>
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
      renderRightActions={conversation.has_unread ? undefined : renderRightActions}
    >
      <Pressable
        onPress={onPress}
        android_ripple={{ color: '#F4F4F5' }}
        style={{
          backgroundColor: '#FFFFFF',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        {/* Circular listing photo — FB Marketplace style */}
        {conversation.target_image_url ? (
          <Image
            source={{ uri: conversation.target_image_url }}
            style={{
              width: 62,
              height: 62,
              borderRadius: 31,
              backgroundColor: '#F4F4F5',
            }}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: 31,
              backgroundColor: '#FFEDD5',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="image-outline" size={26} color="#2D5F3E" />
          </View>
        )}

        {/* Name · Item title  /  Preview · Date */}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: '#18181B',
              marginBottom: 3,
            }}
            numberOfLines={1}
          >
            {other?.display_name ?? 'Unknown'}{' · '}{targetTitle}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: conversation.has_unread ? '#18181B' : '#71717A',
              fontWeight: conversation.has_unread ? '500' : '400',
            }}
            numberOfLines={1}
          >
            {preview}{formattedDate ? ` · ${formattedDate}` : ''}
          </Text>
        </View>

        {/* Unread dot — right side */}
        {conversation.has_unread ? (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#EF4444',
              marginLeft: 10,
              flexShrink: 0,
            }}
          />
        ) : null}
      </Pressable>
    </Swipeable>
  );
}
