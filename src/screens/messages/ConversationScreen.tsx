import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import { getSignedMessageImage } from '../../lib/signedMessageImage';
import { isOfferMessage } from '../../lib/offers';
import { track } from '../../lib/analytics';
import { SubHeader } from '../../components/SubHeader';
import { OfferBubble } from '../../components/OfferBubble';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useConversation } from '../../hooks/useConversation';
import { useAuth } from '../../hooks/useAuth';
import { formatSaleDate, formatSaleTime } from '../../utils/format';
import { MessagesStackParamList, Message } from '../../types';

type Route = RouteProp<MessagesStackParamList, 'Conversation'>;

/**
 * Grouping (the bubble "tail" + tightened spacing) only ever applies between
 * two consecutive TEXT rows from the same sender. An offer or system row
 * must break any run it touches -- comparing by sender_id alone would let a
 * centered system notice inherit a neighbor's bubble tail, which is
 * meaningless once the row isn't rendered as a bubble at all.
 */
function isTextRow(m: Message): boolean {
  return (m.kind ?? 'text') === 'text';
}

/**
 * Seed value for the offer-amount TextInput when opening the sheet as a
 * counter. Plain numeric string, no currency symbol -- mirrors
 * formatOfferAmount's integer-vs-cents split minus the "$". A missing
 * amount seeds empty rather than the string "null".
 */
function offerAmountInputValue(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '';
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

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
  // message-media is private — resolve the stored path to a short-lived
  // signed URL (only participants can mint one). Signing can fail
  // transiently (offline moment, cold session); without an error state the
  // bubble used to sit as a blank square forever, which reads as an empty
  // message — so track failure and let the user tap to retry.
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  useEffect(() => {
    let active = true;
    if (!message.image_url) {
      setImageUri(null);
      return;
    }
    setImageFailed(false);
    getSignedMessageImage(message.image_url).then((u) => {
      if (!active) return;
      setImageUri(u);
      if (!u) setImageFailed(true);
    });
    return () => {
      active = false;
    };
  }, [message.image_url, retryToken]);

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
          imageFailed ? (
            <Pressable
              onPress={() => setRetryToken((t) => t + 1)}
              accessibilityRole="button"
              accessibilityLabel="Photo unavailable. Tap to retry."
              style={{
                width: 220,
                height: 220,
                borderRadius: 12,
                backgroundColor: '#EFE8D6',
                marginBottom: message.body ? 6 : 0,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="image-outline" size={26} color="#8A857C" />
              <Text style={{ fontSize: 12, color: '#8A857C' }}>
                Photo unavailable — tap to retry
              </Text>
            </Pressable>
          ) : (
            <Image
              source={imageUri ? { uri: imageUri } : undefined}
              style={{
                width: 220,
                height: 220,
                borderRadius: 12,
                backgroundColor: '#EFE8D6',
                marginBottom: message.body ? 6 : 0,
              }}
              contentFit="cover"
              transition={120}
              // A signed URL can still 404 later (e.g. the object was
              // deleted). Surface the same retryable state instead of a
              // silent blank square.
              onError={() => setImageFailed(true)}
            />
          )
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
    metaLine = `$${target.price.toLocaleString()}`;
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
        {target?.kind === 'listing' && target.status === 'sold' ? (
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#A23E2D' }}>
            SOLD
          </Text>
        ) : target?.kind === 'listing' && target.status === 'pending' ? (
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#B8772C' }}>
            ON HOLD
          </Text>
        ) : null}
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
    participants,
    otherProfile,
    target,
    messages,
    loading,
    error,
    send,
    sendOffer,
    respondToOffer,
    refetch,
    syncMessages,
  } = useConversation(conversationId);

  // Seed the composer from the route (e.g. the Make-offer template).
  // useState's initializer only runs on mount, so later param changes
  // can't clobber what the user is typing.
  const [draft, setDraft] = useState(initialDraft ?? '');
  const [refreshing, setRefreshing] = useState(false);
  const [attaching, setAttaching] = useState(false);
  // Make-an-offer amount sheet. Also serves a seller's counter -- send_offer
  // on the server infers "counter" from who is calling, so onCounter just
  // opens this same sheet again.
  const [offerSheetOpen, setOfferSheetOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [sendingOffer, setSendingOffer] = useState(false);
  const [respondingToOffer, setRespondingToOffer] = useState(false);

  // Pull-to-refresh re-pulls messages silently — the full refetch() would
  // flip `loading` and blank the thread under the user's finger.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncMessages();
    setRefreshing(false);
  }, [syncMessages]);
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

  // Decide back purely from THIS (Messages) stack's own history, never
  // navigation.canGoBack(): canGoBack() walks UP to the Tab navigator, which
  // (backBehavior defaults to 'firstRoute') reports it can "go back" to the
  // Map tab even when Conversation is the lone route of the Messages stack —
  // a state navigateToConversation produces on a push-notification tap.
  // Trusting canGoBack() there pops to the MAP instead of the inbox. So: pop
  // only if a screen sits beneath us in this stack; otherwise go straight to
  // the inbox list (resolves within the Inbox tab, never bubbling to the tabs).
  const handleBack = useCallback(() => {
    const state = navigation.getState?.();
    const hasHistoryInThisStack = !!state && state.index > 0;
    if (hasHistoryInThisStack) navigation.goBack();
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
    // Grouping requires BOTH neighbors to be text rows -- an offer or
    // system row never groups with anything.
    return messages
      .map((m, i) => {
        const next = messages[i + 1];
        const prev = messages[i - 1];
        const nextSameSender =
          isTextRow(m) && !!next && isTextRow(next) && next.sender_id === m.sender_id;
        const prevSameSender =
          isTextRow(m) && !!prev && isTextRow(prev) && prev.sender_id === m.sender_id;
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

  const closeOfferSheet = () => {
    setOfferSheetOpen(false);
    setOfferAmount('');
  };

  // A counter is a new offer, but the seller shouldn't have to remember the
  // other side's number from behind a dimmed backdrop -- seed the same
  // amount input the fresh "make an offer" entry point uses. Every close
  // path routes through closeOfferSheet (above), which always clears
  // offerAmount, so the fresh-offer button never inherits a stale value.
  const openCounterSheet = (amount: number | null | undefined) => {
    setOfferAmount(offerAmountInputValue(amount));
    setOfferSheetOpen(true);
  };

  const handleSendOffer = async () => {
    const amount = Number(offerAmount.trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Enter an amount', 'Offers must be a positive dollar amount.');
      return;
    }
    setSendingOffer(true);
    const { error: offerErr } = await sendOffer(amount);
    setSendingOffer(false);
    if (offerErr) {
      // The RPC's messages are the useful part (e.g. "you already have a
      // pending offer", "listing is no longer available") -- surface them
      // verbatim, same idiom as handleSend above.
      Alert.alert('Could not send offer', offerErr.message ?? 'Please try again.');
      return;
    }
    closeOfferSheet();
    track('offer_sent', { conversationId, amount });
  };

  const handleRespond = async (
    offerId: string,
    action: 'accept' | 'decline',
  ) => {
    // Guard against a rapid double-tap firing two respond_to_offer RPCs --
    // the server is safe (row lock + "no longer pending" on the loser) but
    // a second call surfaces as a spurious error alert. Same idiom as
    // sendingOffer above.
    if (respondingToOffer) return;
    setRespondingToOffer(true);
    const { error: respondErr } = await respondToOffer(offerId, action);
    setRespondingToOffer(false);
    if (respondErr) {
      Alert.alert(
        'Could not update offer',
        respondErr.message ?? 'Please try again.',
      );
      return;
    }
    track(action === 'accept' ? 'offer_accepted' : 'offer_declined', {
      conversationId,
      offerId,
    });
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
      <View style={{ flex: 1, backgroundColor: '#F7F2E8' }}>
        <SubHeader
          title={otherProfile?.display_name ?? 'Conversation'}
          onBack={handleBack}
        />
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <ActivityIndicator size="large" color="#1F4D3A" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F7F2E8' }}>
        <SubHeader
          title={otherProfile?.display_name ?? 'Conversation'}
          onBack={handleBack}
        />
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
          <Pressable
            onPress={refetch}
            accessibilityRole="button"
            accessibilityLabel="Retry loading conversation"
            style={{
              marginTop: 8,
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: 999,
              backgroundColor: '#1F4D3A',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>
              Retry
            </Text>
          </Pressable>
        </View>
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
          right={
            otherProfile?.id ? (
              <Pressable
                onPress={openOtherProfile}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`View ${otherProfile.display_name ?? 'profile'}`}
                style={{ marginRight: 6 }}
              >
                {otherProfile.avatar_url ? (
                  <Image
                    source={{ uri: otherProfile.avatar_url }}
                    style={{ width: 32, height: 32, borderRadius: 16 }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#E1ECDF',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="person" size={18} color="#1F4D3A" />
                  </View>
                )}
              </Pressable>
            ) : undefined
          }
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
                // Conversation lives only in the Messages stack, which has no
                // SaleDetail screen — route through the Map tab (same nested
                // form the listing branch below uses) so it always resolves.
                navigation.navigate('Map', {
                  screen: 'SaleDetail',
                  params: { saleId: conversation.target_id },
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
          renderItem={({ item }) => {
            if (isOfferMessage(item.message)) {
              return (
                <OfferBubble
                  message={item.message}
                  viewerId={user?.id}
                  participants={participants}
                  onAccept={() => handleRespond(item.message.id, 'accept')}
                  onDecline={() => handleRespond(item.message.id, 'decline')}
                  onCounter={() => openCounterSheet(item.message.offer_amount)}
                />
              );
            }
            if (item.message.kind === 'system') {
              // isMine (sender_id) is meaningless for a system notice -- it
              // would render as a right-aligned green "me" bubble for one
              // party and a left-aligned white one for the other. Centered,
              // muted, non-bubble text instead.
              return (
                <Text
                  style={{
                    alignSelf: 'center',
                    maxWidth: '80%',
                    textAlign: 'center',
                    color: '#8A857C',
                    fontSize: 12.5,
                    marginVertical: 8,
                  }}
                >
                  {item.message.body}
                </Text>
              );
            }
            return (
              <MessageBubble
                message={item.message}
                isMine={item.message.sender_id === user?.id}
                isTail={item.isTail}
                isGrouped={item.isGrouped}
              />
            );
          }}
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
          {/* Make an offer -- listing conversations only, and never for the
              listing's own owner (they counter from the bubble, not here).
              A fourth sibling in this row, same as the Pressables around it
              -- see the comment above this row. */}
          {conversation?.target_type === 'listing' &&
          !!user?.id &&
          conversation.seller_id !== user.id ? (
            <Pressable
              onPress={() => setOfferSheetOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Make an offer"
              style={{ paddingHorizontal: 10, justifyContent: 'center' }}
            >
              <Ionicons name="pricetag-outline" size={22} color="#1F4D3A" />
            </Pressable>
          ) : null}
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

        {/* Make-an-offer amount sheet. Doubles as the counter-offer sheet --
            send_offer infers "counter" server-side from who is calling, so
            OfferBubble's onCounter just opens this same sheet again. */}
        <Modal
          visible={offerSheetOpen}
          transparent
          animationType="slide"
          onRequestClose={closeOfferSheet}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable
              onPress={closeOfferSheet}
              style={{ flex: 1, backgroundColor: 'rgba(20,18,15,0.42)' }}
            />
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                paddingHorizontal: 18,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 12) + 20,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 4,
                  borderRadius: 99,
                  backgroundColor: '#E5DECC',
                  alignSelf: 'center',
                  marginBottom: 14,
                }}
              />
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#171513' }}>
                Make an offer
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: '#8A857C',
                  marginTop: 2,
                  marginBottom: 14,
                }}
                numberOfLines={1}
              >
                {target?.kind === 'listing' ? target.title : 'this item'}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#F7F2E8',
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 22, fontWeight: '700', color: '#171513' }}>
                  $
                </Text>
                <TextInput
                  value={offerAmount}
                  onChangeText={setOfferAmount}
                  placeholder="0"
                  placeholderTextColor="#8A857C"
                  keyboardType="decimal-pad"
                  autoFocus
                  style={{
                    flex: 1,
                    fontSize: 22,
                    fontWeight: '700',
                    color: '#171513',
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                  }}
                />
              </View>
              <Pressable
                onPress={handleSendOffer}
                disabled={sendingOffer}
                accessibilityRole="button"
                accessibilityLabel="Send offer"
                style={{
                  backgroundColor: '#1F4D3A',
                  borderRadius: 18,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: sendingOffer ? 0.6 : 1,
                }}
              >
                {sendingOffer ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
                    Send offer
                  </Text>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

