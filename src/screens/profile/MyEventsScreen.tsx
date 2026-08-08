import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { SubHeader } from '../../components/SubHeader';
import { useAuth } from '../../hooks/useAuth';
import { useMyEvents } from '../../hooks/useSaleEvents';
import { supabase } from '../../lib/supabase';
import { navigationRef, navigateToEvent } from '../../lib/navigationRef';
import { localTodayIso } from '../../lib/eventMatch';
import { prettyRange } from '../../utils/format';
import { toast } from '../../lib/toast';
import { SaleEvent } from '../../types';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';

type Segment = 'upcoming' | 'past';

/**
 * "Your neighborhood sales" — the organizer's manage surface. Mirrors
 * MyListingsScreen: segments, compact rows, pill actions. Crucially this
 * includes PAST events, which vanish from the public map when they end —
 * without this screen the only path back to one was its share link.
 */
export default function MyEventsScreen() {
  const { user } = useAuth();
  const { events, loading, refetch } = useMyEvents(user?.id);
  const [segment, setSegment] = React.useState<Segment>('upcoming');

  // Fresh counts every visit (same lesson as My Listings: mount-only
  // fetching reads as stale data).
  useFocusEffect(
    React.useCallback(() => {
      refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const today = localTodayIso();
  const filtered = useMemo(
    () =>
      events.filter((e) =>
        segment === 'upcoming' ? e.end_date >= today : e.end_date < today,
      ),
    [events, segment, today],
  );
  const upcomingCount = events.filter((e) => e.end_date >= today).length;
  const pastCount = events.length - upcomingCount;

  const openCreate = () => {
    navigationRef.navigate('PostFlow' as any, { screen: 'CreateEvent' } as any);
  };

  const openEdit = (event: SaleEvent) => {
    navigationRef.navigate('PostFlow' as any, {
      screen: 'CreateEvent',
      params: { eventId: event.id },
    } as any);
  };

  const confirmDelete = (event: SaleEvent) => {
    Alert.alert(
      'Delete this neighborhood sale?',
      `“${event.title}” and its map circle go away. Member sales stay live and keep their own pages.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('sale_events')
              .delete()
              .eq('id', event.id);
            if (error) {
              toast.error("Couldn't delete", error.message);
              return;
            }
            toast.success('Event deleted');
            refetch();
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader
        title="Your neighborhood sales"
        right={
          <Pressable
            onPress={openCreate}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingVertical: 7,
              paddingHorizontal: 12,
              backgroundColor: BRAND,
              borderRadius: 99,
            }}
            accessibilityRole="button"
            accessibilityLabel="Host a neighborhood sale"
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
              New
            </Text>
          </Pressable>
        }
      />

      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: HAIRLINE,
          padding: 4,
          flexDirection: 'row',
          marginHorizontal: 16,
          marginTop: 12,
        }}
      >
        <SegmentButton
          label={`Upcoming · ${upcomingCount}`}
          active={segment === 'upcoming'}
          onPress={() => setSegment('upcoming')}
        />
        <SegmentButton
          label={`Past · ${pastCount}`}
          active={segment === 'past'}
          onPress={() => setSegment('past')}
        />
      </View>

      {loading && events.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <EventManageRow
              event={item}
              past={item.end_date < today}
              onView={() => navigateToEvent({ eventId: item.id })}
              onEdit={() => openEdit(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 }}>
              <Text style={{ color: INK_MUTED, textAlign: 'center' }}>
                {segment === 'upcoming'
                  ? 'No upcoming neighborhood sales. Tap “New” to rally your street.'
                  : 'No past neighborhood sales yet.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function EventManageRow({
  event,
  past,
  onView,
  onEdit,
  onDelete,
}: {
  event: SaleEvent;
  past: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable
      onPress={onView}
      accessibilityRole="button"
      accessibilityLabel={`View ${event.title}`}
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        marginBottom: 10,
        flexDirection: 'row',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: 84,
          height: 84,
          backgroundColor: past ? '#EFEAE0' : BRAND_SOFT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="home" size={26} color={past ? INK_MUTED : BRAND} />
      </View>
      <View style={{ flex: 1, padding: 10, paddingLeft: 12 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14,
            fontWeight: '700',
            color: past ? INK_MUTED : INK,
          }}
        >
          {event.title}
        </Text>
        <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 3 }}>
          {prettyRange(event.start_date, event.end_date)} · {event.sale_count ?? 0}{' '}
          {(event.sale_count ?? 0) === 1 ? 'sale' : 'sales'}
          {past ? ' · ended' : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <PillButton label="Edit" onPress={onEdit} />
          <PillButton label="Delete" onPress={onDelete} danger />
        </View>
      </View>
    </Pressable>
  );
}

function PillButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      style={{
        paddingVertical: 5,
        paddingHorizontal: 11,
        borderWidth: 1,
        borderColor: danger ? '#F0D9D3' : HAIRLINE,
        borderRadius: 99,
        backgroundColor: '#fff',
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: danger ? ROSE : INK }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 8,
        borderRadius: 9,
        backgroundColor: active ? BRAND : 'transparent',
        alignItems: 'center',
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: '700',
          color: active ? '#fff' : INK,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
