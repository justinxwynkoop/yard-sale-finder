import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  useModeration,
  reasonLabel,
  ModerationReport,
  ReportStatus,
  ModerationMessage,
  ModerationConversation,
} from '../../hooks/useModeration';
import { SubHeader } from '../../components/SubHeader';
import { navigateToSale, navigateToListing } from '../../lib/navigationRef';
import { toast } from '../../lib/toast';
import { formatMessageTime } from '../../lib/messageTime';
import { getSignedMessageImage } from '../../lib/signedMessageImage';
import { Image } from 'expo-image';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const DANGER = '#A23E2D';
const WARN = '#B8772C';

const TABS: { key: ReportStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'dismissed', label: 'Dismissed' },
];

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Pill({
  label,
  tone = 'neutral',
  onPress,
}: {
  label: string;
  tone?: 'neutral' | 'danger' | 'brand';
  onPress: () => void;
}) {
  const color =
    tone === 'danger' ? DANGER : tone === 'brand' ? BRAND : INK_SOFT;
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: color,
        marginRight: 8,
        marginTop: 8,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: '700', color }}>{label}</Text>
    </Pressable>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 5,
        backgroundColor: color + '1A',
        marginRight: 6,
      }}
    >
      <Text style={{ fontSize: 10.5, fontWeight: '800', color, letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A way to LOOK at something: a text link with a chevron, never a pill.
 * Reviewing is not an action, so it must not look like one -- as a pill it sat
 * in the same row as Suspend and Dismiss, identical shape, one tap apart, and
 * only one of them is undone by a second tap. Links sit above the divider so
 * the card reads in the order the job is done: read, then act.
 */
function ReviewLink({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}
    >
      <Ionicons name={icon} size={15} color={BRAND} />
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: BRAND, marginLeft: 7 }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={15} color={BRAND} />
    </Pressable>
  );
}

/** Signs a reported account's thread image on demand. The storage policy scopes
  * moderator reads to reported accounts' conversations, so this returns null
  * for anything else rather than a broken image. */
function ModImage({ path }: { path: string }) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    getSignedMessageImage(path).then((u) => {
      if (!active) return;
      setUri(u);
      if (!u) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [path]);
  if (failed) {
    return (
      <Text style={{ fontSize: 12.5, color: INK_MUTED }}>
        📷 Photo — could not load
      </Text>
    );
  }
  if (!uri) return <ActivityIndicator color={BRAND} style={{ marginVertical: 8 }} />;
  return (
    <Image
      source={{ uri }}
      style={{ width: 200, height: 200, borderRadius: 8, marginTop: 4 }}
      contentFit="cover"
    />
  );
}

// One modal, two views. Stacking a second <Modal> on top of the first is
// unreliable on iOS, so the conversation list and a thread share one sheet and
// back() walks between them.
type Panel =
  | { kind: 'conversations'; report: ModerationReport }
  | {
      kind: 'thread';
      report: ModerationReport;
      /** Null = the reporter's thread, opened straight from the card. */
      conversation: ModerationConversation | null;
    };

/**
 * Operator-only report queue. Reached from Profile → Moderation, a row that
 * only renders when profile.is_operator is true.
 *
 * That UI gate is a courtesy: mod_list_reports returns nothing to a
 * non-operator and every action RPC raises 'not authorized', so someone who
 * reached this screen anyway would see an empty list and nothing would work.
 */
export default function ModerationScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<ReportStatus>('open');
  const {
    reports,
    loading,
    error,
    refresh,
    setHidden,
    setReportStatus,
    setSuspended,
    sendSafetyNotice,
    getReportMessages,
    listSubjectConversations,
  } = useModeration(tab);
  const [refreshing, setRefreshing] = useState(false);

  // Threads and conversation lists are fetched on demand rather than with the
  // queue: each one writes a moderation_audit row, so pre-loading would log a
  // look at every account just for scrolling the list.
  const [panel, setPanel] = useState<Panel | null>(null);
  const [thread, setThread] = useState<ModerationMessage[] | null>(null);
  const [conversations, setConversations] = useState<ModerationConversation[] | null>(
    null,
  );
  // Bumped on every open and every back, so a slow response for a view the
  // moderator already left can't pop it back open.
  const requestRef = useRef(0);

  const openThread = async (
    r: ModerationReport,
    conversation: ModerationConversation | null = null,
  ) => {
    const token = ++requestRef.current;
    setPanel({ kind: 'thread', report: r, conversation });
    setThread(null);
    const { messages, error: err } = await getReportMessages(
      r.id,
      conversation?.conversation_id,
    );
    if (token !== requestRef.current) return;
    if (err) {
      setPanel(conversation ? { kind: 'conversations', report: r } : null);
      Alert.alert("Can't show the messages", err.message);
      return;
    }
    setThread(messages);
  };

  const openConversations = async (r: ModerationReport) => {
    const token = ++requestRef.current;
    setPanel({ kind: 'conversations', report: r });
    setConversations(null);
    const { conversations: list, error: err } = await listSubjectConversations(r.id);
    if (token !== requestRef.current) return;
    if (err) {
      setPanel(null);
      Alert.alert("Can't show their conversations", err.message);
      return;
    }
    setConversations(list);
  };

  const back = () => {
    requestRef.current += 1;
    if (panel?.kind === 'thread' && panel.conversation) {
      // Came from the list: return to it. It is already loaded, so this does
      // not re-read -- or re-log -- the list.
      setPanel({ kind: 'conversations', report: panel.report });
    } else {
      setPanel(null);
    }
  };

  const run = async (
    fn: () => Promise<{ error: { message: string } | null }>,
    okMessage: string,
  ) => {
    const { error: err } = await fn();
    if (err) Alert.alert("Couldn't do that", err.message);
    else toast.success(okMessage);
  };

  const openTarget = (r: ModerationReport) => {
    if (r.target_type === 'sale') navigateToSale(r.target_id);
    else if (r.target_type === 'listing') navigateToListing(r.target_id);
    else navigation.navigate('PublicProfile', { userId: r.target_id });
  };

  const confirmSuspend = (r: ModerationReport) => {
    const on = !r.owner_suspended;
    const name = r.owner_name || 'This person';
    Alert.alert(
      on ? 'Suspend this account?' : 'Lift the suspension?',
      on
        ? `${name} will not be able to post, message, make offers, or accept or decline offers. Any pending offers to or from them expire now. Their existing content stays visible unless you hide it separately. You can lift the suspension later, but expired offers stay expired.`
        : `${name} will be able to post and message again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: on ? 'Suspend' : 'Unsuspend',
          style: on ? 'destructive' : 'default',
          onPress: () =>
            run(
              () => setSuspended(r.owner_id!, on),
              on ? 'Account suspended' : 'Suspension lifted',
            ),
        },
      ],
    );
  };

  const confirmNotice = (r: ModerationReport) => {
    Alert.alert(
      'Send safety notice?',
      `${r.reporter_name || 'The reporter'} gets the standard scam-safety message in their thread with ${r.owner_name || 'this account'}. The other person can see it too, so it reads as general guidance rather than an accusation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => run(() => sendSafetyNotice(r.id), 'Notice sent'),
        },
      ],
    );
  };

  const confirmWarn = (r: ModerationReport, c: ModerationConversation) => {
    const name = c.other_name || 'this person';
    const owner = r.owner_name || 'the reported account';
    Alert.alert(
      `Warn ${name}?`,
      `${name} gets the standard scam-safety message in their thread with ${owner}, plus a push notification. ${owner} can read it too, so it reads as general guidance rather than an accusation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            const { error: err } = await sendSafetyNotice(r.id, c.conversation_id);
            if (err) {
              Alert.alert("Couldn't send it", err.message);
              return;
            }
            toast.success(`Notice sent to ${name}`);
            // Reflected locally instead of re-reading the thread, which would
            // log a second read that nobody actually made.
            setConversations((prev) =>
              prev
                ? prev.map((x) =>
                    x.conversation_id === c.conversation_id
                      ? { ...x, notice_sent: true }
                      : x,
                  )
                : prev,
            );
            setPanel((p) =>
              p &&
              p.kind === 'thread' &&
              p.conversation?.conversation_id === c.conversation_id
                ? { ...p, conversation: { ...p.conversation, notice_sent: true } }
                : p,
            );
          },
        },
      ],
    );
  };

  const listPanel = panel?.kind === 'conversations' ? panel : null;
  const threadPanel = panel?.kind === 'thread' ? panel : null;
  const threadConv = threadPanel?.conversation ?? null;

  const panelTitle = listPanel
    ? `${listPanel.report.owner_name ? `${listPanel.report.owner_name}'s` : 'Their'} conversations`
    : threadPanel
      ? threadConv
        ? `${threadPanel.report.owner_name || 'Reported'} ↔ ${threadConv.other_name || 'Someone'}`
        : threadPanel.report.owner_name
          ? `${threadPanel.report.owner_name} — thread`
          : 'Thread'
      : '';

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader title="Moderation" />

      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 999,
                marginRight: 8,
                backgroundColor: active ? BRAND : 'transparent',
                borderWidth: 1,
                borderColor: active ? BRAND : HAIRLINE,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: active ? '#fff' : INK_SOFT,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
            tintColor={BRAND}
            colors={[BRAND]}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={BRAND} style={{ marginTop: 32 }} />
        ) : error ? (
          <Text style={{ color: DANGER, fontSize: 13 }}>{error}</Text>
        ) : reports.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <Ionicons name="shield-checkmark-outline" size={34} color={INK_MUTED} />
            <Text style={{ marginTop: 10, color: INK_SOFT, fontSize: 14 }}>
              Nothing {tab === 'open' ? 'to review' : `marked ${tab}`}.
            </Text>
          </View>
        ) : (
          reports.map((r) => (
            <View
              key={r.id}
              style={{
                backgroundColor: '#fff',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: HAIRLINE,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Tag label={r.target_type.toUpperCase()} color={BRAND} />
                {r.target_hidden ? <Tag label="HIDDEN" color={WARN} /> : null}
                {r.owner_suspended ? <Tag label="SUSPENDED" color={DANGER} /> : null}
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 11.5, color: INK_MUTED }}>
                  {relativeTime(r.created_at)}
                </Text>
              </View>

              <Pressable onPress={() => openTarget(r)}>
                <Text style={{ fontSize: 15.5, fontWeight: '700', color: INK }} numberOfLines={1}>
                  {r.target_title || '(no longer available)'}
                </Text>
              </Pressable>

              <Text style={{ fontSize: 13, color: INK_SOFT, marginTop: 3 }}>
                {reasonLabel(r.reason)}
                {r.owner_name ? ` · by ${r.owner_name}` : ''}
              </Text>
              {r.notes ? (
                <Text style={{ fontSize: 13, color: INK_SOFT, marginTop: 5, fontStyle: 'italic' }}>
                  “{r.notes}”
                </Text>
              ) : null}
              <Text style={{ fontSize: 11.5, color: INK_MUTED, marginTop: 5 }}>
                Reported by {r.reporter_name || 'someone'}
                {r.distinct_reporters > 1
                  ? ` · ${r.distinct_reporters} people reported this`
                  : ''}
              </Text>

              <View style={{ marginTop: 10 }}>
                <ReviewLink
                  icon="chatbubble-ellipses-outline"
                  label="Read the conversation"
                  onPress={() => openThread(r)}
                />
                {/* The wider look ends when a report is dismissed -- the server
                    refuses it then, so the link isn't offered. */}
                {r.owner_id && tab !== 'dismissed' ? (
                  <ReviewLink
                    icon="people-outline"
                    label={
                      r.owner_name
                        ? `Everyone ${r.owner_name} has messaged`
                        : 'Everyone they have messaged'
                    }
                    onPress={() => openConversations(r)}
                  />
                ) : null}
              </View>

              <View
                style={{ height: 1, backgroundColor: HAIRLINE, marginTop: 2 }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {/* Only content can be hidden; a profile's lever is suspension. */}
                {r.target_type !== 'profile' ? (
                  <Pill
                    label={r.target_hidden ? 'Unhide' : 'Hide'}
                    tone={r.target_hidden ? 'neutral' : 'danger'}
                    onPress={() =>
                      run(
                        () => setHidden(r.target_type, r.target_id, !r.target_hidden),
                        r.target_hidden ? 'Visible again' : 'Hidden from feeds',
                      )
                    }
                  />
                ) : null}
                <Pill label="Safety notice" onPress={() => confirmNotice(r)} />
                {r.owner_id ? (
                  <Pill
                    label={r.owner_suspended ? 'Unsuspend' : 'Suspend'}
                    tone={r.owner_suspended ? 'neutral' : 'danger'}
                    onPress={() => confirmSuspend(r)}
                  />
                ) : null}
                {tab !== 'resolved' ? (
                  <Pill
                    label="Resolve"
                    tone="brand"
                    onPress={() =>
                      run(() => setReportStatus(r.id, 'resolved'), 'Marked resolved')
                    }
                  />
                ) : null}
                {tab !== 'dismissed' ? (
                  <Pill
                    label="Dismiss"
                    onPress={() =>
                      run(() => setReportStatus(r.id, 'dismissed'), 'Dismissed')
                    }
                  />
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!panel} animationType="slide" onRequestClose={back}>
        <View style={{ flex: 1, backgroundColor: BONE }}>
          <SubHeader title={panelTitle} onBack={back} />

          {listPanel ? (
            <>
              <Text
                style={{
                  fontSize: 11.5,
                  color: INK_MUTED,
                  paddingHorizontal: 16,
                  paddingTop: 10,
                }}
              >
                Everyone {listPanel.report.owner_name || 'the reported account'} has
                messaged. Listing and opening these is recorded.
              </Text>
              {conversations === null ? (
                <ActivityIndicator color={BRAND} style={{ marginTop: 32 }} />
              ) : (
                <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                  {conversations.length === 0 ? (
                    <Text style={{ color: INK_SOFT, fontSize: 13 }}>
                      No conversations.
                    </Text>
                  ) : (
                    conversations.map((c) => (
                      <Pressable
                        key={c.conversation_id}
                        onPress={() => openThread(listPanel.report, c)}
                        style={{
                          backgroundColor: '#fff',
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: HAIRLINE,
                          padding: 14,
                          marginBottom: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text
                              style={{ flex: 1, fontSize: 15, fontWeight: '700', color: INK }}
                              numberOfLines={1}
                            >
                              {c.other_name || 'Someone'}
                            </Text>
                            <Text style={{ fontSize: 11.5, color: INK_MUTED, marginLeft: 8 }}>
                              {relativeTime(c.last_message_at)}
                            </Text>
                          </View>
                          <Text
                            style={{ fontSize: 13, color: INK_SOFT, marginTop: 3 }}
                            numberOfLines={1}
                          >
                            {c.target_title || '(no longer available)'} · {c.message_count}{' '}
                            {c.message_count === 1 ? 'message' : 'messages'}
                          </Text>
                          {c.is_reporter || c.pending_offers > 0 || c.notice_sent ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7 }}>
                              {c.is_reporter ? <Tag label="REPORTER" color={BRAND} /> : null}
                              {c.pending_offers > 0 ? (
                                <Tag
                                  label={
                                    c.pending_offers === 1
                                      ? 'PENDING OFFER'
                                      : `${c.pending_offers} PENDING OFFERS`
                                  }
                                  color={WARN}
                                />
                              ) : null}
                              {c.notice_sent ? <Tag label="WARNED" color={INK_SOFT} /> : null}
                            </View>
                          ) : null}
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={INK_MUTED}
                          style={{ marginLeft: 8 }}
                        />
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              )}
            </>
          ) : threadPanel ? (
            <>
              <Text
                style={{
                  fontSize: 11.5,
                  color: INK_MUTED,
                  paddingHorizontal: 16,
                  paddingTop: 10,
                }}
              >
                Right side is the reported account. This read is recorded.
              </Text>
              {thread === null ? (
                <ActivityIndicator color={BRAND} style={{ marginTop: 32 }} />
              ) : (
                <>
                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
                  >
                    {thread.length === 0 ? (
                      <Text style={{ color: INK_SOFT, fontSize: 13 }}>
                        No messages in this thread.
                      </Text>
                    ) : (
                      thread.map((m) =>
                        // A system notice is written by Trove, not by whoever
                        // triggered it. sender_id carries the operator only so
                        // the NOT NULL column and the audit trail have a value
                        // -- it is not authorship. The real thread renders
                        // these centred, muted and unattributed; this matches.
                        m.kind === 'system' ? (
                          <Text
                            key={m.id}
                            style={{
                              alignSelf: 'center',
                              maxWidth: '80%',
                              textAlign: 'center',
                              color: INK_MUTED,
                              fontSize: 12,
                              marginVertical: 8,
                            }}
                          >
                            {m.body}
                          </Text>
                        ) : (
                          <View
                            key={m.id}
                            style={{
                              alignSelf: m.from_reported ? 'flex-end' : 'flex-start',
                              maxWidth: '84%',
                              marginBottom: 10,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10.5,
                                color: INK_MUTED,
                                marginBottom: 2,
                                textAlign: m.from_reported ? 'right' : 'left',
                              }}
                            >
                              {m.sender_name || 'Someone'} · {formatMessageTime(m.created_at)}
                            </Text>
                            <View
                              style={{
                                backgroundColor: m.from_reported ? '#FBEDEA' : '#fff',
                                borderWidth: 1,
                                borderColor: m.from_reported ? '#E9CFC9' : HAIRLINE,
                                borderRadius: 13,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                              }}
                            >
                              {m.kind === 'offer' ? (
                                <Text style={{ fontSize: 14, fontWeight: '700', color: INK }}>
                                  Offer ${m.offer_amount} · {m.offer_status}
                                </Text>
                              ) : m.body ? (
                                <Text style={{ fontSize: 14.5, color: INK, lineHeight: 20 }}>
                                  {m.body}
                                </Text>
                              ) : null}
                              {m.image_url ? <ModImage path={m.image_url} /> : null}
                            </View>
                          </View>
                        ),
                      )
                    )}
                  </ScrollView>

                  {/* The one ACTION in this view, below the thread: read first,
                      then decide. Only for a thread opened from the list --
                      the reporter already has "Safety notice" on the card. */}
                  {threadConv ? (
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: HAIRLINE,
                        paddingHorizontal: 16,
                        paddingTop: 12,
                        paddingBottom: 28,
                        backgroundColor: BONE,
                      }}
                    >
                      {threadConv.notice_sent ? (
                        <Text style={{ fontSize: 12.5, color: INK_MUTED, textAlign: 'center' }}>
                          A safety notice was already sent to{' '}
                          {threadConv.other_name || 'this person'} here.
                        </Text>
                      ) : (
                        <Pressable
                          onPress={() => confirmWarn(threadPanel.report, threadConv)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1.5,
                            borderColor: BRAND,
                            borderRadius: 12,
                            paddingVertical: 12,
                          }}
                        >
                          <Ionicons name="shield-outline" size={16} color={BRAND} />
                          <Text
                            style={{
                              marginLeft: 8,
                              fontSize: 14,
                              fontWeight: '800',
                              color: BRAND,
                            }}
                          >
                            Send {threadConv.other_name || 'them'} a safety notice
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
