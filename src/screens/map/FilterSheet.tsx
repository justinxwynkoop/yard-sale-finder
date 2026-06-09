import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import {
  MapFilters,
  VibeTag,
  WhenFilter,
  countActiveFilters,
  getMapFilters,
  resetMapFilters,
  setMapFilters,
} from '../../lib/mapFilters';
import { CATEGORY_GROUPS } from '../../lib/categories';
import { ItemCategory } from '../../types';
import { useSales } from '../../hooks/useSales';
import { isOpenNow } from '../../utils/saleStatus';
import { HeaderButton } from '../../components/ui';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

const DISTANCE_TICKS = [1, 5, 10, 15, 25] as const;
const WHEN_OPTIONS: { value: Exclude<WhenFilter, null>; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'next_weekend', label: 'Next weekend' },
];
const VIBE_OPTIONS: { value: VibeTag; label: string }[] = [
  { value: 'early_bird', label: 'Early-bird welcome' },
  { value: 'cash_only', label: 'Cash only' },
  { value: 'block_sale', label: 'Block sale' },
  { value: 'estate', label: 'Estate' },
  { value: 'moving', label: 'Moving sale' },
];

export default function FilterSheet() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { sales } = useSales();

  // Editable copy — only commit to the store when the user taps "Show".
  const [draft, setDraft] = useState<MapFilters>(getMapFilters());

  const updateDraft = (patch: Partial<MapFilters>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const toggleCat = (cat: ItemCategory) => {
    setDraft((d) => {
      const next = new Set(d.categories);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return { ...d, categories: Array.from(next) };
    });
  };

  const toggleVibe = (vibe: VibeTag) => {
    setDraft((d) => {
      const next = new Set(d.vibeTags);
      if (next.has(vibe)) next.delete(vibe);
      else next.add(vibe);
      return { ...d, vibeTags: Array.from(next) };
    });
  };

  // Live preview count — how many sales match the draft filters.
  const matchCount = useMemo(() => {
    return sales.filter((s) => {
      if (draft.openNow && !isOpenNow(s)) return false;
      if (
        draft.categories.length > 0 &&
        !s.categories.some((c) => draft.categories.includes(c))
      )
        return false;
      if (
        draft.vibeTags.length > 0 &&
        !(s.vibe_tags ?? []).some((v) => draft.vibeTags.includes(v as VibeTag))
      )
        return false;
      return true;
    }).length;
  }, [sales, draft]);

  const handleApply = () => {
    setMapFilters(draft);
    navigation.goBack();
  };

  const handleReset = () => {
    resetMapFilters();
    setDraft(getMapFilters());
  };

  const activeCount = countActiveFilters(draft);

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      {/* Header card */}
      <View
        style={{
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: HAIRLINE,
          paddingTop: insets.top + 4,
          paddingBottom: 14,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <HeaderButton
          onPress={() => navigation.goBack()}
          icon="close"
          variant="tile"
          accessibilityLabel="Close"
        />
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: '700',
            color: INK,
          }}
        >
          Filters {activeCount > 0 ? `· ${activeCount}` : ''}
        </Text>
        <Pressable onPress={handleReset} hitSlop={10}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: BRAND }}>
            Reset
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 140,
        }}
      >
        {/* Distance */}
        <SectionTitle>Distance</SectionTitle>
        <View style={{ marginTop: 8 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: BRAND,
              fontVariant: ['tabular-nums'],
            }}
          >
            {draft.radiusMiles != null ? `${draft.radiusMiles} mi` : 'Any'}
          </Text>
        </View>
        <View
          style={{
            marginTop: 12,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          {DISTANCE_TICKS.map((mi) => {
            const active = draft.radiusMiles === mi;
            return (
              <Pressable
                key={mi}
                onPress={() =>
                  updateDraft({ radiusMiles: active ? null : mi })
                }
                style={{
                  flex: 1,
                  marginHorizontal: 3,
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderRadius: 12,
                  backgroundColor: active ? BRAND : '#fff',
                  borderWidth: 1,
                  borderColor: active ? BRAND : HAIRLINE,
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: active ? '#fff' : INK,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {mi}
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '600',
                    color: active ? 'rgba(255,255,255,0.8)' : INK_MUTED,
                    marginTop: 2,
                  }}
                >
                  mi
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* When */}
        <SectionTitle style={{ marginTop: 22 }}>When</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
          <ToggleChip
            label="Open now"
            active={draft.openNow}
            onPress={() => updateDraft({ openNow: !draft.openNow })}
          />
          {WHEN_OPTIONS.map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              active={draft.when === opt.value}
              onPress={() =>
                updateDraft({
                  when: draft.when === opt.value ? null : opt.value,
                })
              }
            />
          ))}
        </View>

        {/* Categories */}
        <SectionTitle style={{ marginTop: 22 }}>Categories</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
          {CATEGORY_GROUPS.map((group) => {
            const active = draft.categories.includes(group.value);
            return (
              <GridChip
                key={group.value}
                label={group.label}
                active={active}
                onPress={() => toggleCat(group.value)}
              />
            );
          })}
        </View>

        {/* Vibe */}
        <SectionTitle style={{ marginTop: 22 }}>Vibe</SectionTitle>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10 }}
        >
          {VIBE_OPTIONS.map((opt) => {
            const active = draft.vibeTags.includes(opt.value);
            return (
              <ToggleChip
                key={opt.value}
                label={opt.label}
                active={active}
                onPress={() => toggleVibe(opt.value)}
              />
            );
          })}
        </ScrollView>
      </ScrollView>

      {/* Sticky CTA */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: HAIRLINE,
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 12) + 14,
        }}
      >
        <Pressable
          onPress={handleApply}
          accessibilityRole="button"
          style={{
            backgroundColor: BRAND,
            borderRadius: 18,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
            Show {matchCount} {matchCount === 1 ? 'sale' : 'sales'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SectionTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <Text
      style={[
        {
          fontSize: 14,
          fontWeight: '700',
          color: INK,
          letterSpacing: -0.2,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 99,
        backgroundColor: active ? BRAND : '#fff',
        borderWidth: 1,
        borderColor: active ? BRAND : HAIRLINE,
        marginRight: 8,
        marginBottom: 8,
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: active ? '#fff' : INK,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GridChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: active ? BRAND_SOFT : '#fff',
        borderWidth: 1,
        borderColor: active ? BRAND : HAIRLINE,
        marginRight: 8,
        marginBottom: 8,
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: active ? BRAND : INK,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
