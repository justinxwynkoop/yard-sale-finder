import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { CATEGORY_GROUPS } from '../../lib/categories';
import { ItemCategory } from '../../types';
import {
  ListingsFilters,
  PriceBucket,
  countActiveListingsFilters,
  getListingsFilters,
  priceBucketToRange,
  resetListingsFilters,
  setListingsFilters,
} from '../../lib/listingsFilters';
import { useListings } from '../../hooks/useListings';
import { HeaderButton } from '../../components/ui';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

const DISTANCE_TICKS = [1, 5, 10, 15, 25] as const;
const PRICE_OPTIONS: { value: PriceBucket; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'under10', label: 'Under $10' },
  { value: '10-50', label: '$10–$50' },
  { value: '50-100', label: '$50–$100' },
  { value: '100plus', label: '$100+' },
];

/**
 * Modal filter sheet for the One-off items segment of the Listings tab.
 * Mirrors the Map FilterSheet's visual language: distance, then price
 * buckets, then categories. Live-counts the matches and applies on
 * "Show N items".
 */
export default function ListingsFilterSheet() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [draft, setDraft] = useState<ListingsFilters>(() => getListingsFilters());

  // For the live count, fetch with the DRAFT filters so the CTA reflects
  // what the user would see after applying. The hook will refetch as the
  // draft changes.
  const range = useMemo(() => priceBucketToRange(draft.priceBucket), [
    draft.priceBucket,
  ]);
  const { listings } = useListings({
    category: null,
    categories: draft.categories,
    priceMin: range.min,
    priceMax: range.max,
  });

  const updateDraft = (patch: Partial<ListingsFilters>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const toggleCat = (cat: ItemCategory) =>
    setDraft((d) => {
      const next = new Set(d.categories);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return { ...d, categories: Array.from(next) };
    });

  const handleApply = () => {
    setListingsFilters(draft);
    navigation.goBack();
  };

  const handleReset = () => {
    resetListingsFilters();
    setDraft(getListingsFilters());
  };

  const activeCount = countActiveListingsFilters(draft);

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      {/* Header */}
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
          Filter items {activeCount > 0 ? `· ${activeCount}` : ''}
        </Text>
        <Pressable onPress={handleReset} hitSlop={10}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: BRAND }}>
            Reset
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
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

        {/* Price */}
        <SectionTitle style={{ marginTop: 22 }}>Price</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
          {PRICE_OPTIONS.map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              active={draft.priceBucket === opt.value}
              onPress={() =>
                updateDraft({
                  priceBucket:
                    draft.priceBucket === opt.value ? null : opt.value,
                })
              }
            />
          ))}
        </View>

        {/* Categories */}
        <SectionTitle style={{ marginTop: 22 }}>Categories</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
          {CATEGORY_GROUPS.map((group) => (
            <GridChip
              key={group.value}
              label={group.label}
              active={draft.categories.includes(group.value)}
              onPress={() => toggleCat(group.value)}
            />
          ))}
        </View>
      </ScrollView>

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
            Show {listings.length} {listings.length === 1 ? 'item' : 'items'}
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
