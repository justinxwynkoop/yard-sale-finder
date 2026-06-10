import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useProfile, invalidateProfile } from '../../hooks/useProfile';
import { supabase } from '../../lib/supabase';
import { Button, Input } from '../../components/ui';

// ─── US states ────────────────────────────────────────────────────────────────

const US_STATES: { abbr: string; name: string }[] = [
  { abbr: 'AL', name: 'Alabama' },       { abbr: 'AK', name: 'Alaska' },
  { abbr: 'AZ', name: 'Arizona' },       { abbr: 'AR', name: 'Arkansas' },
  { abbr: 'CA', name: 'California' },    { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' },   { abbr: 'DE', name: 'Delaware' },
  { abbr: 'DC', name: 'Washington D.C.' },
  { abbr: 'FL', name: 'Florida' },       { abbr: 'GA', name: 'Georgia' },
  { abbr: 'HI', name: 'Hawaii' },        { abbr: 'ID', name: 'Idaho' },
  { abbr: 'IL', name: 'Illinois' },      { abbr: 'IN', name: 'Indiana' },
  { abbr: 'IA', name: 'Iowa' },          { abbr: 'KS', name: 'Kansas' },
  { abbr: 'KY', name: 'Kentucky' },      { abbr: 'LA', name: 'Louisiana' },
  { abbr: 'ME', name: 'Maine' },         { abbr: 'MD', name: 'Maryland' },
  { abbr: 'MA', name: 'Massachusetts' }, { abbr: 'MI', name: 'Michigan' },
  { abbr: 'MN', name: 'Minnesota' },     { abbr: 'MS', name: 'Mississippi' },
  { abbr: 'MO', name: 'Missouri' },      { abbr: 'MT', name: 'Montana' },
  { abbr: 'NE', name: 'Nebraska' },      { abbr: 'NV', name: 'Nevada' },
  { abbr: 'NH', name: 'New Hampshire' }, { abbr: 'NJ', name: 'New Jersey' },
  { abbr: 'NM', name: 'New Mexico' },    { abbr: 'NY', name: 'New York' },
  { abbr: 'NC', name: 'North Carolina' },{ abbr: 'ND', name: 'North Dakota' },
  { abbr: 'OH', name: 'Ohio' },          { abbr: 'OK', name: 'Oklahoma' },
  { abbr: 'OR', name: 'Oregon' },        { abbr: 'PA', name: 'Pennsylvania' },
  { abbr: 'RI', name: 'Rhode Island' },  { abbr: 'SC', name: 'South Carolina' },
  { abbr: 'SD', name: 'South Dakota' },  { abbr: 'TN', name: 'Tennessee' },
  { abbr: 'TX', name: 'Texas' },         { abbr: 'UT', name: 'Utah' },
  { abbr: 'VT', name: 'Vermont' },       { abbr: 'VA', name: 'Virginia' },
  { abbr: 'WA', name: 'Washington' },    { abbr: 'WV', name: 'West Virginia' },
  { abbr: 'WI', name: 'Wisconsin' },     { abbr: 'WY', name: 'Wyoming' },
];

const MIN_AGE = 18;

function calcAge(birthdate: string): number {
  // birthdate is YYYY-MM-DD
  const [year, month, day] = birthdate.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  const m = today.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && today.getDate() < day)) age--;
  return age;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CompleteProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile, refetch } = useProfile();

  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);

  // Step 1
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [bdMonth, setBdMonth] = useState('');
  const [bdDay, setBdDay] = useState('');
  const [bdYear, setBdYear] = useState('');

  // Step 2
  const [city, setCity] = useState(profile?.city ?? '');
  const [state, setState] = useState(profile?.state ?? '');
  const [zip, setZip] = useState(profile?.zip_code ?? '');

  // Refs for auto-advance on birthdate fields
  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  // ── Step 1 validation ────────────────────────────────────────────────────

  const validateStep1 = (): string | null => {
    if (!firstName.trim()) return 'Please enter your first name.';
    if (!lastName.trim()) return 'Please enter your last name.';
    const m = parseInt(bdMonth, 10);
    const d = parseInt(bdDay, 10);
    const y = parseInt(bdYear, 10);
    if (!bdMonth || !bdDay || !bdYear || isNaN(m) || isNaN(d) || isNaN(y)) {
      return 'Please enter your full birthdate.';
    }
    if (m < 1 || m > 12) return 'Month must be between 1 and 12.';
    if (d < 1 || d > 31) return 'Day must be between 1 and 31.';
    if (y < 1900 || y > new Date().getFullYear()) return 'Please enter a valid year.';
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (calcAge(iso) < MIN_AGE) {
      return `You must be at least ${MIN_AGE} years old to use this app.`;
    }
    return null;
  };

  const goToStep2 = () => {
    const err = validateStep1();
    if (err) { Alert.alert('Hold on', err); return; }
    setStep(2);
  };

  // ── Step 2 validation + save ─────────────────────────────────────────────

  const validateStep2 = (): string | null => {
    if (!city.trim()) return 'Please enter your city.';
    if (!state) return 'Please select your state.';
    if (!zip.trim() || zip.trim().length < 5) return 'Please enter a valid ZIP code.';
    return null;
  };

  const save = async () => {
    const err = validateStep2();
    if (err) { Alert.alert('Hold on', err); return; }
    if (!user) return;

    const m = parseInt(bdMonth, 10);
    const d = parseInt(bdDay, 10);
    const y = parseInt(bdYear, 10);
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          email: user.email ?? '',
          display_name: firstName.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          city: city.trim(),
          state,
          zip_code: zip.trim(),
          birthdate: iso,
        },
        { onConflict: 'id' },
      );
      if (error) { Alert.alert('Could not save', error.message); return; }
      await refetch();
      invalidateProfile();
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Progress dots */}
          <View className="mb-6 flex-row justify-center" style={{ gap: 6 }}>
            {[1, 2].map((n) => (
              <View
                key={n}
                style={{
                  width: n === step ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: n <= step ? '#1F4D3A' : '#E4E4E7',
                }}
              />
            ))}
          </View>

          {step === 1 ? (
            <Step1
              firstName={firstName} setFirstName={setFirstName}
              lastName={lastName} setLastName={setLastName}
              bdMonth={bdMonth} setBdMonth={setBdMonth}
              bdDay={bdDay} setBdDay={setBdDay}
              bdYear={bdYear} setBdYear={setBdYear}
              dayRef={dayRef} yearRef={yearRef}
              email={user?.email ?? ''}
            />
          ) : (
            <Step2
              city={city} setCity={setCity}
              state={state} setState={setState}
              zip={zip} setZip={setZip}
              onStatePicker={() => setStatePickerOpen(true)}
            />
          )}

          <View style={{ marginTop: 32, gap: 12 }}>
            {step === 1 ? (
              <Button size="lg" onPress={goToStep2}
                disabled={!firstName.trim() || !lastName.trim() || !bdMonth || !bdDay || !bdYear}
              >
                Next
              </Button>
            ) : (
              <>
                <Button size="lg" onPress={save} loading={saving}
                  disabled={!city.trim() || !state || zip.trim().length < 5 || saving}
                >
                  Continue
                </Button>
                <Button variant="ghost" onPress={() => setStep(1)} disabled={saving}>
                  Back
                </Button>
              </>
            )}
            <Button variant="ghost" onPress={() => signOut()} disabled={saving}>
              Sign out
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* State picker modal */}
      <StatePicker
        visible={statePickerOpen}
        selected={state}
        onSelect={(abbr) => { setState(abbr); setStatePickerOpen(false); }}
        onClose={() => setStatePickerOpen(false)}
      />
    </SafeAreaView>
  );
}

// ─── Step 1 — Name + Birthdate ────────────────────────────────────────────────

function Step1({
  firstName, setFirstName,
  lastName, setLastName,
  bdMonth, setBdMonth,
  bdDay, setBdDay,
  bdYear, setBdYear,
  dayRef, yearRef,
  email,
}: {
  firstName: string; setFirstName: (v: string) => void;
  lastName: string;  setLastName:  (v: string) => void;
  bdMonth: string;   setBdMonth:   (v: string) => void;
  bdDay: string;     setBdDay:     (v: string) => void;
  bdYear: string;    setBdYear:    (v: string) => void;
  // React 19 / @types/react typings: useRef<T>(null) is RefObject<T | null>.
  dayRef: React.RefObject<TextInput | null>;
  yearRef: React.RefObject<TextInput | null>;
  email: string;
}) {
  return (
    <View style={{ gap: 20 }}>
      <View className="mb-2">
        <Text className="text-2xl font-extrabold text-zinc-900">About you</Text>
        <Text className="mt-1 text-sm text-zinc-500">
          This information is used to verify your identity and confirm your eligibility.
        </Text>
      </View>

      <Input
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Jane"
        autoCapitalize="words"
        returnKeyType="next"
      />
      <Input
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        placeholder="Smith"
        autoCapitalize="words"
        returnKeyType="next"
      />

      {/* Email — read-only */}
      <View>
        <Text className="mb-1 text-sm font-semibold text-zinc-700">Email</Text>
        <View className="flex-row items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3" style={{ gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={15} color="#A1A1AA" />
          <Text className="flex-1 text-sm text-zinc-400">{email}</Text>
        </View>
      </View>

      {/* Birthdate */}
      <View>
        <Text className="mb-1 text-sm font-semibold text-zinc-700">
          Date of birth <Text className="font-normal text-zinc-400">(you must be 18+)</Text>
        </Text>
        <View className="flex-row" style={{ gap: 10 }}>
          <View className="flex-1">
            <TextInput
              value={bdMonth}
              onChangeText={(v) => {
                const n = v.replace(/\D/g, '').slice(0, 2);
                setBdMonth(n);
                if (n.length === 2) dayRef.current?.focus();
              }}
              placeholder="MM"
              keyboardType="number-pad"
              maxLength={2}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center text-base text-zinc-900"
              placeholderTextColor="#A1A1AA"
            />
          </View>
          <View className="flex-1">
            <TextInput
              ref={dayRef}
              value={bdDay}
              onChangeText={(v) => {
                const n = v.replace(/\D/g, '').slice(0, 2);
                setBdDay(n);
                if (n.length === 2) yearRef.current?.focus();
              }}
              placeholder="DD"
              keyboardType="number-pad"
              maxLength={2}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center text-base text-zinc-900"
              placeholderTextColor="#A1A1AA"
            />
          </View>
          <View style={{ flex: 1.5 }}>
            <TextInput
              ref={yearRef}
              value={bdYear}
              onChangeText={(v) => setBdYear(v.replace(/\D/g, '').slice(0, 4))}
              placeholder="YYYY"
              keyboardType="number-pad"
              maxLength={4}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center text-base text-zinc-900"
              placeholderTextColor="#A1A1AA"
            />
          </View>
        </View>
        <Text className="mt-1 text-xs text-zinc-400">
          Must be 18 or older to use this app.
        </Text>
      </View>
    </View>
  );
}

// ─── Step 2 — Location ────────────────────────────────────────────────────────

function Step2({
  city, setCity,
  state, setState,
  zip, setZip,
  onStatePicker,
}: {
  city: string; setCity: (v: string) => void;
  state: string; setState: (v: string) => void;
  zip: string; setZip: (v: string) => void;
  onStatePicker: () => void;
}) {
  const selectedState = US_STATES.find((s) => s.abbr === state);
  const [zipLooking, setZipLooking] = useState(false);

  // Auto-fill city + state when a 5-digit ZIP is entered
  const handleZipChange = async (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 10);
    setZip(v);
    if (v.length !== 5) return;
    setZipLooking(true);
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${v}`);
      if (!res.ok) return; // unknown ZIP — leave fields blank
      const data = await res.json();
      const place = data.places?.[0];
      if (place) {
        setCity(place['place name'] ?? '');
        setState(place['state abbreviation'] ?? '');
      }
    } catch {
      // network error — user can fill in manually
    } finally {
      setZipLooking(false);
    }
  };

  return (
    <View style={{ gap: 20 }}>
      <View className="mb-2">
        <Text className="text-2xl font-extrabold text-zinc-900">Your location</Text>
        <Text className="mt-1 text-sm text-zinc-500">
          Enter your ZIP code and we'll fill in your city and state automatically.
        </Text>
      </View>

      {/* ZIP first — drives the auto-fill */}
      <View>
        <Text className="mb-1 text-sm font-semibold text-zinc-700">ZIP code</Text>
        <View className="flex-row items-center rounded-xl border border-zinc-200 bg-white px-4" style={{ gap: 8 }}>
          <TextInput
            value={zip}
            onChangeText={handleZipChange}
            placeholder="e.g. 43201"
            keyboardType="number-pad"
            maxLength={10}
            returnKeyType="done"
            style={{ flex: 1, paddingVertical: 12, fontSize: 16, color: '#18181B' }}
            placeholderTextColor="#A1A1AA"
          />
          {zipLooking && <ActivityIndicator size="small" color="#1F4D3A" />}
          {!zipLooking && city && state && (
            <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
          )}
        </View>
      </View>

      <Input
        label="City"
        value={city}
        onChangeText={setCity}
        placeholder="City"
        autoCapitalize="words"
        returnKeyType="next"
      />

      {/* State picker trigger */}
      <View>
        <Text className="mb-1 text-sm font-semibold text-zinc-700">State</Text>
        <Pressable
          onPress={onStatePicker}
          className="flex-row items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 active:bg-zinc-50"
        >
          <Text className={selectedState ? 'text-base text-zinc-900' : 'text-base text-zinc-400'}>
            {selectedState ? `${selectedState.abbr} — ${selectedState.name}` : 'Select state'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#A1A1AA" />
        </Pressable>
      </View>
    </View>
  );
}

// ─── State picker modal ───────────────────────────────────────────────────────

function StatePicker({
  visible, selected, onSelect, onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (abbr: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
        onPress={onClose}
      />
      <View className="rounded-t-3xl bg-white" style={{ maxHeight: '70%' }}>
        {/* Handle */}
        <View className="pt-3 pb-2 items-center">
          <View className="h-1 w-10 rounded-full bg-zinc-300" />
        </View>
        <Text className="px-5 pb-3 text-base font-bold text-zinc-900">Select your state</Text>
        <FlatList
          data={US_STATES}
          keyExtractor={(s) => s.abbr}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item.abbr)}
              className="flex-row items-center justify-between px-5 py-3 active:bg-zinc-50"
            >
              <Text className="text-base text-zinc-900">{item.name}</Text>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <Text className="text-sm text-zinc-400">{item.abbr}</Text>
                {selected === item.abbr && (
                  <Ionicons name="checkmark" size={18} color="#1F4D3A" />
                )}
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}
