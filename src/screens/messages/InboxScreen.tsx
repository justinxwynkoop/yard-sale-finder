import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useInbox } from '../../hooks/useInbox';
import { Avatar, EmptyState } from '../../components/ui';
import { Conversation } from '../../types';

/**
 * Messages inbox -- one row per conversation, sorted by most recent
 * activity. Each row shows: the other party's avatar + name, the
 * sale/listing thumbnail, the last message preview, and a brand-
 * colored unread dot when the user hasn't read the last incoming
 * message.
 */
export default function InboxScreen() {
  const navigation = useNavigation<any>();
  const { conversations, loading, refetch } = useInbox();

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
          />
        )}
        ItemSeparatorComponent={() => (
          <View
            style={{
              height: 1,
              marginLeft: 80,
              backgroundColor: '#F4F4F5',
            }}
          />
        )}
      />
    </SafeAreaView>
  );
}

function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: Conversation;
  onPress: () => void;
}) {
  const other = conversation.other_profile;
  const preview = conversation.last_message_preview ?? 'Tap to view';
  const targetTitle = conversation.target_title ?? '(deleted)';
  // Plain object style + explicit margins instead of `gap`. iOS RN
  // has dropped `gap` on row layouts with mixed Text+Image+icon
  // children before, collapsing them into a vertical stack -- which
  // is exactly what was happening here. Same fix we used on the
  // ConversationScreen subject row.
  return (
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
      <View style={{ marginRight: 12 }}>
        <Avatar uri={other?.avatar_url} name={other?.display_name} size="md" />
      </View>

      <View style={{ flex: 1, marginRight: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: '600',
              color: '#18181B',
              marginRight: 6,
            }}
            numberOfLines={1}
          >
            {other?.display_name ?? 'Unknown user'}
          </Text>
          {conversation.has_unread ? (
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: '#2D5F3E',
              }}
            />
          ) : null}
        </View>
        <Text
          style={{
            fontSize: 12,
            color: '#71717A',
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {targetTitle}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: conversation.has_unread ? '#18181B' : '#71717A',
            fontWeight: conversation.has_unread ? '600' : '400',
            marginTop: 3,
          }}
          numberOfLines={1}
        >
          {preview}
        </Text>
      </View>

      {conversation.target_image_url ? (
        <Image
          source={{ uri: conversation.target_image_url }}
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            backgroundColor: '#F4F4F5',
          }}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            backgroundColor: '#FFEDD5',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="image-outline" size={20} color="#2D5F3E" />
        </View>
      )}
    </Pressable>
  );
}
