import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import MapView, { Marker, Region } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { File } from 'expo-file-system';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Listing, SaleStackParamList } from '../../types';
import { compressImage } from '../../lib/imageCompression';
import { Button, IconButton, Input } from '../../components/ui';

type Nav = NativeStackNavigationProp<SaleStackParamList, 'EditListing'>;
type Route = RouteProp<SaleStackParamList, 'EditListing'>;

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;
const MAX_MEDIA = 8;
const MAP_HEIGHT = 200;

interface MediaItem {
  uri: string;
  type: 'image' | 'video';
  existingUrl?: string;
}

export default function EditListingScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { user } = useAuth();
  const mapRef = useRef<MapView>(null);

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [pickupInput, setPickupInput] = useState('');
  const [pickupDisplay, setPickupDisplay] = useState('');
  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('listings')
        .select('*, media:listing_media(*)')
        .eq('id', params.listingId)
        .single();
      if (data) {
        setListing(data);
        setTitle(data.title);
        setDescription(data.description ?? '');
        setPrice(String(data.price));
        setPickupInput(data.pickup_input);
        setPickupDisplay(data.pickup_display);
        setPinCoords({ lat: data.pickup_lat, lng: data.pickup_lng });
        setMedia((data.media ?? []).map((m: any) => ({
          uri: m.url,
          type: m.type,
          existingUrl: m.url,
        })));
        mapRef.current?.animateToRegion(
          { latitude: data.pickup_lat, longitude: data.pickup_lng, latitudeDelta: 0.05, longitudeDelta: 0.05 },
          300,
        );
      }
      setLoading(false);
    })();
  }, [params.listingId]);

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_MEDIA - media.length,
    });
    if (!result.canceled) {
      const items: MediaItem[] = result.assets.map((a) => ({ uri: a.uri, type: 'image' }));
      setMedia((prev) => [...prev, ...items].slice(0, MAX_MEDIA));
    }
  };

  const removeMedia = (index: number) => setMedia((prev) => prev.filter((_, i) => i !== index));

  const geocodePickup = async () => {
    const q = pickupInput.trim();
    if (!q) return;
    setGeocoding(true);
    try {
      const results = await Location.geocodeAsync(q);
      if (results.length > 0) {
        const { latitude, longitude } = results[0];
        setPinCoords({ lat: latitude, lng: longitude });
        setPickupDisplay(q);
        mapRef.current?.animateToRegion(
          { latitude, longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600,
        );
      } else {
        Alert.alert('Location not found', 'Try adding a city and state, or a full address.');
      }
    } catch {
      Alert.alert('Lookup failed', 'Could not find that location.');
    } finally {
      setGeocoding(false);
    }
  };

  const uploadNewMedia = async (listingId: string, newItems: MediaItem[], startIndex: number) => {
    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      const uri = await compressImage(item.uri);
      const path = `${user!.id}/${listingId}/${startIndex + i}.jpg`;
      const file = new File(uri);
      const arrayBuffer = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from('listing-media')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) {
        const enriched: any = new Error(
          `Storage upload rejected (path=${path}): ${uploadError.message}`,
        );
        enriched.code =
          (uploadError as any).statusCode ?? (uploadError as any).status;
        throw enriched;
      }
      const { data: { publicUrl } } = supabase.storage.from('listing-media').getPublicUrl(path);
      const { error: insertError } = await supabase.from('listing_media').insert({
        listing_id: listingId, url: publicUrl, type: 'image', order: startIndex + i,
      });
      if (insertError) {
        const enriched: any = new Error(
          `listing_media insert rejected: ${insertError.message}`,
        );
        enriched.code = insertError.code;
        enriched.details = insertError.details;
        enriched.hint = insertError.hint;
        throw enriched;
      }
    }
  };

  const validate = (): string | null => {
    if (media.length === 0) return 'Please add at least one photo.';
    if (!title.trim()) return 'Please add a title.';
    const p = parseFloat(price);
    if (!price.trim() || isNaN(p) || p < 0) return 'Please enter a valid price.';
    if (!pinCoords || !pickupDisplay) return 'Please set a pickup location.';
    return null;
  };

  const submit = async () => {
    if (!user || !listing) return;
    const err = validate();
    if (err) { Alert.alert('Almost there', err); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('listings')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          price: parseFloat(price),
          pickup_input: pickupInput.trim(),
          pickup_display: pickupDisplay,
          pickup_lat: pinCoords!.lat,
          pickup_lng: pinCoords!.lng,
        })
        .eq('id', listing.id);
      if (error) throw error;

      // Remove any media that was removed by the user
      const keptUrls = new Set(media.filter((m) => m.existingUrl).map((m) => m.existingUrl));
      const removedMedia = (listing.media ?? []).filter((m) => !keptUrls.has(m.url));
      for (const m of removedMedia) {
        await supabase.from('listing_media').delete().eq('id', m.id);
      }

      // Upload new media
      const newItems = media.filter((m) => !m.existingUrl);
      const existingCount = media.filter((m) => m.existingUrl).length;
      if (newItems.length > 0) await uploadNewMedia(listing.id, newItems, existingCount);

      Alert.alert('Listing updated!', '', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </SafeAreaView>
    );
  }

  const canSubmit = !validate() && !submitting;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Photos */}
          <View className="bg-white mt-3 px-4 py-4" style={{ gap: 12 }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Text className="text-sm font-bold text-zinc-700">Photos</Text>
                <Text className="text-sm font-bold text-red-500">*</Text>
              </View>
              {media.length === 0 && (
                <Text className="text-xs text-red-400">At least 1 required</Text>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row" style={{ gap: 10 }}>
                {media.map((item, i) => (
                  <View key={i} style={styles.thumb}>
                    <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    <Pressable onPress={() => removeMedia(i)} style={styles.removeBtn}>
                      <Ionicons name="close-circle" size={22} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {media.length < MAX_MEDIA && (
                  <Pressable onPress={pickFromLibrary} style={[styles.thumb, styles.addBtn]}>
                    <Ionicons name="image-outline" size={24} color="#71717A" />
                    <Text className="mt-1 text-xs text-zinc-500">Add</Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </View>

          {/* Details */}
          <View className="bg-white mt-3 px-4 py-4" style={{ gap: 14 }}>
            <Text className="text-sm font-bold text-zinc-700">Details</Text>
            <Input
              label="Title"
              value={title}
              onChangeText={(t) => setTitle(t.slice(0, MAX_TITLE))}
              autoCapitalize="sentences"
            />
            <Input
              label="Description"
              value={description}
              onChangeText={(t) => setDescription(t.slice(0, MAX_DESCRIPTION))}
              multiline
              numberOfLines={3}
              autoCapitalize="sentences"
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
            <Input
              label="Price"
              value={price}
              onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              leftIcon={<Text className="text-base text-zinc-500">$</Text>}
            />
          </View>

          {/* Pickup Location */}
          <View className="bg-white mt-3 px-4 py-4" style={{ gap: 12 }}>
            <Text className="text-sm font-bold text-zinc-700">Pickup location</Text>
            <View className="flex-row items-end" style={{ gap: 8 }}>
              <View className="flex-1">
                <Input
                  value={pickupInput}
                  onChangeText={setPickupInput}
                  autoCapitalize="words"
                  returnKeyType="search"
                  onSubmitEditing={geocodePickup}
                />
              </View>
              <Pressable
                onPress={geocodePickup}
                disabled={geocoding || !pickupInput.trim()}
                className="rounded-xl bg-zinc-900 px-4 py-3 active:bg-zinc-700"
                style={{ opacity: (!pickupInput.trim() || geocoding) ? 0.4 : 1 }}
              >
                {geocoding
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="search" size={18} color="#fff" />}
              </Pressable>
            </View>
            <View className="overflow-hidden rounded-2xl border border-zinc-100" style={{ height: MAP_HEIGHT }}>
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={pinCoords
                  ? { latitude: pinCoords.lat, longitude: pinCoords.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
                  : { latitude: 39.8283, longitude: -98.5795, latitudeDelta: 40, longitudeDelta: 40 }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
              >
                {pinCoords && (
                  <Marker coordinate={{ latitude: pinCoords.lat, longitude: pinCoords.lng }} pinColor="#F97316" />
                )}
              </MapView>
            </View>
            {pickupDisplay ? (
              <View className="flex-row items-center" style={{ gap: 6 }}>
                <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                <Text className="text-sm text-zinc-600">{pickupDisplay}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-zinc-100 bg-white px-4 pb-8 pt-3">
        <Button size="lg" disabled={!canSubmit} onPress={submit} loading={submitting}>
          Save changes
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 90, height: 90, borderRadius: 12, overflow: 'hidden' },
  addBtn: { backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  removeBtn: { position: 'absolute', top: 4, right: 4 },
});
