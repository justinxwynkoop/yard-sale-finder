import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ItemCategory } from '../../types';
import { CATEGORY_GROUPS, toggleCategory } from '../../lib/categories';

export interface CategoryPickerProps {
  selected: ItemCategory[];
  onChange: (cats: ItemCategory[]) => void;
}

const chipBase = {
  paddingHorizontal: 14,
  paddingVertical: 7,
  borderRadius: 999,
  backgroundColor: '#F4F4F5',
  borderWidth: 1,
  borderColor: '#E4E4E7',
} as const;
const chipActive = { backgroundColor: '#2D5F3E', borderColor: '#2D5F3E' } as const;
const textBase = { fontSize: 13, fontWeight: '600' as const, color: '#52525B' };
const textActive = { color: '#fff' };

export function CategoryPicker({ selected, onChange }: CategoryPickerProps) {
  return (
    <View style={{ gap: 8 }}>
      {/* Top-level chips */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORY_GROUPS.map((group) => {
          const active = selected.includes(group.value);
          // Show subcategory expansion if parent is active OR if any subcategory is selected
          const subActive = group.subcategories?.some((s) => selected.includes(s.value)) ?? false;
          return (
            <Pressable
              key={group.value}
              onPress={() => onChange(toggleCategory(selected, group.value))}
              style={[chipBase, (active || subActive) && chipActive]}
            >
              <Text style={[textBase, (active || subActive) && textActive]}>{group.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Subcategory rows — shown when parent is active or a subcategory is selected */}
      {CATEGORY_GROUPS.filter(
        (g) =>
          g.subcategories &&
          (selected.includes(g.value) || g.subcategories.some((s) => selected.includes(s.value))),
      ).map((group) => (
        <View key={`${group.value}-subs`} style={{ paddingLeft: 12 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: '#A1A1AA',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {group.label} type
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {group.subcategories!.map((sub) => {
              const active = selected.includes(sub.value);
              return (
                <Pressable
                  key={sub.value}
                  onPress={() => onChange(toggleCategory(selected, sub.value))}
                  style={[chipBase, { paddingHorizontal: 11, paddingVertical: 5 }, active && chipActive]}
                >
                  <Text style={[textBase, { fontSize: 12 }, active && textActive]}>{sub.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
