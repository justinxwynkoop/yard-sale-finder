import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ItemCategory } from '../../types';

type Step = 'location' | 'media' | 'details';

const CATEGORIES: ItemCategory[] = [
  'furniture', 'clothing', 'electronics', 'toys', 'tools',
  'books', 'kitchen', 'sports', 'antiques', 'other',
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
  const [selectedCategories, setSelectedCategories] = useState<ItemCategory[]>([]);
  const [pricingNotes, setPricingNotes] = useState('');

  const locateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Location permission is required to pin your sale.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    const coords: [number, number] = [loc.coords.longitude, loc.coords.latitude];
    setPinCoords(coords);
    mapRef.current?.animateToRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);

    const [result] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    if (result) {
      const parts = [result.streetNumber, result.street, result.city, result.region].filter(Boolean);
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
        mapRef.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
      } else {
        Alert.alert('Address not found', 'Try a different address or drop a pin manually.');
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
      const items: MediaItem[] = result.assets.map(a => ({
        uri: a.uri,
        type: a.type === 'video' ? 'video' : 'image',
      }));
      setMedia(prev => [...prev, ...items].slice(0, 10));
    }
  };

  const removeMedia = (index: number) => {
    setMedia(prev => prev.filter((_, i) => i !== index));
  };

  const toggleCategory = (cat: ItemCategory) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const uploadMedia = async (saleId: string): Promise<void> => {
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      const ext = item.uri.split('.').pop() ?? 'jpg';
      const path = `${user!.id}/${saleId}/${i}.${ext}`;

      const response = await fetch(item.uri);
      const blob = await response.blob();

      const { error } = await supabase.storage.from('sale-media').upload(path, blob, {
        contentType: item.type === 'video' ? 'video/mp4' : 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('sale-media').getPublicUrl(path);

      await supabase.from('sale_media').insert({
        sale_id: saleId,
        url: publicUrl,
        type: item.type,
        order: i,
      });
    }
  };

  const submit = async () => {
    if (!pinCoords || !address) { Alert.alert('Missing location', 'Please set your sale location.'); return; }
    if (!title.trim()) { Alert.alert('Missing title', 'Please give your sale a title.'); return; }
    if (!startDate || !endDate || !startTime || !endTime) { Alert.alert('Missing dates', 'Please fill in all date and time fields.'); return; }

    setSubmitting(true);
    try {
      const { data: sale, error } = await supabase.from('sales').insert({
        user_id: user!.id,
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
      }).select().single();

      if (error) throw error;
      if (media.length > 0) await uploadMedia(sale.id);

      Alert.alert('Sale is live! 🎉', 'Your sale is now visible on the map.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Step indicator */}
      <View style={styles.stepBar}>
        {(['location', 'media', 'details'] as Step[]).map((s, i) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepDot, step === s && styles.stepDotActive, isStepDone(step, s) && styles.stepDotDone]}>
              <Text style={styles.stepDotText}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, step === s && styles.stepLabelActive]}>
              {s === 'location' ? 'Location' : s === 'media' ? 'Photos' : 'Details'}
            </Text>
          </View>
        ))}
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
            if (!pinCoords) { Alert.alert('Set location', 'Pin your sale on the map or enter an address.'); return; }
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
          title={title} setTitle={setTitle}
          description={description} setDescription={setDescription}
          startDate={startDate} setStartDate={setStartDate}
          endDate={endDate} setEndDate={setEndDate}
          startTime={startTime} setStartTime={setStartTime}
          endTime={endTime} setEndTime={setEndTime}
          selectedCategories={selectedCategories} toggleCategory={toggleCategory}
          pricingNotes={pricingNotes} setPricingNotes={setPricingNotes}
          onBack={() => setStep('media')}
          onSubmit={submit}
          submitting={submitting}
        />
      )}
    </SafeAreaView>
  );
}

function isStepDone(current: Step, check: Step): boolean {
  const order: Step[] = ['location', 'media', 'details'];
  return order.indexOf(current) > order.indexOf(check);
}

// ---- Location Step ----
function LocationStep({ mapRef, pinCoords, addressInput, setAddressInput, onLocateMe, onGeocode, onMapPress, address, onNext }: any) {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.addressRow}>
        <TextInput
          style={styles.addressInput}
          placeholder="Enter address..."
          value={addressInput}
          onChangeText={setAddressInput}
          onSubmitEditing={onGeocode}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.locateBtn} onPress={onLocateMe}>
          <Text>📍</Text>
        </TouchableOpacity>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{ latitude: 39.8283, longitude: -98.5795, latitudeDelta: 0.1, longitudeDelta: 0.1 }}
        onPress={(e) => onMapPress(e.nativeEvent.coordinate)}
        showsUserLocation
      >
        {pinCoords && (
          <Marker coordinate={{ latitude: pinCoords[1], longitude: pinCoords[0] }}>
            <View style={styles.mapPin}>
              <Text style={{ fontSize: 28 }}>📍</Text>
            </View>
          </Marker>
        )}
      </MapView>

      {address ? <Text style={styles.addressConfirm}>📌 {address}</Text> : null}

      <TouchableOpacity style={styles.nextBtn} onPress={onNext}>
        <Text style={styles.nextBtnText}>Next: Add Photos →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---- Media Step ----
function MediaStep({ media, onPick, onRemove, onBack, onNext }: any) {
  return (
    <KeyboardAvoidingView style={styles.stepContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.mediaGrid}>
        {media.map((item: MediaItem, i: number) => (
          <View key={i} style={styles.mediaThumb}>
            <Image source={{ uri: item.uri }} style={styles.mediaThumbImg} />
            <TouchableOpacity style={styles.mediaRemove} onPress={() => onRemove(i)}>
              <Text style={styles.mediaRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        {media.length < 10 && (
          <TouchableOpacity style={styles.addMediaBtn} onPress={onPick}>
            <Text style={styles.addMediaIcon}>+</Text>
            <Text style={styles.addMediaText}>Add Photos/Videos</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <Text style={styles.mediaHint}>{media.length}/10 items. Photos help buyers find your best stuff.</Text>
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}><Text style={styles.backBtnText}>← Back</Text></TouchableOpacity>
        <TouchableOpacity style={styles.nextBtn2} onPress={onNext}><Text style={styles.nextBtnText}>Next: Details →</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---- Details Step ----
function DetailsStep({ title, setTitle, description, setDescription, startDate, setStartDate, endDate, setEndDate, startTime, setStartTime, endTime, setEndTime, selectedCategories, toggleCategory, pricingNotes, setPricingNotes, onBack, onSubmit, submitting }: any) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.detailsScroll}>
        <Label text="Sale Title *" />
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Moving Sale – Everything Must Go!" maxLength={80} />

        <Label text="Description" />
        <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="What are you selling? Any highlights?" multiline numberOfLines={3} />

        <Label text="Start Date (YYYY-MM-DD) *" />
        <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2024-06-15" keyboardType="numeric" />

        <Label text="End Date (YYYY-MM-DD) *" />
        <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2024-06-16" keyboardType="numeric" />

        <Label text="Start Time (HH:MM, 24hr) *" />
        <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} placeholder="08:00" keyboardType="numeric" />

        <Label text="End Time (HH:MM, 24hr) *" />
        <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} placeholder="14:00" keyboardType="numeric" />

        <Label text="Categories" />
        <View style={styles.catGrid}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, selectedCategories.includes(cat) && styles.catChipActive]}
              onPress={() => toggleCategory(cat)}
            >
              <Text style={[styles.catChipText, selectedCategories.includes(cat) && styles.catChipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Label text="Pricing Notes" />
        <TextInput style={styles.input} value={pricingNotes} onChangeText={setPricingNotes} placeholder="e.g. Everything under $20, negotiable" />

        <View style={styles.navRow}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}><Text style={styles.backBtnText}>← Back</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.nextBtn2, submitting && { opacity: 0.6 }]} onPress={onSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextBtnText}>Go Live 🎉</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  stepBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  stepDotActive: { backgroundColor: '#2563EB' },
  stepDotDone: { backgroundColor: '#10B981' },
  stepDotText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepLabel: { fontSize: 11, color: '#9CA3AF' },
  stepLabelActive: { color: '#2563EB', fontWeight: '600' },
  stepContainer: { flex: 1 },
  addressRow: { flexDirection: 'row', padding: 12, gap: 8 },
  addressInput: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  locateBtn: { backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
  map: { flex: 1 },
  mapPin: { alignItems: 'center' },
  addressConfirm: { padding: 12, fontSize: 13, color: '#2563EB', fontWeight: '500' },
  nextBtn: { margin: 12, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  mediaThumb: { width: 100, height: 100, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  mediaThumbImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  mediaRemove: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  mediaRemoveText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addMediaBtn: { width: 100, height: 100, borderRadius: 8, borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  addMediaIcon: { fontSize: 28, color: '#9CA3AF' },
  addMediaText: { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },
  mediaHint: { paddingHorizontal: 16, paddingBottom: 8, fontSize: 12, color: '#9CA3AF' },
  navRow: { flexDirection: 'row', padding: 12, gap: 10 },
  backBtn: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  backBtnText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  nextBtn2: { flex: 2, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  detailsScroll: { padding: 16, gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#1a1a1a' },
  textArea: { height: 80, textAlignVertical: 'top' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  catChip: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  catChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  catChipText: { fontSize: 13, color: '#374151', textTransform: 'capitalize' },
  catChipTextActive: { color: '#fff' },
});
