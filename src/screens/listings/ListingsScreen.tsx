import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useListings, ListingFilters, PRICE_RANGES } from '../../hooks/useListings';
import { useFavoriteListings } from '../../hooks/useFavoriteListings';
import { ListingsStackParamList, ItemCategory, Listing } from '../../types';
import { EmptyState, IconButton, CategoryPicker } from '../../components/ui';

/** Returns true if the listing was created within the last 3 days. */
function isNew(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 3 * 24 * 60 * 60 * 1000;
}

// ListingsScreen lives in ListingsStack -- the Nav type must match
// the stack the screen is actually mounted in, otherwise
// navigation.navigate('CreateListing') is a TypeScript-clean silent
// no-op at runtime because the route doesn't resolve in the current
// stack. CreateListing/EditListing are now registered on both stacks
// (here AND on SaleStack), so this resolves locally.
type Nav = NativeStackNavigationProp<ListingsStackParamList>;


export default function ListingsScreen() {
  const navigation = useNavigation<Nav>();

  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [priceRangeIndex, setPriceRangeIndex] = useState<number | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const filters: ListingFilters = useMemo(() => {
    const range = priceRangeIndex !== null ? PRICE_RANGES[priceRangeIndex] : null;
    return {
      category: categories.length > 0 ? categories[0] : null,
      categories: categories.length > 0 ? categories : undefined,
      priceMin: range?.min ?? null,
      priceMax: range?.max ?? null,
    };
  }, [categories, priceRangeIndex]);

  const { listings, loading, refetch } = useListings(filters);
  const { isFavorited } = useFavoriteListings();

  const activeFilterCount = (categories.length > 0 ? 1 : 0) + (priceRangeIndex !== null ? 1 : 0);

  const clearFilters = useCallback(() => {
    setCategories([]);
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
            {/* Heart → saved listings (items the user favorited in this tab) */}
            <Pressable
              onPress={() => navigation.navigate('SavedListings')}
              accessibilityRole="button"
              accessibilityLabel="Saved listings"
              className="h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white active:bg-zinc-50"
            >
              <Ionicons name="heart-outline" size={20} color="#18181B" />
            </Pressable>
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
            {categories.length > 0 && (
              <ActiveFilterChip
                label={`${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
                onRemove={() => setCategories([])}
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
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            favorited={isFavorited(item.id)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View className="flex-1 items-center justify-center py-24">
              <ActivityIndicator size="large" color="#2D5F3E" />
            </View>
          ) : (
            <EmptyState
              icon={<Ionicons name="storefront-outline" size={36} color="#2D5F3E" />}
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
        categories={categories}
        onCategoriesChange={setCategories}
        priceRangeIndex={priceRangeIndex}
        onPriceRangeChange={setPriceRangeIndex}
        onClear={clearFilters}
      />
    </SafeAreaView>
  );
}

// ── Listing card (2-column grid) ───────────────────────────────────────────

function ListingCard({
  listing,
  favorited,
}: {
  listing: Listing;
  favorited: boolean;
}) {
  const navigation = useNavigation<Nav>();
  const firstImage = listing.media?.find((m) => m.type === 'image');
  const showNew = isNew(listing.created_at);

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

        {/* "New" badge — top-left, shown for first 3 days */}
        {showNew && (
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              backgroundColor: '#2D5F3E',
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>
              NEW
            </Text>
          </View>
        )}

        {/* Heart badge — top-right, shown when the user has favorited this listing */}
        {favorited && (
          <View
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: 'rgba(0,0,0,0.38)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="heart" size={14} color="#FF6B6B" />
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
  categories: ItemCategory[];
  onCategoriesChange: (cats: ItemCategory[]) => void;
  priceRangeIndex: number | null;
  onPriceRangeChange: (i: number | null) => void;
  onClear: () => void;
}

const filterChipStyle = {
  base: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  } as const,
  active: {
    backgroundColor: '#2D5F3E',
    borderColor: '#2D5F3E',
  } as const,
  text: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#52525B',
  },
  textActive: {
    color: '#fff',
  },
};

function FilterSheet({
  visible,
  onClose,
  categories,
  onCategoriesChange,
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
          <Text className="text-lg font-bold text-zinc-900">Filters</Text>
          <Pressable onPress={onClear}>
            <Text className="text-sm font-semibold text-brand-600">Clear all</Text>
          </Pressable>
        </View>

        {/* Category */}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: '#A1A1AA',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 10,
          }}
        >
          Category
        </Text>
        <View style={{ marginBottom: 20 }}>
          <CategoryPicker selected={categories} onChange={onCategoriesChange} />
        </View>

        {/* Price range */}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: '#A1A1AA',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 10,
          }}
        >
          Price
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {PRICE_RANGES.map((range, i) => {
            const active = priceRangeIndex === i;
            return (
              <Pressable
                key={range.label}
                onPress={() => onPriceRangeChange(active ? null : i)}
                style={[filterChipStyle.base, active && filterChipStyle.active]}
              >
                <Text style={[filterChipStyle.text, active && filterChipStyle.textActive]}>
                  {range.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => { onClear(); onClose(); }}
            className="flex-1 items-center rounded-2xl border border-zinc-200 bg-white py-4 active:bg-zinc-50"
          >
            <Text className="text-base font-semibold text-zinc-700">Reset</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            className="flex-1 items-center rounded-2xl bg-brand py-4 active:opacity-80"
          >
            <Text className="text-base font-bold text-white">Show Results</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
