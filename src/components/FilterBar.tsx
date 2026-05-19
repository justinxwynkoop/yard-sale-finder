import React from 'react';
import { ScrollView } from 'react-native';
import { Chip } from './ui';
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
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 4 }}
    >
      <Chip label="All" active={!selected} onPress={() => onSelect(null)} size="sm" />
      {CATEGORIES.map((cat) => (
        <Chip
          key={cat.value}
          label={cat.label}
          size="sm"
          active={selected === cat.value}
          onPress={() => onSelect(selected === cat.value ? null : cat.value)}
        />
      ))}
    </ScrollView>
  );
}
