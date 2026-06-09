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
import { toast } from '../../lib/toast';
import { useAuth } from '../../hooks/useAuth';
import { ItemCategory, SaleStackParamList } from '../../types';
import { compressImage } from '../../lib/imageCompression';
import { Button, CategoryPicker, HeaderButton, IconButton, Input } from '../../components/ui';
import { PostSection, PostProgressBar } from '../../components/PostFormShell';

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
  const [selectedCategories, setSelectedCategories] = useState<ItemCategory[]>([]);

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
      if (uploadError) {
        // Pull live server-validated session info into the error so
        // the alert tells us whether the JWT is being seen, whether
        // its sub matches user.id, what HTTP status the storage
        // service returned, etc.
        let serverUid: string | undefined;
        let serverErr: string | undefined;
        try {
          const { data, error } = await supabase.auth.getUser();
          serverUid = data.user?.id;
          serverErr = error?.message;
        } catch (e: any) {
          serverErr = e?.message ?? String(e);
        }
        const ue: any = uploadError;
        const enriched: any = new Error(
          [
            `Storage upload rejected`,
            `path=${path}`,
            `client user.id=${user!.id}`,
            `server auth.getUser().id=${serverUid ?? '<none>'}`,
            serverErr ? `getUser error=${serverErr}` : null,
            `bucket=listing-media`,
            `arrayBuffer bytes=${arrayBuffer.byteLength}`,
            `status=${ue.status ?? ue.statusCode ?? '?'}`,
            `name=${ue.name ?? '?'}`,
            `msg=${ue.message}`,
            `raw=${safeStringify(uploadError)}`,
          ]
            .filter(Boolean)
            .join('\n'),
        );
        enriched.code = ue.statusCode ?? ue.status;
        throw enriched;
      }

      const { data: { publicUrl } } = supabase.storage.from('listing-media').getPublicUrl(path);

      const { error: insertError } = await supabase.from('listing_media').insert({
        listing_id: listingId,
        url: publicUrl,
        type: 'image',
        order: i,
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

  // Compact JSON.stringify that won't throw on circular refs and
  // trims long payloads so the alert is still readable on a phone.
  const safeStringify = (obj: unknown) => {
    try {
      const s = JSON.stringify(obj);
      return s.length > 400 ? s.slice(0, 400) + '…' : s;
    } catch {
      return String(obj);
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
      // Force a token refresh so an expired/stale JWT can't lead to a
      // silent auth.uid() = NULL on the server, which manifests as a
      // generic "new row violates row-level security policy" error.
      const { data: refreshed, error: refreshError } =
        await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) {
        Alert.alert(
          'Session expired',
          'Please sign out and back in, then try again.',
        );
        setSubmitting(false);
        return;
      }

      const { data: listing, error } = await supabase
        .from('listings')
        .insert({
          user_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          price: parseFloat(price),
          categories: selectedCategories,
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

      // goBack() instead of navigate('MySalesHome'): this screen lives in
      // BOTH the Listings and Profile stacks, and navigate() to a route
      // not present in the current stack PUSHED it, leaving CreateListing
      // lingering underneath (it resurfaced when tapping the Profile tab).
      // goBack() reliably pops it from whichever stack hosted it.
      toast.success('Listing posted');
      navigation.goBack();
    } catch (e: any) {
      const parts = [
        e?.message,
        e?.code ? `Code: ${e.code}` : null,
        e?.details ? `Details: ${e.details}` : null,
        e?.hint ? `Hint: ${e.hint}` : null,
      ].filter(Boolean);
      console.error('Create listing failed:', e);
      Alert.alert(
        'Could not post listing',
        parts.join('\n') || 'Unknown error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const validationError = validate();
  const canSubmit = !validationError && !submitting;

  const steps = [
    { label: 'Photos', done: media.length > 0 },
    {
      label: 'Details',
      done: !!title.trim() && !!price.trim() && !isNaN(parseFloat(price)),
    },
    { label: 'Category', done: selectedCategories.length > 0 },
    { label: 'Pickup', done: !!(pinCoords && pickupDisplay) },
  ];
  const firstIncomplete = steps.findIndex((s) => !s.done);
  const activeStepIdx = firstIncomplete === -1 ? steps.length - 1 : firstIncomplete;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bone">
      {/* Header */}
      <View
        style={{
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#E5DECC',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <HeaderButton
            onPress={() => navigation.goBack()}
            icon="close"
            variant="tile"
            accessibilityLabel="Cancel"
          />
          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 16,
              fontWeight: '700',
              color: '#171513',
            }}
          >
            New item
          </Text>
          <Text
            style={{
              paddingHorizontal: 6,
              fontSize: 13,
              fontWeight: '600',
              color: '#8A857C',
            }}
          >
            Draft
          </Text>
        </View>
        <PostProgressBar
          steps={steps.length}
          activeIdx={activeStepIdx}
          dones={steps.map((s) => s.done)}
        />
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
          <PostSection
            step={1}
            done={steps[0].done}
            active={activeStepIdx === 0}
            title="Photos"
            subtitle="At least one photo is required. The first one is the cover."
          >
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
          </PostSection>

          {/* Title + Description + Price */}
          <PostSection
            step={2}
            done={steps[1].done}
            active={activeStepIdx === 1}
            title="Details"
            subtitle="A clear title and price help your item sell."
          >
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
          </PostSection>

          {/* Category */}
          <PostSection
            step={3}
            done={steps[2].done}
            active={activeStepIdx === 2}
            title="Category"
            subtitle="Help buyers find your item."
          >
            <CategoryPicker selected={selectedCategories} onChange={setSelectedCategories} />
          </PostSection>

          {/* Pickup Location */}
          <PostSection
            step={4}
            done={steps[3].done}
            active={activeStepIdx === 3}
            title="Pickup location"
            subtitle="A pin will mark where buyers should meet you."
          >
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
              <Ionicons name="locate-outline" size={16} color="#1F4D3A" />
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
                    pinColor="#1F4D3A"
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
                <Ionicons name="checkmark-circle" size={16} color="#1F4D3A" />
                <Text className="text-sm text-zinc-600">{pickupDisplay}</Text>
              </View>
            ) : null}
          </PostSection>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Post CTA */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#E5DECC',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Platform.OS === 'ios' ? 28 : 16,
        }}
      >
        {validationError ? (
          <Text
            style={{
              marginBottom: 8,
              textAlign: 'center',
              fontSize: 11,
              color: '#8A857C',
            }}
          >
            {validationError}
          </Text>
        ) : null}
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Post listing"
          style={{
            backgroundColor: canSubmit ? '#1F4D3A' : '#C7C1B0',
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 14,
              fontWeight: '700',
              marginRight: 8,
            }}
          >
            {submitting ? 'Posting…' : 'Post listing'}
          </Text>
          {!submitting && (
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          )}
        </Pressable>
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
