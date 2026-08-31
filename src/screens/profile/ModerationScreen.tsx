import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  useModeration,
  reasonLabel,
  ModerationReport,
  ReportStatus,
} from '../../hooks/useModeration';
import { SubHeader } from '../../components/SubHeader';
import { navigateToSale, navigateToListing } from '../../lib/navigationRef';
import { toast } from '../../lib/toast';

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
  } = useModeration(tab);
  const [refreshing, setRefreshing] = useState(false);

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
    Alert.alert(
      on ? 'Suspend this account?' : 'Lift the suspension?',
      on
        ? `${r.owner_name || 'This person'} will not be able to post sales or listings, start conversations, or send messages. Their existing content stays visible unless you hide it separately. You can undo this.`
        : `${r.owner_name || 'This person'} will be able to post and message again.`,
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
    </View>
  );
}
