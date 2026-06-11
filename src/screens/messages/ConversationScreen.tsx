import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { uploadMessageImage } from '../../lib/messageImageUpload';
import { SubHeader } from '../../components/SubHeader';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
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
          // Image bubbles get a thin frame; text bubbles normal padding.
          paddingHorizontal: message.image_url ? 4 : 13,
          paddingVertical: message.image_url ? 4 : 8,
          borderRadius: 16,
          backgroundColor: isMine ? '#1F4D3A' : '#FFFFFF',
          borderBottomRightRadius: isMine && isTail ? 4 : 16,
          borderBottomLeftRadius: !isMine && isTail ? 4 : 16,
          borderWidth: isMine ? 0 : 1,
          borderColor: '#E5DECC',
        }}
      >
        {message.image_url ? (
          <Image
            source={{ uri: message.image_url }}
            style={{
              width: 220,
              height: 220,
              borderRadius: 12,
              backgroundColor: '#EFE8D6',
              marginBottom: message.body ? 6 : 0,
            }}
            contentFit="cover"
            transition={120}
          />
        ) : null}
        {message.body ? (
          <Text
            selectable
            style={{
              fontSize: 13.5,
              color: isMine ? '#FFFFFF' : '#171513',
              lineHeight: 19,
              paddingHorizontal: message.image_url ? 6 : 0,
              paddingBottom: message.image_url ? 2 : 0,
            }}
          >
            {message.body}
          </Text>
        ) : null}
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
            backgroundColor: '#EFE8D6',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Ionicons
            name={targetType === 'sale' ? 'pricetag-outline' : 'cube-outline'}
            size={20}
            color="#1F4D3A"
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
  const { conversationId, initialDraft } = route.params;
  const { user } = useAuth();
  const {
    conversation,
    otherProfile,
    target,
    messages,
    loading,
    error,
    send,
    refetch,
  } = useConversation(conversationId);

  // Seed the composer from the route (e.g. the Make-offer template).
  // useState's initializer only runs on mount, so later param changes
  // can't clobber what the user is typing.
  const [draft, setDraft] = useState(initialDraft ?? '');
  const [refreshing, setRefreshing] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Open the keyboard as soon as the thread opens — the user came here
  // to type. Focus on the navigation transitionEnd (focusing during the
  // push animation is a race iOS loses — the view isn't first-responder
  // yet), with a delayed fallback for paths that animate-less (e.g. the
  // double-dispatch from navigateToConversation).
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();
    const unsub = navigation.addListener('transitionEnd', (e: any) => {
      if (!e?.data?.closing) focusInput();
    });
    const t = setTimeout(focusInput, 500);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, [navigation]);

  // Track the keyboard so the composer can fill the home-indicator area
  // in white when it's DOWN (no weird bone gap under the input bar),
  // without leaving a gap above the keyboard when it's UP.
  useEffect(() => {
    const showEvt =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const h = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  // When we arrive here via navigateToConversation (Message-seller button,
  // push-notification tap), React Navigation leaves a sticky
  // { screen: 'Conversation' } param on the Inbox TAB route — so every
  // later tap of the Messages tab would re-open this thread. The thread
  // is already pushed by now, so wipe that param off the parent tab route.
  useEffect(() => {
    navigation.getParent()?.setParams({
      screen: undefined,
      params: undefined,
    } as never);
  }, [navigation]);
  // The header is a SubHeader (rendered below) — the SAME push-screen
  // header used on Saved / Profile, so the back button is identical
  // across the app. The native stack header is hidden for this screen
  // (headerShown: false in MessagesNavigator).
  const openOtherProfile = useCallback(() => {
    if (!otherProfile?.id) return;
    (navigation as any).navigate('PublicProfile', { userId: otherProfile.id });
  }, [navigation, otherProfile?.id]);

  // canGoBack fast path, falling back to InboxHome — cross-tab nested
  // navigation can land Conversation as the stack root with no history.
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else (navigation as any).navigate('InboxHome');
  }, [navigation]);

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

  // Pick photo(s) from the library and send each as its own image
  // message. Compress + upload happens in the helper; we send '' body
  // so the row is image-only.
  const handleAttach = async () => {
    if (attaching || !user) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Photos permission needed',
        'Allow photo access to send pictures.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.9,
    });
    if (result.canceled) return;
    setAttaching(true);
    try {
      for (let i = 0; i < result.assets.length; i++) {
        let url: string;
        try {
          url = await uploadMessageImage(
            result.assets[i].uri,
            user.id,
            conversationId,
            `${Date.now()}-${i}`,
          );
        } catch (e: any) {
          Alert.alert('Upload failed', e?.message ?? 'Could not upload photo.');
          break;
        }
        const { error: sendErr } = await send('', url);
        if (sendErr) {
          Alert.alert('Could not send', sendErr.message ?? 'Please try again.');
          break;
        }
      }
    } finally {
      setAttaching(false);
    }
  };

  if (loading && messages.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F7F2E8',
        }}
      >
        <ActivityIndicator size="large" color="#1F4D3A" />
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#F7F2E8',
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
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F7F2E8' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // No native header now (headerShown:false), so the KAV is at the
        // top of the screen — zero offset.
        keyboardVerticalOffset={0}
      >
        <SubHeader
          title={otherProfile?.display_name ?? 'Conversation'}
          onBack={handleBack}
          onTitlePress={otherProfile?.id ? openOtherProfile : undefined}
        />
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#1F4D3A"
              colors={['#1F4D3A']}
            />
          }
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
            paddingTop: 10,
            // When the keyboard is down, extend the white bar through the
            // home-indicator inset so it fills to the screen edge instead
            // of floating above a bone strip. When it's up, the keyboard
            // covers that area, so just a normal 10.
            paddingBottom: keyboardOpen ? 10 : Math.max(insets.bottom, 10),
            borderTopWidth: 1,
            borderTopColor: '#E5DECC',
          }}
        >
          {/* Attach a photo. Opens the library, uploads to message-media,
              and sends each pick as its own image message. */}
          <Pressable
            onPress={handleAttach}
            disabled={attaching}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: '#F7F2E8',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
            }}
          >
            {attaching ? (
              <ActivityIndicator size="small" color="#54504A" />
            ) : (
              <Ionicons name="image-outline" size={18} color="#54504A" />
            )}
          </Pressable>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor="#8A857C"
            multiline
            maxLength={2000}
            style={{
              flex: 1,
              marginRight: 8,
              minHeight: 34,
              maxHeight: 120,
              paddingHorizontal: 14,
              paddingTop: 8,
              paddingBottom: 8,
              backgroundColor: '#F7F2E8',
              borderRadius: 17,
              fontSize: 14,
              color: '#171513',
            }}
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: draft.trim() ? '#1F4D3A' : '#C7C1B0',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="paper-plane" size={15} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

