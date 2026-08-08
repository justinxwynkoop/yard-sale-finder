import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Circle, Marker } from 'react-native-maps';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { useSaleEvent } from '../../hooks/useSaleEvents';
import { useUserLocation } from '../../hooks/useUserLocation';
import { haversineMeters } from '../../utils/distance';
import { supabase } from '../../lib/supabase';
import { shareEvent } from '../../lib/share';
import { promptSignIn } from '../../lib/guestGate';
import { toast } from '../../lib/toast';
import SaleCard from '../../components/SaleCard';

const BRAND = '#1F4D3A';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

const REMINDER_KEY = (eventId: string) => `trove:event-reminder:${eventId}`;

function prettyRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  };
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export default function EventDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { eventId, slug } = route.params ?? {};
  const { user } = useAuth();
  const userLocation = useUserLocation();
  const { event, sales, loading, refetch } = useSaleEvent({ eventId, slug });
  const [saved, setSaved] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Saved state
  useEffect(() => {
    if (!user || !event) { setSaved(false); return; }
    supabase.from('event_saves').select('event_id').eq('user_id', user.id)
      .eq('event_id', event.id).maybeSingle()
      .then(({ data }) => setSaved(!!data));
  }, [user, event?.id]);

  const isOrganizer = !!user && !!event && event.organizer_id === user.id;

  const sortedSales = [...sales].sort((a, b) => {
    if (!userLocation) return 0;
    return (
      haversineMeters(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude) -
      haversineMeters(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude)
    );
  });

  const toggleSave = async () => {
    if (!event) return;
    if (!user) { promptSignIn('save this neighborhood sale and get a reminder'); return; }
    if (saved) {
      await supabase.from('event_saves').delete()
        .eq('user_id', user.id).eq('event_id', event.id);
      const notifId = await AsyncStorage.getItem(REMINDER_KEY(event.id));
      if (notifId) {
        await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => {});
        await AsyncStorage.removeItem(REMINDER_KEY(event.id));
      }
      setSaved(false);
      return;
    }
    await supabase.from('event_saves').insert({ user_id: user.id, event_id: event.id });
    setSaved(true);
    // Local reminder, 9 AM on the first day (spec "Reminders").
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      const [y, m, d] = event.start_date.split('-').map(Number);
      const when = new Date(y, m - 1, d, 9, 0, 0);
      if (when > new Date()) {
        const notifId = await Notifications.scheduleNotificationAsync({
          content: {
            title: event.title,
            body: `Starts today -- ${sales.length || 'the'} sales in the neighborhood. Happy hunting!`,
          },
          trigger: when as any,
        });
        await AsyncStorage.setItem(REMINDER_KEY(event.id), notifId);
      }
    }
    toast.success('Saved -- we will remind you the morning it starts');
  };

  const removeSale = (saleId: string, title: string) => {
    Alert.alert('Remove from event?', `"${title}" stays live -- it just leaves this neighborhood sale.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('remove_sale_from_event', { p_sale_id: saleId });
          if (error) { toast.error('Could not remove'); return; }
          toast.success('Removed');
          refetch();
        },
      },
    ]);
  };

  const deleteEvent = () => {
    if (!event) return;
    Alert.alert('Delete this neighborhood sale?',
      'Member sales stay live and keep their own pages -- only the event and its map circle go away.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('sale_events').delete().eq('id', event.id);
            if (error) { toast.error('Could not delete'); return; }
            toast.success('Event deleted');
            navigation.goBack();
          },
        },
      ]);
  };

  if (loading && !event) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BONE }}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BONE }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="home-outline" size={36} color={INK_MUTED} />
          <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '700', color: INK }}>
            This neighborhood sale is gone
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, color: INK_MUTED, textAlign: 'center' }}>
            The organizer may have removed it.
          </Text>
          <Pressable onPress={() => navigation.goBack()} style={{ marginTop: 16 }}
            accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={{ color: BRAND, fontWeight: '700' }}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}
            accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={INK} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => shareEvent(event)} hitSlop={8}
            accessibilityRole="button" accessibilityLabel="Share event">
            <Ionicons name="share-outline" size={22} color={INK} />
          </Pressable>
          {isOrganizer && (
            <Pressable
              onPress={() =>
                Alert.alert(event.title, undefined, [
                  { text: 'Edit', onPress: () => navigation.navigate('PostFlow' as any, { screen: 'CreateEvent', params: { eventId: event.id } } as any) },
                  { text: 'Delete event', style: 'destructive', onPress: deleteEvent },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
              hitSlop={8} accessibilityRole="button" accessibilityLabel="Organizer options">
              <Ionicons name="ellipsis-horizontal" size={22} color={INK} />
            </Pressable>
          )}
        </View>

        {/* Title block */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: '#E8EFE9', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="home" size={22} color={BRAND} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 21, fontWeight: '800', color: INK, letterSpacing: -0.4 }}>
                {event.title}
              </Text>
              <Text style={{ fontSize: 13, color: INK_MUTED, marginTop: 1 }}>
                {prettyRange(event.start_date, event.end_date)} . {sales.length}{' '}
                {sales.length === 1 ? 'sale' : 'sales'}
                {event.organizer?.display_name ? ` . hosted by ${event.organizer.display_name}` : ''}
              </Text>
            </View>
          </View>
          {event.description ? (
            <Text style={{ marginTop: 10, fontSize: 14, lineHeight: 20, color: INK }}>
              {event.description}
            </Text>
          ) : null}
        </View>

        {/* Mini-map */}
        <View style={{ height: 180, borderRadius: 16, overflow: 'hidden', marginHorizontal: 16, marginTop: 14, borderWidth: 1, borderColor: HAIRLINE }}>
          <MapView
            style={{ flex: 1 }}
            pointerEvents="none"
            initialRegion={{
              latitude: event.latitude, longitude: event.longitude,
              latitudeDelta: Math.max(0.02, (event.radius_m / 111000) * 3),
              longitudeDelta: Math.max(0.02, (event.radius_m / 111000) * 3),
            }}
          >
            <Circle center={{ latitude: event.latitude, longitude: event.longitude }}
              radius={event.radius_m}
              strokeColor="rgba(31,77,58,0.5)" fillColor="rgba(31,77,58,0.10)" />
            {sales.map((s) => (
              <Marker key={s.id}
                coordinate={{ latitude: s.latitude, longitude: s.longitude }}
                anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND, borderWidth: 1.5, borderColor: '#fff' }} />
              </Marker>
            ))}
          </MapView>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 }}>
          <Pressable onPress={toggleSave}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
              paddingVertical: 12, borderRadius: 12,
              backgroundColor: saved ? '#E8EFE9' : BRAND,
              borderWidth: saved ? 1 : 0, borderColor: BRAND,
            }}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove reminder' : 'Save and remind me'}>
            <Ionicons name={saved ? 'notifications' : 'notifications-outline'} size={15}
              color={saved ? BRAND : '#fff'} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: saved ? BRAND : '#fff' }}>
              {saved ? 'Reminder set' : 'Save & remind me'}
            </Text>
          </Pressable>
        </View>

        {/* Roster */}
        <Text style={{ marginTop: 20, marginBottom: 8, marginHorizontal: 20, fontSize: 12, fontWeight: '700', color: INK_MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Sales in this event
        </Text>
        {sortedSales.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 32 }}>
            <Text style={{ fontSize: 13.5, color: INK_MUTED, textAlign: 'center' }}>
              No sales have joined yet. Share the event link with your neighbors --
              anyone who posts a sale inside the circle gets invited automatically.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 12 }}>
            {sortedSales.map((s, i) => (
              <View key={s.id}>
                <SaleCard
                  sale={s} index={i} density="compact"
                  userLat={userLocation?.latitude} userLng={userLocation?.longitude}
                  onPress={() => navigation.navigate('SaleDetail', { saleId: s.id })}
                />
                {isOrganizer && (
                  <Pressable onPress={() => removeSale(s.id, s.title)}
                    style={{ alignSelf: 'flex-end', marginTop: -6, marginBottom: 8, marginRight: 6 }}
                    accessibilityRole="button" accessibilityLabel={`Remove ${s.title} from event`}>
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#A23E2D' }}>
                      Remove from event
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
