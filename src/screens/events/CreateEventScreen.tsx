import React, { useEffect, useState, useRef } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Circle, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { useUserLocation } from '../../hooks/useUserLocation';
import { supabase } from '../../lib/supabase';
import { shareEvent } from '../../lib/share';
import { navigateToEvent } from '../../lib/navigationRef';
import { toast } from '../../lib/toast';
import { Button, DateTimeField, Input } from '../../components/ui';
import { SaleEvent } from '../../types';

const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

// Preset radii (OTA constraint: no slider dependency in the binary).
const RADII = [
  { label: '¼ mi', m: 400 },
  { label: '½ mi', m: 800 },
  { label: '¾ mi', m: 1200 },
  { label: '1 mi', m: 1600 },
];

const DEFAULT_CENTER = { latitude: 40.1934, longitude: -85.3864 }; // Muncie fallback

export default function CreateEventScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const editingId: string | undefined = route.params?.eventId;
  const { user } = useAuth();
  const userLocation = useUserLocation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radiusM, setRadiusM] = useState(800);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Edit mode: hydrate the form once.
  useEffect(() => {
    if (!editingId) return;
    supabase.from('sale_events').select('*').eq('id', editingId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setTitle(data.title);
        setDescription(data.description ?? '');
        setStartDate(data.start_date);
        setEndDate(data.end_date);
        setCenter({ latitude: data.latitude, longitude: data.longitude });
        setRadiusM(data.radius_m);
        mapRef.current?.animateToRegion(
          { latitude: data.latitude, longitude: data.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 },
          350,
        );
      });
  }, [editingId]);

  // Default the pin to the user's location once it resolves (create mode).
  useEffect(() => {
    if (!editingId && !center && userLocation) {
      setCenter({ latitude: userLocation.latitude, longitude: userLocation.longitude });
      mapRef.current?.animateToRegion(
        { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        350,
      );
    }
  }, [userLocation, center, editingId]);

  const mapCenter = center ?? userLocation ?? DEFAULT_CENTER;
  const valid =
    title.trim().length > 0 && startDate && endDate && endDate >= startDate && center;

  const save = async () => {
    if (!user || !valid || !center) return;
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase.from('sale_events').update({
          title: title.trim(),
          description: description.trim() || null,
          start_date: startDate,
          end_date: endDate,
          latitude: center.latitude,
          longitude: center.longitude,
          radius_m: radiusM,
        }).eq('id', editingId);
        if (error) throw error;
        toast.success('Event updated');
        navigation.goBack();
        return;
      }
      const { data, error } = await supabase.from('sale_events').insert({
        organizer_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate,
        end_date: endDate,
        latitude: center.latitude,
        longitude: center.longitude,
        radius_m: radiusM,
      }).select().single();
      if (error) throw error;
      toast.success('Neighborhood sale created');
      navigation.goBack();
      navigateToEvent({ eventId: data.id });
      // Offer the share sheet right away — the link is the recruiting tool.
      shareEvent(data as SaleEvent);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={INK} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: INK }}>
              {editingId ? 'Edit neighborhood sale' : 'Host a neighborhood sale'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={{ gap: 16 }}>
            <Input label="Name" value={title} onChangeText={setTitle}
              placeholder="Maple Grove Neighborhood Sale" autoCapitalize="words" />
            <Input label="Description (optional)" value={description} onChangeText={setDescription}
              placeholder="30+ households, rain or shine!" multiline />
            <DateTimeField label="First day" mode="date" value={startDate}
              onChange={(v) => { setStartDate(v); if (!endDate || endDate < v) setEndDate(v); }}
              min={new Date()} />
            <DateTimeField label="Last day" mode="date" value={endDate}
              onChange={setEndDate} min={new Date()} />

            <View>
              <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: '600', color: '#3F3F46' }}>
                Neighborhood area
              </Text>
              <Text style={{ marginBottom: 8, fontSize: 12.5, color: INK_MUTED }}>
                Tap the map to place the center, then pick a size. Sales posted
                inside the circle get invited to join.
              </Text>
              <View style={{ height: 260, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: HAIRLINE }}>
                <MapView
                  ref={mapRef}
                  style={{ flex: 1 }}
                  initialRegion={{ ...mapCenter, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
                  onPress={(e) => setCenter(e.nativeEvent.coordinate)}
                >
                  {center && (
                    <>
                      <Marker coordinate={center} draggable
                        onDragEnd={(e) => setCenter(e.nativeEvent.coordinate)} />
                      <Circle center={center} radius={radiusM}
                        strokeColor="rgba(31,77,58,0.5)" fillColor="rgba(31,77,58,0.10)" />
                    </>
                  )}
                </MapView>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {RADII.map((r) => (
                  <Pressable key={r.m} onPress={() => setRadiusM(r.m)}
                    accessibilityRole="button" accessibilityLabel={`Radius ${r.label}`}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                      borderWidth: 1,
                      borderColor: radiusM === r.m ? BRAND : HAIRLINE,
                      backgroundColor: radiusM === r.m ? '#E8EFE9' : '#fff',
                    }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: radiusM === r.m ? BRAND : INK }}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Button size="lg" onPress={save} loading={saving} disabled={!valid || saving}>
              {editingId ? 'Save changes' : 'Create & share'}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
