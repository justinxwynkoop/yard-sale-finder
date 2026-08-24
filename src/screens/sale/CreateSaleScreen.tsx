import React, { useEffect, useState, useRef } from 'react';
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
  Switch,
} from 'react-native';
import MapView, { Marker, MapPressEvent, Region } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { File } from 'expo-file-system';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { track } from '../../lib/analytics';
import { useAuth } from '../../hooks/useAuth';
import { ItemCategory, SaleEvent, SaleStackParamList } from '../../types';
import { captureBus } from '../../lib/captureBus';
import { compressImage } from '../../lib/imageCompression';
import { eventMatchForSale, localTodayIso } from '../../lib/eventMatch';
import { EventJoinPrompt } from '../../components/EventJoinPrompt';
import {
  Draft,
  clearDraft,
  isMeaningful,
  loadDraft,
  mediaTypeForUri,
  saveDraft,
} from '../../lib/drafts';
import { DraftBanner } from '../../components/DraftBanner';
import {
  CategoryPicker,
  DateRangePresets,
  DateTimeField,
  HeaderButton,
  IconButton,
  Input,
} from '../../components/ui';
import { PostSection, PostProgressBar } from '../../components/PostFormShell';

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
  // Hard guard against a double-submit slipping through a stale state read.
  const submittingRef = useRef(false);

  const [submitting, setSubmitting] = useState(false);

  const route = useRoute<any>();
  const eventIdParam: string | undefined = route.params?.eventId;
  const repostSaleId: string | undefined = route.params?.repostSaleId;
  const fromDraftRow: boolean = !!route.params?.fromDraftRow;
  // Draft machinery is fully disabled on a repost instance — autosaving the
  // repost's prefill would silently overwrite whatever draft is being held.
  const draftsEnabled = !repostSaleId;
  const [draftBanner, setDraftBanner] = useState<Draft | null>(null);
  const [joinPrompt, setJoinPrompt] = useState<{
    event: SaleEvent; saleId: string; saleStart: string; saleEnd: string;
  } | null>(null);

  // Event-link joins arrive with the event's dates prefilled (spec §2).
  useEffect(() => {
    const { presetStart, presetEnd } = route.params ?? {};
    if (presetStart && !startDate) setStartDate(presetStart);
    if (presetEnd && !endDate) setEndDate(presetEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [allowMessages, setAllowMessages] = useState(true);

  // What
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<ItemCategory[]>(
    [],
  );
  const [pricingNotes, setPricingNotes] = useState('');

  // Restore a device-local draft: silently when arriving from the Draft row,
  // via the banner otherwise. Event presets (join-a-neighborhood-sale links)
  // win over the draft's dates (spec).
  const applyDraft = (d: Draft) => {
    const f = d.fields;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    setTitle(str(f.title));
    setDescription(str(f.description));
    setAddress(str(f.address));
    setAddressInput(str(f.addressInput) || str(f.address));
    if (
      Array.isArray(f.pinCoords) &&
      f.pinCoords.length === 2 &&
      f.pinCoords.every((n) => typeof n === 'number')
    ) {
      setPinCoords(f.pinCoords as [number, number]);
    }
    const hasEventPreset = !!(route.params?.presetStart || route.params?.presetEnd);
    if (!hasEventPreset) {
      setStartDate(str(f.startDate));
      setEndDate(str(f.endDate));
      setStartTime(str(f.startTime));
      setEndTime(str(f.endTime));
    }
    if (Array.isArray(f.selectedCategories)) {
      setSelectedCategories(
        f.selectedCategories.filter((c): c is ItemCategory => typeof c === 'string'),
      );
    }
    setPricingNotes(str(f.pricingNotes));
    if (typeof f.allowMessages === 'boolean') setAllowMessages(f.allowMessages);
    // Photos the OS purged since the draft was saved are skipped silently.
    const alive = d.media.filter((uri) => {
      try {
        return new File(uri).exists;
      } catch {
        return false;
      }
    });
    setMedia(alive.map((uri) => ({ uri, type: mediaTypeForUri(uri) })));
    setDraftBanner(null);
  };

  useEffect(() => {
    if (!draftsEnabled) return;
    loadDraft('sale').then((d) => {
      if (!d) return;
      if (fromDraftRow) applyDraft(d);
      else setDraftBanner(d);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftFieldsSnapshot = () => ({
    title, description, address, addressInput, pinCoords,
    startDate, endDate, startTime, endTime,
    selectedCategories, pricingNotes, allowMessages,
  });

  // Silent autosave — the safety net under the explicit button. Runs ~1s
  // after the last change, only once the form is meaningful.
  useEffect(() => {
    if (!draftsEnabled) return;
    // Don't overwrite the parked draft while the banner is still offering it —
    // autosave resumes once the user answers Restore / Start fresh.
    if (draftBanner) return;
    if (!isMeaningful({ title, description, mediaCount: media.length })) return;
    const t = setTimeout(() => {
      void saveDraft('sale', draftFieldsSnapshot(), media.map((m) => m.uri));
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title, description, address, addressInput, pinCoords,
    startDate, endDate, startTime, endTime,
    selectedCategories, pricingNotes, allowMessages, media, draftBanner,
  ]);

  const handleSaveDraft = async () => {
    await saveDraft('sale', draftFieldsSnapshot(), media.map((m) => m.uri));
    toast.success('Draft saved');
    navigation.goBack();
  };

  const handleStartFresh = () => {
    void clearDraft('sale');
    setDraftBanner(null);
  };

  // Repost: prefill everything except dates/times from an existing sale.
  // Media arrives as remote URLs; uploadMedia reuses them without
  // re-uploading (see the http branch there).
  useEffect(() => {
    if (!repostSaleId) return;
    (async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('*, media:sale_media(*)')
        .eq('id', repostSaleId)
        .single();
      if (error || !data) {
        toast.error("Couldn't load that sale", 'Check your connection and try again.');
        return;
      }
      setTitle(data.title ?? '');
      setDescription(data.description ?? '');
      setAddress(data.address ?? '');
      setAddressInput(data.address ?? '');
      if (typeof data.longitude === 'number' && typeof data.latitude === 'number') {
        setPinCoords([data.longitude, data.latitude]);
      }
      setSelectedCategories(data.categories ?? []);
      setPricingNotes(data.pricing_notes ?? '');
      setAllowMessages(data.allow_messages ?? true);
      const sorted = [...(data.media ?? [])].sort(
        (a: { order: number }, b: { order: number }) => a.order - b.order,
      );
      setMedia(
        sorted.map((m: { url: string; type: 'image' | 'video' }) => ({
          uri: m.url,
          type: m.type,
        })),
      );
    })();
  }, [repostSaleId]);

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

  // -- Submit --
  const uploadMedia = async (saleId: string): Promise<void> => {
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      // Repost path: media already lives in Supabase storage. Copy the object
      // into THIS sale's folder so the two sales never share a storage path —
      // edit-removing a photo on one must not 404 the other. If the copy
      // fails (source object gone), fall back to referencing the old URL.
      if (item.uri.startsWith('http')) {
        let url = item.uri;
        const marker = '/sale-media/';
        const idx = item.uri.indexOf(marker);
        if (idx >= 0) {
          const oldPath = item.uri.slice(idx + marker.length);
          const ext = oldPath.includes('.') ? oldPath.slice(oldPath.lastIndexOf('.') + 1) : 'jpg';
          const newPath = `${user!.id}/${saleId}/repost-${i}.${ext}`;
          const { error: copyError } = await supabase.storage
            .from('sale-media')
            .copy(oldPath, newPath);
          if (!copyError) {
            url = supabase.storage.from('sale-media').getPublicUrl(newPath).data.publicUrl;
          }
        }
        const { error: reuseError } = await supabase.from('sale_media').insert({
          sale_id: saleId,
          url,
          type: item.type,
          order: i,
        });
        if (reuseError) {
          const enriched: any = new Error(
            `sale_media insert rejected: ${reuseError.message}`,
          );
          enriched.code = reuseError.code;
          throw enriched;
        }
        continue;
      }
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
      if (uploadError) {
        const enriched: any = new Error(
          `Storage upload rejected (path=${path}): ${
            uploadError.message
          } | ${safeStringify(uploadError)}`,
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
        order: i,
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

  const safeStringify = (obj: unknown) => {
    try {
      const s = JSON.stringify(obj);
      return s.length > 400 ? s.slice(0, 400) + '…' : s;
    } catch {
      return String(obj);
    }
  };

  const validate = (): string | null => {
    if (!pinCoords || !address) return 'Please set a location.';
    if (!title.trim()) return 'Please give your sale a title.';
    if (!startDate || !endDate) return 'Please pick a start and end date.';
    if (!startTime || !endTime) return 'Please pick a start and end time.';
    if (endDate < startDate) return 'End date must be after start date.';
    // Times are 'HH:MM' (24h) and dates 'YYYY-MM-DD', so the combined
    // "<date>T<time>" string compares chronologically. End must be strictly
    // after start — no equal-to or before (e.g. same-day 2pm–2pm or 2pm–1pm).
    if (`${endDate}T${endTime}` <= `${startDate}T${startTime}`)
      return 'End time must be after the start time.';
    return null;
  };

  const resetForm = () => {
    setMedia([]);
    setPinCoords(null);
    setAddress('');
    setAddressInput('');
    setStartDate('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
    setTitle('');
    setDescription('');
    setSelectedCategories([]);
    setPricingNotes('');
  };

  const submit = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'You need to be signed in to post a sale.');
      return;
    }
    if (submittingRef.current) return; // already posting — ignore re-taps
    const err = validate();
    if (err) {
      Alert.alert('Almost there', err);
      return;
    }
    submittingRef.current = true;
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
          allow_messages: allowMessages,
          status: 'active',
          event_id: eventIdParam ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      if (media.length > 0) await uploadMedia(sale.id);

      // Clear the form so a lingering/cached screen instance can't re-post
      // the same sale (duplicate-post fix) — empty fields fail validation
      // and disable Post.
      resetForm();
      if (draftsEnabled) void clearDraft('sale');
      track('sale_posted', { saleId: sale.id });

      // Proximity prompt (spec §3, door two): location-only match against
      // upcoming events, skipped when the sale already joined via link or
      // this device previously declined this event.
      if (!eventIdParam) {
        const today = localTodayIso();
        const { data: events } = await supabase
          .from('sale_events').select('*').gte('end_date', today);
        const match = eventMatchForSale(sale, (events as SaleEvent[]) ?? [], today);
        if (match) {
          const declined = await AsyncStorage.getItem(
            `trove:event-prompt-declined:${match.id}`,
          ).catch(() => null);
          if (!declined) {
            toast.success('Sale posted');
            setJoinPrompt({
              event: match, saleId: sale.id,
              saleStart: sale.start_date, saleEnd: sale.end_date,
            });
            return; // prompt handlers perform the final goBack()
          }
        }
      }

      // Pop this screen off the stack. Previously we navigate()'d to
      // 'MySalesHome', but that route isn't in the stack, so navigate
      // PUSHED it and left CreateSale lingering underneath — tapping the
      // Profile tab then resurfaced the Create screen. goBack() removes
      // CreateSale from whichever stack hosted it (Profile or the Post
      // flow); the realtime My Sales list shows the new post.
      toast.success('Sale posted');
      navigation.goBack();
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
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleJoinEvent = async (moveDates: boolean) => {
    if (!joinPrompt) return;
    const patch: Record<string, unknown> = { event_id: joinPrompt.event.id };
    if (moveDates) {
      patch.start_date = joinPrompt.event.start_date;
      patch.end_date = joinPrompt.event.end_date;
    }
    try {
      const { error } = await supabase
        .from('sales').update(patch).eq('id', joinPrompt.saleId);
      if (error) toast.error("Couldn't join the event");
      else toast.success(`Joined ${joinPrompt.event.title}`);
    } catch {
      toast.error("Couldn't join the event");
    } finally {
      setJoinPrompt(null);
      navigation.goBack();
    }
  };

  const handleDeclineEvent = async () => {
    if (!joinPrompt) return;
    await AsyncStorage.setItem(
      `trove:event-prompt-declined:${joinPrompt.event.id}`, '1',
    ).catch(() => {});
    setJoinPrompt(null);
    navigation.goBack();
  };

  // Backdrop tap / hardware back — a soft dismiss, not a permanent decline.
  // Doesn't write the declined flag, so the prompt can surface again next time.
  const handleDismissEvent = () => {
    setJoinPrompt(null);
    navigation.goBack();
  };

  // -- Render --
  const validationError = validate();
  const canSubmit = !validationError && !submitting;

  // Step completion flags drive the progress bar + numbered circles.
  const steps = [
    { label: 'Photos', done: media.length > 0 },
    { label: 'Where', done: !!(pinCoords && address) },
    { label: 'When', done: !!(startDate && endDate && startTime && endTime) },
    { label: 'About', done: !!title.trim() },
    { label: 'Categories', done: selectedCategories.length > 0 },
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
            New yard sale
          </Text>
          <View style={{ width: 44 }} />
        </View>
        <PostProgressBar
          steps={steps.length}
          activeIdx={activeStepIdx}
          dones={steps.map((s) => s.done)}
        />
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
          {draftBanner && (
            <DraftBanner
              savedAt={draftBanner.savedAt}
              onRestore={() => applyDraft(draftBanner)}
              onStartFresh={handleStartFresh}
            />
          )}

          {/* PHOTOS SECTION */}
          <PostSection
            step={1}
            done={steps[0].done}
            active={activeStepIdx === 0}
            title="Photos"
            subtitle="A great cover photo helps your sale stand out."
          >
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
          </PostSection>

          {/* WHERE SECTION */}
          <PostSection
            step={2}
            done={steps[1].done}
            active={activeStepIdx === 1}
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
                        backgroundColor: '#1F4D3A',
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
          </PostSection>

          {/* WHEN SECTION */}
          <PostSection
            step={3}
            done={steps[2].done}
            active={activeStepIdx === 2}
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
          </PostSection>

          {/* ABOUT SECTION */}
          <PostSection
            step={4}
            done={steps[3].done}
            active={activeStepIdx === 3}
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
          </PostSection>

          {/* CATEGORIES SECTION */}
          <PostSection
            step={5}
            done={steps[4].done}
            active={activeStepIdx === 4}
            title="What you're selling"
            subtitle="Pick any that apply — helps buyers filter."
          >
            <CategoryPicker selected={selectedCategories} onChange={setSelectedCategories} />
            {selectedCategories.length > 0 && (
              <Text className="mt-2 text-xs text-zinc-500">
                {selectedCategories.length} selected
              </Text>
            )}
          </PostSection>

          {/* PRICING SECTION (optional, not in progress count) */}
          <PostSection
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
          </PostSection>

          {/* MESSAGING SECTION (optional, not in progress count) */}
          <PostSection
            title="Messaging"
            subtitle="Let shoppers message you about this sale."
          >
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 pr-3 text-sm font-semibold text-zinc-800">
                Allow messages
              </Text>
              <Switch
                value={allowMessages}
                onValueChange={setAllowMessages}
                trackColor={{ true: '#1F4D3A', false: '#E5DECC' }}
                thumbColor="#fff"
              />
            </View>
          </PostSection>
        </ScrollView>

        {/* Sticky CTA */}
        <View
          style={{
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#E5DECC',
            paddingHorizontal: 16,
            paddingTop: 12,
            // Sits above the tab bar (which clears the home indicator).
            paddingBottom: 16,
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
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {draftsEnabled &&
              isMeaningful({ title, description, mediaCount: media.length }) && (
                <Pressable
                  onPress={handleSaveDraft}
                  accessibilityRole="button"
                  accessibilityLabel="Save draft"
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#E5DECC',
                    borderRadius: 14,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#171513', fontSize: 14, fontWeight: '700' }}>
                    Save draft
                  </Text>
                </Pressable>
              )}
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Post sale"
              style={{
                flex: 1,
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
                {submitting ? 'Posting…' : 'Post sale'}
              </Text>
              {!submitting && (
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      {joinPrompt && (
        <EventJoinPrompt
          visible
          event={joinPrompt.event}
          saleStart={joinPrompt.saleStart}
          saleEnd={joinPrompt.saleEnd}
          onJoin={handleJoinEvent}
          onDecline={handleDeclineEvent}
          onDismiss={handleDismissEvent}
        />
      )}
    </SafeAreaView>
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
        <Ionicons name={icon} size={20} color="#1F4D3A" />
      </View>
      <Text className="text-sm font-semibold text-zinc-900">{label}</Text>
    </Pressable>
  );
}

