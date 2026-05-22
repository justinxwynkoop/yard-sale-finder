import React, { useState, useRef } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { SaleStackParamList } from '../../types';
import { compressImage } from '../../lib/imageCompression';
import { Button, IconButton, Input } from '../../components/ui';

type Nav = NativeStackNavigationProp<SaleStackParamList, 'CreateListing'>;

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;
const MAX_MEDIA = 8;
const MAP_HEIGHT = 200;

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 40,
  longitudeDelta: 40,
};

interface MediaItem {
  uri: string;
  type: 'image' | 'video';
}

export default function CreateListingScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const mapRef = useRef<MapView>(null);

  const [submitting, setSubmitting] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');

  const [pickupInput, setPickupInput] = useState('');
  const [pickupDisplay, setPickupDisplay] = useState('');
  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  // -- Photo handlers --
  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_MEDIA - media.length,
    });
    if (!result.canceled) {
      const items: MediaItem[] = result.assets.map((a) => ({ uri: a.uri, type: 'image' as const }));
      setMedia((prev) => [...prev, ...items].slice(0, MAX_MEDIA));
    }
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setMedia((prev) => [...prev, { uri: result.assets[0].uri, type: 'image' as const }].slice(0, MAX_MEDIA));
    }
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  // -- Location handlers --
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
          { latitude, longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 },
          600,
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

  const useMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Location permission is required to use your current location.');
      return;
    }
    setGeocoding(true);
    try {
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;
      setPinCoords({ lat: latitude, lng: longitude });
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        600,
      );
      const [result] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (result) {
        const parts = [result.city, result.region].filter(Boolean);
        const display = parts.join(', ');
        setPickupInput(display);
        setPickupDisplay(display);
      }
    } finally {
      setGeocoding(false);
    }
  };

  // -- Upload --
  const uploadMedia = async (listingId: string) => {
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      const uri = item.type === 'image' ? await compressImage(item.uri) : item.uri;
      const ext = 'jpg';
      const path = `${user!.id}/${listingId}/${i}.${ext}`;

      const file = new File(uri);
      const arrayBuffer = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('listing-media')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('listing-media').getPublicUrl(path);

      const { error: insertError } = await supabase.from('listing_media').insert({
        listing_id: listingId,
        url: publicUrl,
        type: 'image',
        order: i,
      });
      if (insertError) throw insertError;
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
    if (!user) return;
    const err = validate();
    if (err) { Alert.alert('Almost there', err); return; }
    setSubmitting(true);
    try {
      const { data: listing, error } = await supabase
        .from('listings')
        .insert({
          user_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          price: parseFloat(price),
          pickup_input: pickupInput.trim(),
          pickup_display: pickupDisplay,
          pickup_lat: pinCoords!.lat,
          pickup_lng: pinCoords!.lng,
          status: 'available',
        })
        .select()
        .single();

      if (error) throw error;
      if (media.length > 0) await uploadMedia(listing.id);

      Alert.alert('Listing posted!', 'Buyers in your area can now find your item.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !validate() && !submitting;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-zinc-100 bg-white px-4 py-2">
        <IconButton
          variant="ghost"
          size="md"
          onPress={() => navigation.goBack()}
          icon={<Ionicons name="close" size={24} color="#18181B" />}
        />
        <Text className="text-base font-bold text-zinc-900">Post a listing</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ gap: 10 }}>
              <View className="flex-row" style={{ gap: 10 }}>
                {media.map((item, i) => (
                  <View key={i} style={styles.thumb}>
                    <Image
                      source={{ uri: item.uri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                    <Pressable
                      onPress={() => removeMedia(i)}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="close-circle" size={22} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {media.length < MAX_MEDIA && (
                  <View className="flex-row" style={{ gap: 10 }}>
                    <Pressable
                      onPress={pickFromLibrary}
                      style={[styles.thumb, styles.addBtn]}
                    >
                      <Ionicons name="image-outline" size={24} color="#71717A" />
                      <Text className="mt-1 text-xs text-zinc-500">Library</Text>
                    </Pressable>
                    <Pressable
                      onPress={takePhoto}
                      style={[styles.thumb, styles.addBtn]}
                    >
                      <Ionicons name="camera-outline" size={24} color="#71717A" />
                      <Text className="mt-1 text-xs text-zinc-500">Camera</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>

          {/* Title + Description + Price */}
          <View className="bg-white mt-3 px-4 py-4" style={{ gap: 14 }}>
            <Text className="text-sm font-bold text-zinc-700">Details</Text>
            <Input
              label="Title"
              placeholder="What are you selling?"
              value={title}
              onChangeText={(t) => setTitle(t.slice(0, MAX_TITLE))}
              autoCapitalize="sentences"
              returnKeyType="next"
            />
            <Input
              label="Description"
              placeholder="Condition, size, brand, anything helpful..."
              value={description}
              onChangeText={(t) => setDescription(t.slice(0, MAX_DESCRIPTION))}
              multiline
              numberOfLines={3}
              autoCapitalize="sentences"
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
            <Input
              label="Price"
              placeholder="0.00"
              value={price}
              onChangeText={(t) => {
                const cleaned = t.replace(/[^0-9.]/g, '');
                setPrice(cleaned);
              }}
              keyboardType="decimal-pad"
              leftIcon={<Text className="text-base text-zinc-500">$</Text>}
              returnKeyType="done"
            />
          </View>

          {/* Pickup Location */}
          <View className="bg-white mt-3 px-4 py-4" style={{ gap: 12 }}>
            <Text className="text-sm font-bold text-zinc-700">Pickup location</Text>
            <Text className="text-xs text-zinc-500">
              Enter a city and state or a full address. A pin will mark the location for buyers.
            </Text>
            <View className="flex-row items-end" style={{ gap: 8 }}>
              <View className="flex-1">
                <Input
                  placeholder="e.g. Cleveland, OH or 123 Main St"
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
                {geocoding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="search" size={18} color="#fff" />
                )}
              </Pressable>
            </View>
            <Pressable
              onPress={useMyLocation}
              className="flex-row items-center"
              style={{ gap: 6 }}
            >
              <Ionicons name="locate-outline" size={16} color="#F97316" />
              <Text className="text-sm font-medium text-brand-600">Use my location</Text>
            </Pressable>

            {/* Map preview */}
            <View
              className="overflow-hidden rounded-2xl border border-zinc-100"
              style={{ height: MAP_HEIGHT }}
            >
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={DEFAULT_REGION}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
              >
                {pinCoords && (
                  <Marker
                    coordinate={{ latitude: pinCoords.lat, longitude: pinCoords.lng }}
                    pinColor="#F97316"
                  />
                )}
              </MapView>
              {!pinCoords && (
                <View
                  style={StyleSheet.absoluteFill}
                  className="items-center justify-center bg-zinc-50/80"
                >
                  <Ionicons name="location-outline" size={32} color="#D4D4D8" />
                  <Text className="mt-2 text-xs text-zinc-400">
                    Search for a location above
                  </Text>
                </View>
              )}
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

      {/* Sticky Post CTA */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-zinc-100 bg-white px-4 pb-8 pt-3">
        <Button
          size="lg"
          disabled={!canSubmit}
          onPress={submit}
          loading={submitting}
        >
          Post listing
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: 90,
    height: 90,
    borderRadius: 12,
    overflow: 'hidden',
  },
  addBtn: {
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
});
