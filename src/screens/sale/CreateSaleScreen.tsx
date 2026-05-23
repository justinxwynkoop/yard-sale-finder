import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Alert,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import MapView, { Marker, MapPressEvent, Region } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { File } from 'expo-file-system';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ItemCategory, SaleStackParamList } from '../../types';
import { captureBus } from '../../lib/captureBus';
import { compressImage } from '../../lib/imageCompression';
import {
  Button,
  Chip,
  DateRangePresets,
  DateTimeField,
  IconButton,
  Input,
} from '../../components/ui';

const CATEGORIES: ItemCategory[] = [
  'furniture',
  'clothing',
  'electronics',
  'toys',
  'tools',
  'books',
  'kitchen',
  'sports',
  'antiques',
  'other',
];

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;
const MAX_PRICING = 200;
const MAX_MEDIA = 10;
const MAP_HEIGHT = 240;

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

interface MediaItem {
  uri: string;
  type: 'image' | 'video';
}

type Nav = NativeStackNavigationProp<SaleStackParamList, 'CreateSale'>;

export default function CreateSaleScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const mapRef = useRef<MapView>(null);

  const [submitting, setSubmitting] = useState(false);

  // Photos
  const [media, setMedia] = useState<MediaItem[]>([]);

  // Where
  const [pinCoords, setPinCoords] = useState<[number, number] | null>(null);
  const [address, setAddress] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);

  // When
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // What
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<ItemCategory[]>(
    [],
  );
  const [pricingNotes, setPricingNotes] = useState('');

  // -- Photo handlers --
  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_MEDIA - media.length,
    });
    if (!result.canceled) {
      const items: MediaItem[] = result.assets.map((a) => ({
        uri: a.uri,
        type: a.type === 'video' ? 'video' : 'image',
      }));
      setMedia((prev) => [...prev, ...items].slice(0, MAX_MEDIA));
    }
  };

  const takePhoto = () => {
    // The system camera picker only takes one shot per launch. Use our
    // custom CaptureSaleScreen so you can rack up multiple photos in
    // one session and hand them all back here.
    captureBus.setListener((uris) => {
      if (uris.length === 0) return;
      const items: MediaItem[] = uris.map((uri) => ({ uri, type: 'image' }));
      setMedia((prev) => [...prev, ...items].slice(0, MAX_MEDIA));
    });
    navigation.navigate('Capture', { max: MAX_MEDIA - media.length });
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  // -- Location handlers --
  const locateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Location permission is required to use your current location.',
      );
      return;
    }
    setGeocoding(true);
    try {
      const loc = await Location.getCurrentPositionAsync({});
      const coords: [number, number] = [
        loc.coords.longitude,
        loc.coords.latitude,
      ];
      setPinCoords(coords);
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        600,
      );

      const [result] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (result) {
        const parts = [
          result.streetNumber,
          result.street,
          result.city,
          result.region,
        ].filter(Boolean);
        const formatted = parts.join(', ');
        setAddress(formatted);
        setAddressInput(formatted);
      }
    } finally {
      setGeocoding(false);
    }
  };

  const geocodeAddress = async () => {
    if (!addressInput.trim()) return;
    setGeocoding(true);
    try {
      const results = await Location.geocodeAsync(addressInput);
      if (results.length > 0) {
        const { latitude, longitude } = results[0];
        const coords: [number, number] = [longitude, latitude];
        setPinCoords(coords);
        setAddress(addressInput);
        mapRef.current?.animateToRegion(
          {
            latitude,
            longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          600,
        );
      } else {
        Alert.alert(
          'Address not found',
          'Try a different address, or tap on the map to drop a pin manually.',
        );
      }
    } catch {
      Alert.alert('Geocoding failed', 'Could not look up that address.');
    } finally {
      setGeocoding(false);
    }
  };

  const onMapPress = async (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPinCoords([longitude, latitude]);
    // Best-effort reverse geocode
    try {
      const [result] = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      if (result) {
        const parts = [
          result.streetNumber,
          result.street,
          result.city,
          result.region,
        ].filter(Boolean);
        const formatted = parts.join(', ');
        if (formatted) {
          setAddress(formatted);
          setAddressInput(formatted);
        }
      }
    } catch {
      /* ignore */
    }
  };

  // -- Categories --
  const toggleCategory = (cat: ItemCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  // -- Submit --
  const uploadMedia = async (saleId: string): Promise<void> => {
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      // Compress images before upload — saves bandwidth, storage, and
      // upload time. Videos are passed through as-is.
      const uri =
        item.type === 'image' ? await compressImage(item.uri) : item.uri;
      const ext = item.type === 'video' ? 'mp4' : 'jpg';
      const path = `${user!.id}/${saleId}/${i}.${ext}`;
      const contentType = item.type === 'video' ? 'video/mp4' : 'image/jpeg';

      // React Native's `fetch(uri).blob()` returns a 0-byte blob — files
      // upload but are empty. Read the file as an ArrayBuffer using
      // expo-file-system's new File API and upload that instead.
      const file = new File(uri);
      const arrayBuffer = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('sale-media')
        .upload(path, arrayBuffer, {
          contentType,
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('sale-media').getPublicUrl(path);

      const { error: insertError } = await supabase.from('sale_media').insert({
        sale_id: saleId,
        url: publicUrl,
        type: item.type,
        order: i,
      });
      if (insertError) throw insertError;
    }
  };

  const validate = (): string | null => {
    if (!pinCoords || !address) return 'Please set a location.';
    if (!title.trim()) return 'Please give your sale a title.';
    if (!startDate || !endDate) return 'Please pick a start and end date.';
    if (!startTime || !endTime) return 'Please pick a start and end time.';
    if (endDate < startDate) return 'End date must be after start date.';
    return null;
  };

  const submit = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'You need to be signed in to post a sale.');
      return;
    }
    const err = validate();
    if (err) {
      Alert.alert('Almost there', err);
      return;
    }
    setSubmitting(true);
    try {
      // Force a token refresh so an expired/stale JWT can't lead to a
      // silent auth.uid() = NULL on the server -- which manifests as
      // a generic "new row violates row-level security policy" error
      // with no other clue. getSession() alone returns the in-memory
      // session even when the access token has already expired; only
      // refreshSession() actually proves the token is still good.
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

      const { data: sale, error } = await supabase
        .from('sales')
        .insert({
          user_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          address,
          latitude: pinCoords![1],
          longitude: pinCoords![0],
          start_date: startDate,
          end_date: endDate,
          start_time: startTime,
          end_time: endTime,
          categories: selectedCategories,
          pricing_notes: pricingNotes.trim() || null,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;
      if (media.length > 0) await uploadMedia(sale.id);

      const focusLat = pinCoords![1];
      const focusLng = pinCoords![0];

      Alert.alert('Sale is live!', 'Your sale is now visible on the map.', [
        {
          text: 'View on map',
          onPress: () => {
            navigation.goBack();
            // The SaleStack's parent is the bottom-tab navigator, which is
            // the one that owns the 'Map' tab. Jump to it with nested
            // params so MapHome animates to the new sale's coords.
            setTimeout(() => {
              const tabNav: any = navigation.getParent();
              tabNav?.navigate('Map', {
                screen: 'MapHome',
                params: { focusLat, focusLng },
              });
            }, 50);
          },
        },
        { text: 'Done', style: 'cancel', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      // Surface full PostgREST error context (code + table) so RLS
      // rejections aren't a mystery -- the bare e.message often
      // strips the table name.
      const parts = [
        e?.message,
        e?.code ? `Code: ${e.code}` : null,
        e?.details ? `Details: ${e.details}` : null,
        e?.hint ? `Hint: ${e.hint}` : null,
      ].filter(Boolean);
      console.error('Create sale failed:', e);
      Alert.alert('Could not post sale', parts.join('\n') || 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  // -- Render --
  const validationError = validate();
  const canSubmit = !validationError && !submitting;

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
        <Text className="text-base font-bold text-zinc-900">Post a sale</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* PHOTOS SECTION */}
          <Section title="Photos" subtitle="A great cover photo helps your sale stand out.">
            {media.length === 0 ? (
              <View className="flex-row" style={{ gap: 10 }}>
                <ActionTile
                  icon="camera-outline"
                  label="Take photo"
                  onPress={takePhoto}
                />
                <ActionTile
                  icon="images-outline"
                  label="From library"
                  onPress={pickFromLibrary}
                />
              </View>
            ) : (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10 }}
                >
                  {media.map((item, i) => (
                    <View
                      key={`${item.uri}-${i}`}
                      className="relative overflow-hidden rounded-2xl"
                      style={{ width: 120, height: 120 }}
                    >
                      <Image
                        source={{ uri: item.uri }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                      {i === 0 && (
                        <View className="absolute bottom-1.5 left-1.5 rounded-full bg-brand px-2 py-0.5">
                          <Text className="text-2xs font-bold text-white">
                            COVER
                          </Text>
                        </View>
                      )}
                      <Pressable
                        onPress={() => removeMedia(i)}
                        className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-black/60"
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                  {media.length < MAX_MEDIA && (
                    <Pressable
                      onPress={pickFromLibrary}
                      className="items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 active:bg-zinc-100"
                      style={{ width: 120, height: 120 }}
                    >
                      <Ionicons name="add" size={28} color="#A1A1AA" />
                      <Text className="mt-1 text-2xs font-medium text-zinc-500">
                        Add more
                      </Text>
                    </Pressable>
                  )}
                </ScrollView>
                <Text className="mt-2 text-xs text-zinc-500">
                  {media.length}/{MAX_MEDIA} · tap × to remove · first photo is the cover
                </Text>
              </>
            )}
          </Section>

          {/* WHERE SECTION */}
          <Section
            title="Where will it be?"
            subtitle="Type an address or tap the map to drop a pin."
          >
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <View className="flex-1">
                <Input
                  placeholder="Enter an address"
                  value={addressInput}
                  onChangeText={setAddressInput}
                  onSubmitEditing={geocodeAddress}
                  returnKeyType="search"
                  leftIcon={
                    <Ionicons name="search" size={18} color="#71717A" />
                  }
                />
              </View>
              <IconButton
                variant="solid"
                size="md"
                onPress={locateMe}
                icon={<Ionicons name="locate" size={20} color="#18181B" />}
              />
            </View>

            <View
              className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100"
              style={{ height: MAP_HEIGHT }}
            >
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFillObject}
                initialRegion={DEFAULT_REGION}
                onPress={onMapPress}
                showsUserLocation
              >
                {pinCoords && (
                  <Marker
                    coordinate={{
                      latitude: pinCoords[1],
                      longitude: pinCoords[0],
                    }}
                    draggable
                    onDragEnd={(e) => {
                      const { latitude, longitude } = e.nativeEvent.coordinate;
                      setPinCoords([longitude, latitude]);
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: '#F97316',
                        borderWidth: 3,
                        borderColor: '#fff',
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#000',
                        shadowOpacity: 0.25,
                        shadowRadius: 4,
                        elevation: 4,
                      }}
                    >
                      <Ionicons name="pricetag" size={16} color="#fff" />
                    </View>
                  </Marker>
                )}
              </MapView>
              {!pinCoords && (
                <View
                  pointerEvents="none"
                  className="absolute inset-0 items-center justify-center"
                >
                  <View className="rounded-full bg-white/95 px-4 py-2 shadow">
                    <Text className="text-xs font-semibold text-zinc-700">
                      Tap the map to drop a pin
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {address ? (
              <View className="mt-2 flex-row items-start">
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text className="ml-1.5 flex-1 text-xs text-zinc-600">
                  {address}
                </Text>
              </View>
            ) : null}
            {geocoding ? (
              <Text className="mt-2 text-xs text-zinc-500">Looking up…</Text>
            ) : null}
          </Section>

          {/* WHEN SECTION */}
          <Section
            title="When is it happening?"
            subtitle="Pick from common options or set custom times."
          >
            <DateRangePresets
              startDate={startDate}
              endDate={endDate}
              startTime={startTime}
              endTime={endTime}
              onApply={(p) => {
                setStartDate(p.startDate);
                setEndDate(p.endDate);
                setStartTime(p.startTime);
                setEndTime(p.endTime);
              }}
            />

            <View className="mt-3 flex-row" style={{ gap: 10 }}>
              <View className="flex-1">
                <DateTimeField
                  label="Start date"
                  mode="date"
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Pick a date"
                />
              </View>
              <View className="flex-1">
                <DateTimeField
                  label="End date"
                  mode="date"
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="Pick a date"
                  min={startDate ? new Date(startDate) : undefined}
                />
              </View>
            </View>
            <View className="mt-3 flex-row" style={{ gap: 10 }}>
              <View className="flex-1">
                <DateTimeField
                  label="Start time"
                  mode="time"
                  value={startTime}
                  onChange={setStartTime}
                  placeholder="Start"
                />
              </View>
              <View className="flex-1">
                <DateTimeField
                  label="End time"
                  mode="time"
                  value={endTime}
                  onChange={setEndTime}
                  placeholder="End"
                />
              </View>
            </View>
          </Section>

          {/* ABOUT SECTION */}
          <Section
            title="About your sale"
            subtitle="A good title gets people excited to stop by."
          >
            <Input
              label="Title"
              value={title}
              onChangeText={(v) => setTitle(v.slice(0, MAX_TITLE))}
              placeholder="e.g. Moving sale — everything must go!"
              maxLength={MAX_TITLE}
            />
            <Text className="mb-2 mt-1 text-right text-xs text-zinc-400">
              {title.length}/{MAX_TITLE}
            </Text>
            <Input
              label="Description"
              value={description}
              onChangeText={(v) => setDescription(v.slice(0, MAX_DESCRIPTION))}
              placeholder="What are you selling? Any highlights?"
              multiline
              numberOfLines={4}
              inputClassName="min-h-[96px]"
              maxLength={MAX_DESCRIPTION}
            />
            <Text className="mt-1 text-right text-xs text-zinc-400">
              {description.length}/{MAX_DESCRIPTION}
            </Text>
          </Section>

          {/* CATEGORIES SECTION */}
          <Section
            title="What you're selling"
            subtitle="Pick any that apply — helps buyers filter."
          >
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {CATEGORIES.map((cat) => (
                <Chip
                  key={cat}
                  label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                  size="sm"
                  active={selectedCategories.includes(cat)}
                  onPress={() => toggleCategory(cat)}
                />
              ))}
            </View>
            {selectedCategories.length > 0 && (
              <Text className="mt-2 text-xs text-zinc-500">
                {selectedCategories.length} selected
              </Text>
            )}
          </Section>

          {/* PRICING SECTION */}
          <Section
            title="Pricing notes"
            subtitle="Optional — set expectations on price and payment."
          >
            <Input
              value={pricingNotes}
              onChangeText={(v) => setPricingNotes(v.slice(0, MAX_PRICING))}
              placeholder="e.g. Most items under $20, cash preferred, negotiable"
              multiline
              numberOfLines={2}
              inputClassName="min-h-[64px]"
              maxLength={MAX_PRICING}
            />
            <Text className="mt-1 text-right text-xs text-zinc-400">
              {pricingNotes.length}/{MAX_PRICING}
            </Text>
          </Section>
        </ScrollView>

        {/* Sticky CTA */}
        <View
          className="border-t border-zinc-100 bg-white px-4 pb-6 pt-3"
          style={{ paddingBottom: Platform.OS === 'ios' ? 28 : 16 }}
        >
          {validationError ? (
            <Text className="mb-2 text-center text-xs text-zinc-500">
              {validationError}
            </Text>
          ) : null}
          <Button
            size="lg"
            onPress={submit}
            loading={submitting}
            disabled={!canSubmit}
            leftIcon={
              !submitting && (
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
              )
            }
          >
            Post your sale
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-3 bg-white px-5 py-5">
      <Text className="text-lg font-bold text-zinc-900">{title}</Text>
      {subtitle ? (
        <Text className="mb-4 mt-0.5 text-sm text-zinc-500">{subtitle}</Text>
      ) : (
        <View className="mb-3" />
      )}
      {children}
    </View>
  );
}

function ActionTile({
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
      className="flex-1 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 py-6 active:bg-zinc-100"
    >
      <View className="mb-2 h-10 w-10 items-center justify-center rounded-full bg-brand-50">
        <Ionicons name={icon} size={20} color="#F97316" />
      </View>
      <Text className="text-sm font-semibold text-zinc-900">{label}</Text>
    </Pressable>
  );
}
