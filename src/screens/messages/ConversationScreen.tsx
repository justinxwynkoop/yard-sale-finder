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
import { useHeaderHeight } from '@react-navigation/elements';
import { useConversation } from '../../hooks/useConversation';
import { useAuth } from '../../hooks/useAuth';
import { formatSaleDate, formatSaleTime } from '../../utils/format';
import { MessagesStackParamList, Message } from '../../types';

type Route = RouteProp<MessagesStackParamList, 'Conversation'>;

/**
 * iMessage-style bubble. No inline avatars; sender is conveyed by
 * left/right alignment + brand-orange vs. white bubbles. The "tail"
 * (the bottom-corner kink that points toward the sender) is only
 * rendered on the LAST bubble in a consecutive same-sender run, so
 * a burst of three rapid messages reads as a single visual unit.
 */
function MessageBubble({
  message,
  isMine,
  isTail,
  isGrouped,
}: {
  message: Message;
  isMine: boolean;
  isTail: boolean;
  isGrouped: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: isMine ? 'flex-end' : 'flex-start',
        marginTop: isGrouped ? 2 : 8,
      }}
    >
      <View
        style={{
          maxWidth: '78%',
          paddingHorizontal: 13,
          paddingVertical: 8,
          borderRadius: 20,
          backgroundColor: isMine ? '#2D5F3E' : '#FFFFFF',
          borderBottomRightRadius: isMine && isTail ? 6 : 20,
          borderBottomLeftRadius: !isMine && isTail ? 6 : 20,
          borderWidth: isMine ? 0 : 1,
          borderColor: '#F4F4F5',
        }}
      >
        <Text
          selectable
          style={{
            fontSize: 15.5,
            color: isMine ? '#FFFFFF' : '#18181B',
            lineHeight: 20,
          }}
        >
          {message.body}
        </Text>
      </View>
    </View>
  );
}

/**
 * Context card at the top of every conversation. Shows the underlying
 * sale or listing the conversation is about: cover photo, title, and
 * the most-relevant secondary line (price for listings, dates for
 * sales). Tappable to jump to the full detail screen.
 */
function ContextCard({
  target,
  targetType,
  onPress,
}: {
  target: ReturnType<typeof useConversation>['target'];
  targetType: 'sale' | 'listing';
  onPress: () => void;
}) {
  const title = target?.title ?? '(no longer available)';
  let metaLine = '';
  if (target?.kind === 'listing') {
    metaLine =
      target.status === 'sold'
        ? `Sold · $${target.price.toLocaleString()}`
        : `$${target.price.toLocaleString()}`;
  } else if (target?.kind === 'sale') {
    metaLine = `${formatSaleDate(target.start_date, target.end_date)} · ${formatSaleTime(
      target.start_time,
      target.end_time,
    )}`;
  }

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#F4F4F5' }}
      style={{
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#F4F4F5',
      }}
    >
      {target?.image_url ? (
        <Image
          source={{ uri: target.image_url }}
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            backgroundColor: '#F4F4F5',
            marginRight: 12,
          }}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            backgroundColor: '#FFEDD5',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Ionicons
            name={targetType === 'sale' ? 'pricetag-outline' : 'cube-outline'}
            size={20}
            color="#2D5F3E"
          />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: '#A1A1AA',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {targetType === 'sale' ? 'Yard sale' : 'Listing'}
        </Text>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '600',
            color: '#18181B',
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {metaLine ? (
          <Text
            style={{
              fontSize: 13,
              color: '#71717A',
              marginTop: 1,
            }}
            numberOfLines={1}
          >
            {metaLine}
          </Text>
        ) : null}
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color="#A1A1AA"
        style={{ marginLeft: 8 }}
      />
    </Pressable>
  );
}

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
    target,
    messages,
    loading,
    error,
    send,
  } = useConversation(conversationId);

  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);
  // Exact pixel height of React Navigation's header, including the
  // safe-area top inset. Pass to KeyboardAvoidingView as the vertical
  // offset so the avoidance math is correct -- a hardcoded guess
  // (we had 90 before) left the input visible but covered the last
  // few message bubbles behind the keyboard.
  const headerHeight = useHeaderHeight();

  // Title bar shows the other participant's name. The tab bar is
  // hidden by the Tab.Navigator's screenOptions (see
  // src/navigation/index.tsx) when the focused stack route is
  // 'Conversation' -- doing it here via setOptions caused a visible
  // tab-bar bounce on unmount because the height/padding from our
  // default style get dropped to React Navigation's smaller default
  // before snapping back.
  useLayoutEffect(() => {
    navigation.setOptions({
      title: otherProfile?.display_name ?? 'Conversation',
    });
  }, [navigation, otherProfile]);

  // Reverse for inverted FlatList: newest at index 0. We also tag
  // each entry with grouping flags -- iMessage only shows the
  // "tail" (rounded corner pointing toward the sender) on the LAST
  // bubble in a run, and tightens vertical spacing between same-
  // sender bubbles.
  const renderItems = React.useMemo(() => {
    // Walk forward to figure out "is this the last in its run"
    // (i.e. the next message is from a different sender, or this
    // is the newest message), then reverse for the inverted list.
    return messages
      .map((m, i) => {
        const nextSameSender =
          messages[i + 1] && messages[i + 1].sender_id === m.sender_id;
        const prevSameSender =
          messages[i - 1] && messages[i - 1].sender_id === m.sender_id;
        return {
          message: m,
          // The tail bubble is the *last* in a consecutive same-sender
          // run -- the one closest in time to the next reply.
          isTail: !nextSameSender,
          // Tighter vertical spacing when grouping.
          isGrouped: prevSameSender,
        };
      })
      .reverse();
  }, [messages]);

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
        <ActivityIndicator size="large" color="#2D5F3E" />
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        {/* Rich context card: shows the item being discussed with
            its photo + title + price-or-dates. Tappable to jump to
            the full sale / listing detail screen. Sits above the
            messages so both parties always know what they're
            negotiating on. */}
        {conversation ? (
          <ContextCard
            target={target}
            targetType={conversation.target_type}
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
          />
        ) : null}

        <FlatList
          inverted
          data={renderItems}
          keyExtractor={(item) => item.message.id}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 4,
            paddingBottom: 12,
          }}
          renderItem={({ item }) => (
            <MessageBubble
              message={item.message}
              isMine={item.message.sender_id === user?.id}
              isTail={item.isTail}
              isGrouped={item.isGrouped}
            />
          )}
          ListEmptyComponent={
            <View
              style={{
                paddingVertical: 40,
                alignItems: 'center',
              }}
            >
              <Ionicons name="chatbubble-outline" size={28} color="#A1A1AA" />
              <Text style={{ marginTop: 6, fontSize: 13, color: '#A1A1AA' }}>
                Say hi
              </Text>
            </View>
          }
        />

        {/* Plain horizontal row. No `gap`, no function-style, no
            absolute positioning, no fancy iMessage tricks -- just
            a flex:1 input with a real sibling send pill. After
            three rounds of "the button is missing" with cleverer
            layouts, the cleverness was the problem. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 12,
            paddingVertical: 8,
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
              marginRight: 8,
              minHeight: 40,
              maxHeight: 120,
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: 10,
              backgroundColor: '#F4F4F5',
              borderRadius: 20,
              fontSize: 15.5,
              color: '#18181B',
            }}
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={{
              minWidth: 64,
              height: 40,
              paddingHorizontal: 16,
              borderRadius: 20,
              backgroundColor: draft.trim() ? '#2D5F3E' : '#D4D4D8',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
              Send
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

