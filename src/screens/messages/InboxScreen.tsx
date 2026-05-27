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
import { Avatar, EmptyState } from '../../components/ui';
import { Conversation } from '../../types';

export default function InboxScreen() {
  const navigation = useNavigation<any>();
  const { conversations, loading, refetch, deleteConversation, markAsUnread } =
    useInbox();

  // Re-fetch every time this screen comes into focus so the unread
  // badge and row dots clear immediately after opening a conversation.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

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
        refreshing={loading}
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
          paddingVertical: 10,
        }}
      >
        {/* Unread indicator dot — far left */}
        <View
          style={{
            width: 10,
            marginRight: 8,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {conversation.has_unread ? (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#EF4444',
              }}
            />
          ) : null}
        </View>

        {/* Item photo — left, larger */}
        {conversation.target_image_url ? (
          <Image
            source={{ uri: conversation.target_image_url }}
            style={{
              width: 72,
              height: 72,
              borderRadius: 10,
              backgroundColor: '#F4F4F5',
              marginRight: 12,
            }}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 10,
              backgroundColor: '#FFEDD5',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Ionicons name="image-outline" size={28} color="#2D5F3E" />
          </View>
        )}

        {/* Profile avatar + name + sale title + message preview — right */}
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 5,
            }}
          >
            <Avatar uri={other?.avatar_url} name={other?.display_name} size="sm" />
            <Text
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: '600',
                color: '#18181B',
                marginLeft: 8,
              }}
              numberOfLines={1}
            >
              {other?.display_name ?? 'Unknown user'}
            </Text>
          </View>
          <Text
            style={{ fontSize: 12, color: '#71717A', marginBottom: 2 }}
            numberOfLines={1}
          >
            {targetTitle}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: conversation.has_unread ? '#18181B' : '#71717A',
              fontWeight: conversation.has_unread ? '600' : '400',
            }}
            numberOfLines={1}
          >
            {preview}
          </Text>
        </View>
      </Pressable>
    </Swipeable>
  );
}
