import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useConversation } from '../../hooks/useConversation';
import { useAuth } from '../../hooks/useAuth';
import { Avatar } from '../../components/ui';
import { MapStackParamList, Message } from '../../types';

type Route = RouteProp<MapStackParamList, 'Conversation'>;

/**
 * One-on-one conversation thread. Inverted FlatList so the newest
 * message is anchored to the bottom and new messages slide in
 * naturally. Optimistic send (the bubble shows up immediately, then
 * the server confirms or we roll back on RLS / rate-limit failure).
 */
export default function ConversationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { conversationId } = route.params;
  const { user } = useAuth();
  const {
    conversation,
    otherProfile,
    messages,
    loading,
    error,
    send,
  } = useConversation(conversationId);

  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Title bar shows the other participant's name. Also hide the
  // bottom tab bar so the keyboard + input live edge-to-edge instead
  // of being squeezed between the header and the tabs.
  useLayoutEffect(() => {
    navigation.setOptions({
      title: otherProfile?.display_name ?? 'Conversation',
    });
    const parent = navigation.getParent?.();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      // Restore default tabBarStyle when leaving the conversation.
      parent?.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation, otherProfile]);

  // Reverse for inverted FlatList: newest at index 0.
  const reversed = React.useMemo(() => [...messages].reverse(), [messages]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    const { error: sendErr } = await send(body);
    if (sendErr) {
      // Restore the draft and surface the message so the user knows.
      setDraft(body);
      Alert.alert(
        'Could not send',
        sendErr.message ?? 'Please try again.',
      );
    }
  };

  if (loading && messages.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FAFAF9',
        }}
      >
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#FAFAF9' }}
        edges={['bottom']}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            gap: 8,
          }}
        >
          <Ionicons name="cloud-offline-outline" size={36} color="#A1A1AA" />
          <Text style={{ fontSize: 17, fontWeight: '600', color: '#18181B' }}>
            Couldn&rsquo;t load this conversation
          </Text>
          <Text style={{ fontSize: 13, color: '#71717A', textAlign: 'center' }}>
            {error}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#FAFAF9' }}
      edges={['bottom']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Subject row: lets the user re-open the sale / listing this
            conversation is about. Tap to navigate. Uses explicit
            marginRight instead of `gap` -- a few RN versions on iOS
            have ignored gap when the parent uses flexDirection:'row'
            with mixed Text + icon children, collapsing the row into
            a column. */}
        {conversation ? (
          <Pressable
            onPress={() => {
              if (conversation.target_type === 'sale') {
                navigation.navigate('SaleDetail', {
                  saleId: conversation.target_id,
                });
              } else {
                navigation.navigate('Listings', {
                  screen: 'ListingDetail',
                  params: { listingId: conversation.target_id },
                });
              }
            }}
            android_ripple={{ color: '#F4F4F5' }}
            style={{
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              borderBottomWidth: 1,
              borderBottomColor: '#F4F4F5',
            }}
          >
            <Ionicons
              name={
                conversation.target_type === 'sale'
                  ? 'pricetag-outline'
                  : 'cube-outline'
              }
              size={16}
              color="#71717A"
              style={{ marginRight: 10 }}
            />
            <Text
              style={{ flex: 1, fontSize: 13, color: '#71717A' }}
              numberOfLines={1}
            >
              {conversation.target_title
                ? `About: ${conversation.target_title}`
                : `About this ${conversation.target_type}`}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color="#A1A1AA"
              style={{ marginLeft: 8 }}
            />
          </Pressable>
        ) : null}

        <FlatList
          inverted
          data={reversed}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMine={item.sender_id === user?.id}
              otherAvatarUri={otherProfile?.avatar_url}
              otherName={otherProfile?.display_name}
            />
          )}
          ListEmptyComponent={
            <View
              style={{
                paddingVertical: 40,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="chatbubble-outline" size={28} color="#A1A1AA" />
              <Text style={{ fontSize: 13, color: '#A1A1AA' }}>
                Say hi
              </Text>
            </View>
          }
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#F4F4F5',
          }}
        >
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor="#A1A1AA"
            multiline
            maxLength={2000}
            style={{
              flex: 1,
              maxHeight: 120,
              minHeight: 38,
              paddingHorizontal: 14,
              paddingVertical: 9,
              backgroundColor: '#F4F4F5',
              borderRadius: 18,
              fontSize: 15,
              color: '#18181B',
              marginRight: 8,
            }}
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim()}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: draft.trim() ? '#F97316' : '#E4E4E7',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  isMine,
  otherAvatarUri,
  otherName,
}: {
  message: Message;
  isMine: boolean;
  otherAvatarUri?: string | null;
  otherName?: string | null;
}) {
  const time = new Date(message.created_at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 6,
        alignItems: 'flex-end',
        justifyContent: isMine ? 'flex-end' : 'flex-start',
      }}
    >
      {!isMine ? (
        <Avatar uri={otherAvatarUri ?? undefined} name={otherName ?? undefined} size="sm" />
      ) : null}
      <View
        style={{
          maxWidth: '76%',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 18,
          backgroundColor: isMine ? '#F97316' : '#FFFFFF',
          borderBottomRightRadius: isMine ? 4 : 18,
          borderBottomLeftRadius: isMine ? 18 : 4,
          borderWidth: isMine ? 0 : 1,
          borderColor: '#F4F4F5',
        }}
      >
        <Text
          selectable
          style={{
            fontSize: 15,
            color: isMine ? '#FFFFFF' : '#18181B',
            lineHeight: 20,
          }}
        >
          {message.body}
        </Text>
        <Text
          style={{
            marginTop: 2,
            fontSize: 10,
            color: isMine ? 'rgba(255,255,255,0.75)' : '#A1A1AA',
            textAlign: 'right',
          }}
        >
          {time}
        </Text>
      </View>
    </View>
  );
}
