import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { ItemCategory } from '../types';

const CATEGORIES: { label: string; value: ItemCategory }[] = [
  { label: 'Furniture', value: 'furniture' },
  { label: 'Clothing', value: 'clothing' },
  { label: 'Electronics', value: 'electronics' },
  { label: 'Toys', value: 'toys' },
  { label: 'Tools', value: 'tools' },
  { label: 'Books', value: 'books' },
  { label: 'Kitchen', value: 'kitchen' },
  { label: 'Sports', value: 'sports' },
  { label: 'Antiques', value: 'antiques' },
  { label: 'Other', value: 'other' },
];

interface Props {
  selected: string | null;
  onSelect: (cat: string | null) => void;
}

export default function FilterBar({ selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      style={styles.container}
    >
      <Chip label="All" active={!selected} onPress={() => onSelect(null)} />
      {CATEGORIES.map(cat => (
        <Chip
          key={cat.value}
          label={cat.label}
          active={selected === cat.value}
          onPress={() => onSelect(selected === cat.value ? null : cat.value)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginHorizontal: 16,
  },
  scroll: {
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  chipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  chipText: {
    fontSize: 13,
    color: '#444',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
  },
});
