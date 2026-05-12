import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { SaleStackParamList, ItemCategory, SaleStatus } from '../../types';

type Route = RouteProp<SaleStackParamList, 'EditSale'>;

const CATEGORIES: ItemCategory[] = [
  'furniture', 'clothing', 'electronics', 'toys', 'tools',
  'books', 'kitchen', 'sports', 'antiques', 'other',
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
    supabase.from('sales').select('*').eq('id', saleId).single().then(({ data }) => {
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
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const save = async () => {
    if (!title.trim()) { Alert.alert('Title required'); return; }
    setSaving(true);
    const { error } = await supabase.from('sales').update({
      title: title.trim(),
      description: description.trim() || null,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      categories: selectedCategories,
      pricing_notes: pricingNotes.trim() || null,
      status,
    }).eq('id', saleId);
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    navigation.goBack();
  };

  if (loading) return <View style={s.centered}><ActivityIndicator size="large" color="#2563EB" /></View>;

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Label text="Sale Title *" />
          <TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={80} />

          <Label text="Description" />
          <TextInput style={[s.input, s.textArea]} value={description} onChangeText={setDescription} multiline numberOfLines={3} />

          <Label text="Start Date (YYYY-MM-DD)" />
          <TextInput style={s.input} value={startDate} onChangeText={setStartDate} keyboardType="numeric" />

          <Label text="End Date (YYYY-MM-DD)" />
          <TextInput style={s.input} value={endDate} onChangeText={setEndDate} keyboardType="numeric" />

          <Label text="Start Time (HH:MM)" />
          <TextInput style={s.input} value={startTime} onChangeText={setStartTime} keyboardType="numeric" />

          <Label text="End Time (HH:MM)" />
          <TextInput style={s.input} value={endTime} onChangeText={setEndTime} keyboardType="numeric" />

          <Label text="Categories" />
          <View style={s.catGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[s.catChip, selectedCategories.includes(cat) && s.catChipActive]}
                onPress={() => toggleCategory(cat)}
              >
                <Text style={[s.catChipText, selectedCategories.includes(cat) && s.catChipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Label text="Pricing Notes" />
          <TextInput style={s.input} value={pricingNotes} onChangeText={setPricingNotes} />

          <Label text="Status" />
          <View style={s.statusRow}>
            {(['active', 'winding_down', 'ended'] as SaleStatus[]).map(st => (
              <TouchableOpacity
                key={st}
                style={[s.statusChip, status === st && s.statusChipActive]}
                onPress={() => setStatus(st)}
              >
                <Text style={[s.statusChipText, status === st && s.statusChipTextActive]}>
                  {st === 'winding_down' ? 'Winding Down' : st.charAt(0).toUpperCase() + st.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={s.label}>{text}</Text>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#1a1a1a' },
  textArea: { height: 80, textAlignVertical: 'top' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  catChip: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  catChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  catChipText: { fontSize: 13, color: '#374151', textTransform: 'capitalize' },
  catChipTextActive: { color: '#fff' },
  statusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusChip: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  statusChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  statusChipText: { fontSize: 13, color: '#374151' },
  statusChipTextActive: { color: '#fff' },
  saveBtn: { marginTop: 24, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
