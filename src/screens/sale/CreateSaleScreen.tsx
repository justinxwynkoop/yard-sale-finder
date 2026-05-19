import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Alert,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ItemCategory } from '../../types';
import { Button, Chip, IconButton, Input } from '../../components/ui';

type Step = 'location' | 'media' | 'details';

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

interface MediaItem {
  uri: string;
  type: 'image' | 'video';
}

export default function CreateSaleScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const mapRef = useRef<MapView>(null);

  const [step, setStep] = useState<Step>('location');
  const [submitting, setSubmitting] = useState(false);

  // Location step
  const [pinCoords, setPinCoords] = useState<[number, number] | null>(null);
  const [address, setAddress] = useState('');
  const [addressInput, setAddressInput] = useState('');

  // Media step
  const [media, setMedia] = useState<MediaItem[]>([]);

  // Details step
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<ItemCategory[]>(
    [],
  );
  const [pricingNotes, setPricingNotes] = useState('');

  const locateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Location permission is required to pin your sale.',
      );
      return;
    }
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
  };

  const geocodeAddress = async () => {
    if (!addressInput.trim()) return;
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
          'Try a different address or drop a pin manually.',
        );
      }
    } catch {
      Alert.alert('Geocoding failed', 'Could not look up that address.');
    }
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      const items: MediaItem[] = result.assets.map((a) => ({
        uri: a.uri,
        type: a.type === 'video' ? 'video' : 'image',
      }));
      setMedia((prev) => [...prev, ...items].slice(0, 10));
    }
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleCategory = (cat: ItemCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const uploadMedia = async (saleId: string): Promise<void> => {
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      const ext = item.uri.split('.').pop() ?? 'jpg';
      const path = `${user!.id}/${saleId}/${i}.${ext}`;

      const response = await fetch(item.uri);
      const blob = await response.blob();

      const { error } = await supabase.storage
        .from('sale-media')
        .upload(path, blob, {
          contentType: item.type === 'video' ? 'video/mp4' : 'image/jpeg',
          upsert: true,
        });
      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from('sale-media').getPublicUrl(path);

      await supabase.from('sale_media').insert({
        sale_id: saleId,
        url: publicUrl,
        type: item.type,
        order: i,
      });
    }
  };

  const submit = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'You need to be signed in to post a sale.');
      return;
    }
    if (!pinCoords || !address) {
      Alert.alert('Missing location', 'Please set your sale location.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please give your sale a title.');
      return;
    }
    if (!startDate || !endDate || !startTime || !endTime) {
      Alert.alert(
        'Missing dates',
        'Please fill in all date and time fields.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const { data: sale, error } = await supabase
        .from('sales')
        .insert({
          user_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          address,
          latitude: pinCoords[1],
          longitude: pinCoords[0],
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

      Alert.alert('Sale is live!', 'Your sale is now visible on the map.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = step === 'location' ? 0 : step === 'media' ? 1 : 2;
  const progress = ((stepIndex + 1) / 3) * 100;

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Progress */}
      <View className="px-5 pt-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Step {stepIndex + 1} of 3
          </Text>
          <Text className="text-sm font-semibold text-zinc-700">
            {step === 'location'
              ? 'Location'
              : step === 'media'
              ? 'Photos'
              : 'Details'}
          </Text>
        </View>
        <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <View
            className="h-full rounded-full bg-brand"
            style={{ width: `${progress}%` }}
          />
        </View>
      </View>

      {step === 'location' && (
        <LocationStep
          mapRef={mapRef}
          pinCoords={pinCoords}
          addressInput={addressInput}
          setAddressInput={setAddressInput}
          address={address}
          onLocateMe={locateMe}
          onGeocode={geocodeAddress}
          onMapPress={(coord: { latitude: number; longitude: number }) => {
            setPinCoords([coord.longitude, coord.latitude]);
          }}
          onNext={() => {
            if (!pinCoords) {
              Alert.alert(
                'Set location',
                'Pin your sale on the map or enter an address.',
              );
              return;
            }
            setStep('media');
          }}
        />
      )}

      {step === 'media' && (
        <MediaStep
          media={media}
          onPick={pickMedia}
          onRemove={removeMedia}
          onBack={() => setStep('location')}
          onNext={() => setStep('details')}
        />
      )}

      {step === 'details' && (
        <DetailsStep
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          startTime={startTime}
          setStartTime={setStartTime}
          endTime={endTime}
          setEndTime={setEndTime}
          selectedCategories={selectedCategories}
          toggleCategory={toggleCategory}
          pricingNotes={pricingNotes}
          setPricingNotes={setPricingNotes}
          onBack={() => setStep('media')}
          onSubmit={submit}
          submitting={submitting}
        />
      )}
    </SafeAreaView>
  );
}

// ---- Location Step ----
function LocationStep({
  mapRef,
  pinCoords,
  addressInput,
  setAddressInput,
  onLocateMe,
  onGeocode,
  onMapPress,
  address,
  onNext,
}: any) {
  return (
    <View className="flex-1">
      <View className="flex-row items-center px-4 pt-3" style={{ gap: 8 }}>
        <View className="flex-1">
          <Input
            placeholder="Enter an address"
            value={addressInput}
            onChangeText={setAddressInput}
            onSubmitEditing={onGeocode}
            returnKeyType="search"
            leftIcon={<Ionicons name="search" size={18} color="#71717A" />}
          />
        </View>
        <IconButton
          variant="solid"
          size="md"
          onPress={onLocateMe}
          icon={<Ionicons name="locate" size={20} color="#18181B" />}
        />
      </View>

      <MapView
        ref={mapRef}
        style={{ flex: 1, marginTop: 12 }}
        initialRegion={{
          latitude: 39.8283,
          longitude: -98.5795,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        onPress={(e) => onMapPress(e.nativeEvent.coordinate)}
        showsUserLocation
      >
        {pinCoords && (
          <Marker
            coordinate={{ latitude: pinCoords[1], longitude: pinCoords[0] }}
          >
            <View className="items-center justify-center">
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
            </View>
          </Marker>
        )}
      </MapView>

      <View className="border-t border-zinc-100 bg-white px-4 pb-6 pt-3">
        {address ? (
          <View className="mb-3 flex-row items-center">
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text className="ml-1.5 flex-1 text-sm text-zinc-600" numberOfLines={2}>
              {address}
            </Text>
          </View>
        ) : (
          <Text className="mb-3 text-sm text-zinc-500">
            Tap the map to drop a pin, or use your current location.
          </Text>
        )}
        <Button
          size="lg"
          onPress={onNext}
          rightIcon={<Ionicons name="arrow-forward" size={20} color="#fff" />}
        >
          Next: Photos
        </Button>
      </View>
    </View>
  );
}

// ---- Media Step ----
function MediaStep({ media, onPick, onRemove, onBack, onNext }: any) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        {media.map((item: MediaItem, i: number) => (
          <View
            key={i}
            className="relative overflow-hidden rounded-2xl"
            style={{ width: 104, height: 104 }}
          >
            <Image
              source={{ uri: item.uri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            <Pressable
              onPress={() => onRemove(i)}
              className="absolute right-1.5 top-1.5 h-6 w-6 items-center justify-center rounded-full bg-black/60"
            >
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {media.length < 10 && (
          <Pressable
            onPress={onPick}
            className="items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 active:bg-zinc-100"
            style={{ width: 104, height: 104 }}
          >
            <Ionicons name="camera-outline" size={28} color="#A1A1AA" />
            <Text className="mt-1 text-2xs font-medium text-zinc-500">
              Add photos
            </Text>
          </Pressable>
        )}
      </ScrollView>
      <Text className="px-5 pb-3 text-xs text-zinc-500">
        {media.length}/10 items. Good photos draw a crowd.
      </Text>
      <View className="border-t border-zinc-100 bg-white px-4 pb-6 pt-3 flex-row" style={{ gap: 10 }}>
        <View className="flex-1">
          <Button variant="outline" size="lg" onPress={onBack}>
            Back
          </Button>
        </View>
        <View className="flex-[2]">
          <Button
            size="lg"
            onPress={onNext}
            rightIcon={<Ionicons name="arrow-forward" size={20} color="#fff" />}
          >
            Next: Details
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---- Details Step ----
function DetailsStep({
  title,
  setTitle,
  description,
  setDescription,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  selectedCategories,
  toggleCategory,
  pricingNotes,
  setPricingNotes,
  onBack,
  onSubmit,
  submitting,
}: any) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <Input
          label="Sale title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Moving sale — everything must go!"
          maxLength={80}
        />
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="What are you selling? Any highlights?"
          multiline
          numberOfLines={3}
          inputClassName="h-24 pt-2"
          containerClassName=""
        />
        <View className="flex-row" style={{ gap: 10 }}>
          <View className="flex-1">
            <Input
              label="Start date"
              hint="YYYY-MM-DD"
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2026-06-15"
              keyboardType="numeric"
            />
          </View>
          <View className="flex-1">
            <Input
              label="End date"
              hint="YYYY-MM-DD"
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2026-06-16"
              keyboardType="numeric"
            />
          </View>
        </View>
        <View className="flex-row" style={{ gap: 10 }}>
          <View className="flex-1">
            <Input
              label="Start time"
              hint="HH:MM 24-hr"
              value={startTime}
              onChangeText={setStartTime}
              placeholder="08:00"
              keyboardType="numeric"
            />
          </View>
          <View className="flex-1">
            <Input
              label="End time"
              hint="HH:MM 24-hr"
              value={endTime}
              onChangeText={setEndTime}
              placeholder="14:00"
              keyboardType="numeric"
            />
          </View>
        </View>

        <View>
          <Text className="mb-2 text-sm font-medium text-zinc-700">
            Categories
          </Text>
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
        </View>

        <Input
          label="Pricing notes"
          value={pricingNotes}
          onChangeText={setPricingNotes}
          placeholder="e.g. Everything under $20, negotiable"
        />
      </ScrollView>

      <View className="border-t border-zinc-100 bg-white px-4 pb-6 pt-3 flex-row" style={{ gap: 10 }}>
        <View className="flex-1">
          <Button variant="outline" size="lg" onPress={onBack}>
            Back
          </Button>
        </View>
        <View className="flex-[2]">
          <Button size="lg" onPress={onSubmit} loading={submitting}>
            Go live
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
