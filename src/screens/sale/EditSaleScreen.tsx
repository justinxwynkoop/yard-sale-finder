import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
  Switch,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SubHeader } from '../../components/SubHeader';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import MapView, { Marker, MapPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  SaleStackParamList,
  ItemCategory,
  SaleStatus,
  SaleMedia,
} from '../../types';
import {
  Button,
  CategoryPicker,
  Chip, // used for status selector chips (Live / Ending soon / Ended)
  DateRangePresets,
  DateTimeField,
  Input,
} from '../../components/ui';
import { captureBus } from '../../lib/captureBus';
import { toast } from '../../lib/toast';
import { compressImage } from '../../lib/imageCompression';

type Route = RouteProp<SaleStackParamList, 'EditSale'>;
type Nav = NativeStackNavigationProp<SaleStackParamList, 'EditSale'>;

const STATUSES: { value: SaleStatus; label: string }[] = [
  { value: 'active', label: 'Live now' },
  { value: 'winding_down', label: 'Ending soon' },
  { value: 'ended', label: 'Ended' },
];

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;
const MAX_PRICING = 200;
const MAX_MEDIA = 10;

type NewMedia = { uri: string; type: 'image' | 'video' };

export default function EditSaleScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { saleId } = route.params;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<ItemCategory[]>([]);
  const [pricingNotes, setPricingNotes] = useState('');
  const [allowMessages, setAllowMessages] = useState(true);
  const [status, setStatus] = useState<SaleStatus>('active');

  // Where — editable location (address + draggable pin), prefilled from the
  // sale row. [lng, lat] to match CreateSaleScreen's convention.
  const [pinCoords, setPinCoords] = useState<[number, number] | null>(null);
  const [address, setAddress] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);

  // Existing media we loaded and a parallel set of ids the user wants to delete
  const [existingMedia, setExistingMedia] = useState<SaleMedia[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<Set<string>>(new Set());

  // Newly added photos (not yet uploaded)
  const [newMedia, setNewMedia] = useState<NewMedia[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!saleId) {
        if (!cancelled) {
          setLoadError('Missing sale id.');
          setLoading(false);
        }
        return;
      }
      try {
        const { data, error } = await supabase
          .from('sales')
          .select('*, media:sale_media(*)')
          .eq('id', saleId)
          .single();
        if (cancelled) return;
        if (error) throw error;
        if (!data) throw new Error('Sale not found.');

        setTitle(data.title);
        setDescription(data.description ?? '');
        setStartDate(data.start_date);
        setEndDate(data.end_date);
        // Supabase time columns can return 'HH:MM:SS' — trim to HH:MM
        setStartTime((data.start_time ?? '').slice(0, 5));
        setEndTime((data.end_time ?? '').slice(0, 5));
        setSelectedCategories(data.categories ?? []);
        setPricingNotes(data.pricing_notes ?? '');
        setAllowMessages(data.allow_messages ?? true);
        setStatus(data.status);
        setAddress(data.address ?? '');
        setAddressInput(data.address ?? '');
        if (typeof data.longitude === 'number' && typeof data.latitude === 'number') {
          setPinCoords([data.longitude, data.latitude]);
        }
        const media: SaleMedia[] = (data.media ?? []).sort(
          (a: SaleMedia, b: SaleMedia) => a.order - b.order,
        );
        setExistingMedia(media);
      } catch (e: any) {
        if (cancelled) return;
        setLoadError(e.message ?? 'Could not load this sale.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const totalMediaCount =
    existingMedia.length - removedMediaIds.size + newMedia.length;
  const remainingSlots = MAX_MEDIA - totalMediaCount;

  const toggleRemoveExisting = (mediaId: string) => {
    setRemovedMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  };

  const removeNew = (i: number) => {
    setNewMedia((prev) => prev.filter((_, idx) => idx !== i));
  };

  const pickFromLibrary = async () => {
    if (remainingSlots <= 0) {
      toast.info('Photo limit reached', `Max ${MAX_MEDIA} photos per sale.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: remainingSlots,
    });
    if (!result.canceled) {
      const items: NewMedia[] = result.assets.map((a) => ({
        uri: a.uri,
        type: a.type === 'video' ? 'video' : 'image',
      }));
      setNewMedia((prev) => [...prev, ...items].slice(0, MAX_MEDIA));
    }
  };

  const takePhotos = () => {
    if (remainingSlots <= 0) {
      toast.info('Photo limit reached', `Max ${MAX_MEDIA} photos per sale.`);
      return;
    }
    captureBus.setListener((uris) => {
      if (uris.length === 0) return;
      const items: NewMedia[] = uris.map((uri) => ({ uri, type: 'image' as const }));
      setNewMedia((prev) => [...prev, ...items].slice(0, MAX_MEDIA));
    });
    navigation.navigate('Capture', { max: remainingSlots });
  };

  const uploadNewMedia = async (
    existingOrderMax: number,
  ): Promise<void> => {
    let nextOrder = existingOrderMax + 1;
    for (let i = 0; i < newMedia.length; i++) {
      const item = newMedia[i];
      // Compress images before upload; pass videos through as-is.
      const uri = item.type === 'image' ? await compressImage(item.uri) : item.uri;
      const ext = item.type === 'video' ? 'mp4' : 'jpg';
      const path = `${user!.id}/${saleId}/new-${Date.now()}-${i}.${ext}`;
      const contentType = item.type === 'video' ? 'video/mp4' : 'image/jpeg';

      const file = new File(uri);
      const arrayBuffer = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('sale-media')
        .upload(path, arrayBuffer, {
          contentType,
          upsert: true,
        });
      if (uploadError) {
        const enriched: any = new Error(
          `Storage upload rejected (path=${path}): ${uploadError.message}`,
        );
        enriched.code =
          (uploadError as any).statusCode ?? (uploadError as any).status;
        throw enriched;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('sale-media').getPublicUrl(path);

      const { error: insertError } = await supabase.from('sale_media').insert({
        sale_id: saleId,
        url: publicUrl,
        type: item.type,
        order: nextOrder++,
      });
      if (insertError) {
        const enriched: any = new Error(
          `sale_media insert rejected: ${insertError.message}`,
        );
        enriched.code = insertError.code;
        enriched.details = insertError.details;
        enriched.hint = insertError.hint;
        throw enriched;
      }
    }
  };

  const geocodeAddress = async () => {
    if (!addressInput.trim()) return;
    setGeocoding(true);
    try {
      const results = await Location.geocodeAsync(addressInput);
      if (results.length > 0) {
        const { latitude, longitude } = results[0];
        setPinCoords([longitude, latitude]);
        setAddress(addressInput);
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
    try {
      const [result] = await Location.reverseGeocodeAsync({ latitude, longitude });
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

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Please give your sale a title.');
      return;
    }
    if (endDate < startDate) {
      Alert.alert('Date issue', 'End date must be after start date.');
      return;
    }
    // End must be strictly after start (times are 'HH:MM' 24h, dates ISO, so
    // "<date>T<time>" compares chronologically). Blocks same-day end == start
    // or end < start.
    if (
      startDate && endDate && startTime && endTime &&
      `${endDate}T${endTime}` <= `${startDate}T${startTime}`
    ) {
      Alert.alert('Time issue', 'End time must be after the start time.');
      return;
    }
    if (!pinCoords || !address) {
      Alert.alert('Location required', 'Please set a location.');
      return;
    }
    setSaving(true);
    try {
      // 1. Update the sale row
      const { error } = await supabase
        .from('sales')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          start_date: startDate,
          end_date: endDate,
          start_time: startTime,
          end_time: endTime,
          address,
          latitude: pinCoords[1],
          longitude: pinCoords[0],
          categories: selectedCategories,
          pricing_notes: pricingNotes.trim() || null,
          allow_messages: allowMessages,
          status,
        })
        .eq('id', saleId);
      if (error) throw error;

      // 2. Delete removed media (both storage object and sale_media row)
      const removedList = existingMedia.filter((m) =>
        removedMediaIds.has(m.id),
      );
      if (removedList.length > 0) {
        // Best-effort: extract storage paths from URLs and delete them
        const paths = removedList
          .map((m) => {
            // url looks like .../storage/v1/object/public/sale-media/<path>
            const marker = '/sale-media/';
            const idx = m.url.indexOf(marker);
            return idx >= 0 ? m.url.slice(idx + marker.length) : null;
          })
          .filter((p): p is string => !!p);
        if (paths.length > 0) {
          await supabase.storage.from('sale-media').remove(paths);
        }
        const { error: delError } = await supabase
          .from('sale_media')
          .delete()
          .in(
            'id',
            removedList.map((m) => m.id),
          );
        if (delError) throw delError;
      }

      // 3. Upload any new photos
      if (newMedia.length > 0) {
        const maxOrder = existingMedia.reduce(
          (acc, m) => (m.order > acc ? m.order : acc),
          -1,
        );
        await uploadNewMedia(maxOrder);
      }

      toast.success('Saved');
      navigation.goBack();
    } catch (e: any) {
      toast.error('Save failed', e.message ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#1F4D3A" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-8">
        <Ionicons name="alert-circle-outline" size={48} color="#A1A1AA" />
        <Text className="mt-3 text-base text-zinc-600">{loadError}</Text>
        <View className="mt-6 w-full max-w-xs">
          <Button variant="outline" onPress={() => navigation.goBack()}>
            Go back
          </Button>
        </View>
      </View>
    );
  }

  const visibleExistingMedia = existingMedia.filter(
    (m) => !removedMediaIds.has(m.id),
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
      <SubHeader title="Edit sale" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 24,
            gap: 16,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* PHOTOS */}
          <View>
            <Text className="mb-2 text-sm font-medium text-zinc-700">
              Photos
            </Text>
            {(visibleExistingMedia.length > 0 || newMedia.length > 0) && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                className="mb-2"
              >
                {visibleExistingMedia.map((m) => (
                  <View
                    key={m.id}
                    className="relative overflow-hidden rounded-2xl"
                    style={{ width: 100, height: 100 }}
                  >
                    <Image
                      source={{ uri: m.url }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                    {m.type === 'video' && (
                      <View
                        className="absolute inset-0 items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
                        pointerEvents="none"
                      >
                        <Ionicons name="play-circle" size={28} color="#fff" />
                      </View>
                    )}
                    <Pressable
                      onPress={() => toggleRemoveExisting(m.id)}
                      className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-black/60"
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {newMedia.map((item, i) => (
                  <View
                    key={`new-${i}`}
                    className="relative overflow-hidden rounded-2xl border-2 border-brand"
                    style={{ width: 100, height: 100 }}
                  >
                    <Image
                      source={{ uri: item.uri }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                    {item.type === 'video' && (
                      <View
                        className="absolute inset-0 items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
                        pointerEvents="none"
                      >
                        <Ionicons name="play-circle" size={28} color="#fff" />
                      </View>
                    )}
                    <View className="absolute bottom-1 left-1 rounded-full bg-brand px-1.5 py-0.5">
                      <Text className="text-2xs font-bold text-white">
                        NEW
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => removeNew(i)}
                      className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-black/60"
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
            {remainingSlots > 0 ? (
              <View className="flex-row" style={{ gap: 8 }}>
                <Pressable
                  onPress={takePhotos}
                  className="flex-1 flex-row items-center justify-center rounded-xl border border-zinc-200 bg-white py-3 active:bg-zinc-50"
                >
                  <Ionicons name="camera-outline" size={18} color="#18181B" />
                  <Text className="ml-2 text-sm font-semibold text-zinc-900">
                    Take photo
                  </Text>
                </Pressable>
                <Pressable
                  onPress={pickFromLibrary}
                  className="flex-1 flex-row items-center justify-center rounded-xl border border-zinc-200 bg-white py-3 active:bg-zinc-50"
                >
                  <Ionicons name="images-outline" size={18} color="#18181B" />
                  <Text className="ml-2 text-sm font-semibold text-zinc-900">
                    From library
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text className="text-xs text-zinc-500">
                Maximum {MAX_MEDIA} photos.
              </Text>
            )}
            {removedMediaIds.size > 0 && (
              <Text className="mt-1 text-xs text-zinc-500">
                {removedMediaIds.size} will be removed on save.
              </Text>
            )}
          </View>

          {/* TITLE */}
          <View>
            <Input
              label="Sale title *"
              value={title}
              onChangeText={(v) => setTitle(v.slice(0, MAX_TITLE))}
              maxLength={MAX_TITLE}
            />
            <Text className="mt-1 text-right text-xs text-zinc-400">
              {title.length}/{MAX_TITLE}
            </Text>
          </View>

          {/* DESCRIPTION */}
          <View>
            <Input
              label="Description"
              value={description}
              onChangeText={(v) => setDescription(v.slice(0, MAX_DESCRIPTION))}
              multiline
              numberOfLines={4}
              inputClassName="min-h-[96px]"
              maxLength={MAX_DESCRIPTION}
            />
            <Text className="mt-1 text-right text-xs text-zinc-400">
              {description.length}/{MAX_DESCRIPTION}
            </Text>
          </View>

          {/* WHERE */}
          <View>
            <Text className="mb-2 text-sm font-medium text-zinc-700">
              Location
            </Text>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <View className="flex-1">
                <Input
                  placeholder="Enter an address"
                  value={addressInput}
                  onChangeText={setAddressInput}
                  onSubmitEditing={geocodeAddress}
                  returnKeyType="search"
                />
              </View>
              <Pressable
                onPress={geocodeAddress}
                disabled={geocoding || !addressInput.trim()}
                className="rounded-xl bg-zinc-900 px-4 py-3 active:bg-zinc-700"
                style={{ opacity: !addressInput.trim() || geocoding ? 0.4 : 1 }}
              >
                {geocoding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="search" size={18} color="#fff" />
                )}
              </Pressable>
            </View>
            <View
              className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100"
              style={{ height: 200 }}
            >
              <MapView
                style={StyleSheet.absoluteFillObject}
                initialRegion={
                  pinCoords
                    ? {
                        latitude: pinCoords[1],
                        longitude: pinCoords[0],
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }
                    : undefined
                }
                onPress={onMapPress}
              >
                {pinCoords && (
                  <Marker
                    coordinate={{ latitude: pinCoords[1], longitude: pinCoords[0] }}
                    draggable
                    onDragEnd={(e) => {
                      const { latitude, longitude } = e.nativeEvent.coordinate;
                      setPinCoords([longitude, latitude]);
                    }}
                    pinColor="#1F4D3A"
                  />
                )}
              </MapView>
            </View>
            {address ? (
              <View className="mt-2 flex-row items-start">
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text className="ml-1.5 flex-1 text-xs text-zinc-600">{address}</Text>
              </View>
            ) : null}
          </View>

          {/* QUICK PICK */}
          <View>
            <Text className="mb-2 text-sm font-medium text-zinc-700">
              Quick pick
            </Text>
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
          </View>

          {/* DATES */}
          <View className="flex-row" style={{ gap: 10 }}>
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
          <View className="flex-row" style={{ gap: 10 }}>
            <View className="flex-1">
              <DateTimeField
                label="Start time"
                mode="time"
                value={startTime}
                onChange={setStartTime}
                placeholder="Start time"
              />
            </View>
            <View className="flex-1">
              <DateTimeField
                label="End time"
                mode="time"
                value={endTime}
                onChange={setEndTime}
                placeholder="End time"
              />
            </View>
          </View>

          {/* CATEGORIES */}
          <View>
            <Text className="mb-2 text-sm font-medium text-zinc-700">
              Categories
            </Text>
            <CategoryPicker selected={selectedCategories} onChange={setSelectedCategories} />
          </View>

          {/* PRICING */}
          <View>
            <Input
              label="Pricing notes"
              value={pricingNotes}
              onChangeText={(v) => setPricingNotes(v.slice(0, MAX_PRICING))}
              multiline
              numberOfLines={2}
              inputClassName="min-h-[64px]"
              maxLength={MAX_PRICING}
            />
            <Text className="mt-1 text-right text-xs text-zinc-400">
              {pricingNotes.length}/{MAX_PRICING}
            </Text>
          </View>

          {/* MESSAGING */}
          <View>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-medium text-zinc-700">
                  Allow messages
                </Text>
                <Text className="mt-0.5 text-xs text-zinc-500">
                  Let shoppers message you about this sale
                </Text>
              </View>
              <Switch
                value={allowMessages}
                onValueChange={setAllowMessages}
                trackColor={{ true: '#1F4D3A', false: '#E5DECC' }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* STATUS */}
          <View>
            <Text className="mb-2 text-sm font-medium text-zinc-700">
              Status
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {STATUSES.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  size="sm"
                  active={status === s.value}
                  onPress={() => setStatus(s.value)}
                />
              ))}
            </View>
          </View>

          {/* SAVE */}
          <View className="mt-4">
            <Button size="lg" onPress={save} loading={saving}>
              Save changes
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
