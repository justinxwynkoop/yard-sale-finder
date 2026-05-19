import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { SaleStackParamList, ItemCategory, SaleStatus } from '../../types';
import {
  Button,
  Chip,
  DateRangePresets,
  DateTimeField,
  Input,
} from '../../components/ui';

type Route = RouteProp<SaleStackParamList, 'EditSale'>;

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

const STATUSES: { value: SaleStatus; label: string }[] = [
  { value: 'active', label: 'Live now' },
  { value: 'winding_down', label: 'Winding down' },
  { value: 'ended', label: 'Ended' },
];

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;
const MAX_PRICING = 200;

export default function EditSaleScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { saleId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<ItemCategory[]>([]);
  const [pricingNotes, setPricingNotes] = useState('');
  const [status, setStatus] = useState<SaleStatus>('active');

  useEffect(() => {
    supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .single()
      .then(({ data }) => {
        if (data) {
          setTitle(data.title);
          setDescription(data.description ?? '');
          setStartDate(data.start_date);
          setEndDate(data.end_date);
          // Supabase time columns can return 'HH:MM:SS' — trim to HH:MM
          setStartTime((data.start_time ?? '').slice(0, 5));
          setEndTime((data.end_time ?? '').slice(0, 5));
          setSelectedCategories(data.categories ?? []);
          setPricingNotes(data.pricing_notes ?? '');
          setStatus(data.status);
        }
        setLoading(false);
      });
  }, [saleId]);

  const toggleCategory = (cat: ItemCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('Title required');
      return;
    }
    if (endDate < startDate) {
      Alert.alert('Date issue', 'End date must be after start date.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('sales')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        categories: selectedCategories,
        pricing_notes: pricingNotes.trim() || null,
        status,
      })
      .eq('id', saleId);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    navigation.goBack();
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 16 }}>
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
