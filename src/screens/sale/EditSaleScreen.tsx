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
import { Button, Chip, Input } from '../../components/ui';

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
          setStartTime(data.start_time);
          setEndTime(data.end_time);
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
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Input
            label="Sale title"
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            inputClassName="h-24 pt-2"
          />
          <View className="flex-row" style={{ gap: 10 }}>
            <View className="flex-1">
              <Input
                label="Start date"
                hint="YYYY-MM-DD"
                value={startDate}
                onChangeText={setStartDate}
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <Input
                label="End date"
                hint="YYYY-MM-DD"
                value={endDate}
                onChangeText={setEndDate}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View className="flex-row" style={{ gap: 10 }}>
            <View className="flex-1">
              <Input
                label="Start time"
                hint="HH:MM"
                value={startTime}
                onChangeText={setStartTime}
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <Input
                label="End time"
                hint="HH:MM"
                value={endTime}
                onChangeText={setEndTime}
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
          />

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
