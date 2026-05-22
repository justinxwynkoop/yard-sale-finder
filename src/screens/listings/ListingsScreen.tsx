import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useListings, ListingFilters, PRICE_RANGES } from '../../hooks/useListings';
import { SaleStackParamList, ListingsStackParamList, ItemCategory, Listing } from '../../types';
import { Chip, EmptyState, IconButton } from '../../components/ui';

type Nav = NativeStackNavigationProp<SaleStackParamList>;
type ListingsNav = NativeStackNavigationProp<ListingsStackParamList>;

const CATEGORIES: { label: string; value: ItemCategory }[] = [
  { label: 'Furniture',   value: 'furniture'   },
  { label: 'Clothing',    value: 'clothing'    },
  { label: 'Electronics', value: 'electronics' },
  { label: 'Toys',        value: 'toys'        },
  { label: 'Tools',       value: 'tools'       },
  { label: 'Books',       value: 'books'       },
  { label: 'Kitchen',     value: 'kitchen'     },
  { label: 'Sports',      value: 'sports'      },
  { label: 'Antiques',    value: 'antiques'    },
  { label: 'Other',       value: 'other'       },
];

export default function ListingsScreen() {
  const navigation = useNavigation<Nav>();

  const [category, setCategory] = useState<ItemCategory | null>(null);
  const [priceRangeIndex, setPriceRangeIndex] = useState<number | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const filters: ListingFilters = useMemo(() => {
    const range = priceRangeIndex !== null ? PRICE_RANGES[priceRangeIndex] : null;
    return {
      category,
      priceMin: range?.min ?? null,
      priceMax: range?.max ?? null,
    };
  }, [category, priceRangeIndex]);

  const { listings, loading, refetch } = useListings(filters);

  const activeFilterCount = (category ? 1 : 0) + (priceRangeIndex !== null ? 1 : 0);

  const clearFilters = useCallback(() => {
    setCategory(null);
    setPriceRangeIndex(null);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="bg-white px-5 pt-4 pb-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-extrabold text-zinc-900">Listings</Text>
            <Text className="text-xs text-zinc-500">
              {loading
                ? 'Loading…'
                : `${listings.length} item${listings.length === 1 ? '' : 's'} near you`}
            </Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            {/* Filter button */}
            <Pressable
              onPress={() => setFilterSheetOpen(true)}
              className="flex-row items-center rounded-xl border border-zinc-200 bg-white px-3 py-2 active:bg-zinc-50"
              style={{ gap: 6 }}
            >
              <Ionicons name="options-outline" size={18} color="#18181B" />
              <Text className="text-sm font-semibold text-zinc-800">Filter</Text>
              {activeFilterCount > 0 && (
                <View className="h-5 w-5 items-center justify-center rounded-full bg-brand">
                  <Text className="text-xs font-bold text-white">{activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
            {/* Post a listing */}
            <IconButton
              variant="brand"
              size="md"
              onPress={() => navigation.navigate('CreateListing')}
              icon={<Ionicons name="add" size={22} color="#fff" />}
            />
          </View>
        </View>

        {/* Active filter summary chips */}
        {activeFilterCount > 0 && (
          <View className="mt-3 flex-row flex-wrap items-center" style={{ gap: 6 }}>
            {category && (
              <ActiveFilterChip
                label={CATEGORIES.find((c) => c.value === category)?.label ?? category}
                onRemove={() => setCategory(null)}
              />
            )}
            {priceRangeIndex !== null && (
              <ActiveFilterChip
                label={PRICE_RANGES[priceRangeIndex].label}
                onRemove={() => setPriceRangeIndex(null)}
              />
            )}
            <Pressable onPress={clearFilters}>
              <Text className="text-xs font-semibold text-brand-600">Clear all</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* List — always a FlatList so pull-to-refresh works in every state */}
      <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        numColumns={2}
        contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}
        columnWrapperStyle={{ gap: 10 }}
        onRefresh={refetch}
        refreshing={loading}
        renderItem={({ item }) => <ListingCard listing={item} />}
        ListEmptyComponent={
          loading ? (
            <View className="flex-1 items-center justify-center py-24">
              <ActivityIndicator size="large" color="#F97316" />
            </View>
          ) : (
            <EmptyState
              icon={<Ionicons name="storefront-outline" size={36} color="#F97316" />}
              title="No listings found"
              description={
                activeFilterCount > 0
                  ? 'Try adjusting or clearing your filters.'
                  : 'Be the first to list an item in your area.'
              }
              action={
                activeFilterCount > 0 ? (
                  <Pressable onPress={clearFilters} className="rounded-xl bg-brand px-6 py-3">
                    <Text className="font-bold text-white">Clear filters</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => navigation.navigate('CreateListing')}
                    className="rounded-xl bg-brand px-6 py-3"
                  >
                    <Text className="font-bold text-white">Post an item</Text>
                  </Pressable>
                )
              }
            />
          )
        }
      />

      {/* Filter bottom sheet */}
      <FilterSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        category={category}
        onCategoryChange={setCategory}
        priceRangeIndex={priceRangeIndex}
        onPriceRangeChange={setPriceRangeIndex}
        onClear={clearFilters}
      />
    </SafeAreaView>
  );
}

// ── Listing card (2-column grid) ───────────────────────────────────────────

function ListingCard({ listing }: { listing: Listing }) {
  const navigation = useNavigation<ListingsNav>();
  const firstImage = listing.media?.find((m) => m.type === 'image');

  return (
    <Pressable
      className="flex-1 overflow-hidden rounded-2xl bg-white shadow-sm active:opacity-80"
      style={{ maxWidth: '50%' }}
      onPress={() => navigation.navigate('ListingDetail', { listingId: listing.id })}
    >
      {/* Photo */}
      <View style={{ height: 140 }}>
        {firstImage ? (
          <Image
            source={{ uri: firstImage.url }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View className="h-full w-full items-center justify-center bg-zinc-100">
            <Ionicons name="image-outline" size={32} color="#A1A1AA" />
          </View>
        )}
      </View>

      {/* Info */}
      <View className="p-3" style={{ gap: 2 }}>
        <Text className="text-sm font-bold text-zinc-900" numberOfLines={2}>
          {listing.title}
        </Text>
        <Text className="text-base font-extrabold text-brand-600">
          {listing.price === 0 ? 'Free' : `$${listing.price % 1 === 0 ? listing.price : listing.price.toFixed(2)}`}
        </Text>
        {listing.categories.length > 0 && (
          <Text className="text-xs text-zinc-400 capitalize">
            {listing.categories[0]}
          </Text>
        )}
        <View className="mt-1 flex-row items-center" style={{ gap: 3 }}>
          <Ionicons name="location-outline" size={11} color="#A1A1AA" />
          <Text className="text-xs text-zinc-400" numberOfLines={1}>
            {listing.pickup_display}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── Active filter chip ─────────────────────────────────────────────────────

function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View className="flex-row items-center rounded-full bg-brand-50 px-3 py-1" style={{ gap: 4 }}>
      <Text className="text-xs font-semibold text-brand-700">{label}</Text>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Ionicons name="close" size={13} color="#C2410C" />
      </Pressable>
    </View>
  );
}

// ── Filter bottom sheet ────────────────────────────────────────────────────

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  category: ItemCategory | null;
  onCategoryChange: (c: ItemCategory | null) => void;
  priceRangeIndex: number | null;
  onPriceRangeChange: (i: number | null) => void;
  onClear: () => void;
}

function FilterSheet({
  visible,
  onClose,
  category,
  onCategoryChange,
  priceRangeIndex,
  onPriceRangeChange,
  onClear,
}: FilterSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable
        className="flex-1 bg-black/40"
        onPress={onClose}
      />

      {/* Sheet */}
      <View className="rounded-t-3xl bg-white px-5 pb-10 pt-4">
        {/* Handle */}
        <View className="mb-4 self-center h-1 w-10 rounded-full bg-zinc-300" />

        {/* Title row */}
        <View className="mb-5 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-zinc-900">Filter listings</Text>
          <Pressable onPress={onClear}>
            <Text className="text-sm font-semibold text-brand-600">Clear all</Text>
          </Pressable>
        </View>

        {/* Category */}
        <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Category
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          className="mb-5"
        >
          <Chip
            label="All"
            size="sm"
            active={!category}
            onPress={() => onCategoryChange(null)}
          />
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat.value}
              label={cat.label}
              size="sm"
              active={category === cat.value}
              onPress={() => onCategoryChange(category === cat.value ? null : cat.value)}
            />
          ))}
        </ScrollView>

        {/* Price range */}
        <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Price range
        </Text>
        <View className="mb-6 flex-row flex-wrap" style={{ gap: 8 }}>
          {PRICE_RANGES.map((range, i) => (
            <Chip
              key={range.label}
              label={range.label}
              size="sm"
              active={priceRangeIndex === i}
              onPress={() => onPriceRangeChange(priceRangeIndex === i ? null : i)}
            />
          ))}
        </View>

        {/* Apply */}
        <Pressable
          onPress={onClose}
          className="items-center rounded-2xl bg-brand py-4 active:opacity-80"
        >
          <Text className="text-base font-bold text-white">Show results</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
