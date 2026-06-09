import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Alert,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useMySales } from '../../hooks/useSales';
import { useMyListings } from '../../hooks/useListings';
import { supabase } from '../../lib/supabase';
import { PLACEHOLDER_BLURHASH, transformedImageUrl } from '../../lib/imageUrl';
import { Listing, Sale, ProfileStackParamList, SaleStatus } from '../../types';
import { formatSaleDate, formatSaleTime } from '../../utils/format';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  Input,
  SaleCardSkeleton,
  StatusBadge,
} from '../../components/ui';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'MySalesHome'>;
type RouteProps = RouteProp<ProfileStackParamList, 'MySalesHome'>;
type Tab = 'sales' | 'listings';
type Filter = 'all' | 'active' | 'winding_down' | 'ended';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Live' },
  { key: 'winding_down', label: 'Ending soon' },
  { key: 'ended', label: 'Ended' },
];

export default function MySalesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const { user } = useAuth();
  // initialTab lets the Profile "Yard Sales" and "Listings" rows open directly
  // on the right tab without requiring the user to switch manually.
  const [activeTab, setActiveTab] = useState<Tab>(route.params?.initialTab ?? 'sales');

  const { sales, loading: salesLoading, refetch: refetchSales } = useMySales(user?.id);
  const { listings, loading: listingsLoading, refetch: refetchListings } = useMyListings(user?.id);

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => ({
    all: sales.length,
    active: sales.filter((s) => s.status === 'active').length,
    winding_down: sales.filter((s) => s.status === 'winding_down').length,
    ended: sales.filter((s) => s.status === 'ended').length,
  }), [sales]);

  const filteredSales = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.categories.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [sales, filter, query]);

  const filteredListings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) =>
      l.title.toLowerCase().includes(q) ||
      l.pickup_display.toLowerCase().includes(q) ||
      (l.description ?? '').toLowerCase().includes(q)
    );
  }, [listings, query]);

  const updateStatus = async (saleId: string, status: SaleStatus) => {
    await supabase.from('sales').update({ status }).eq('id', saleId);
    refetchSales();
  };

  const confirmEndSale = (sale: Sale) => {
    Alert.alert(
      'End this sale?',
      `"${sale.title}" will no longer appear on the discovery map.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End sale', style: 'destructive', onPress: () => updateStatus(sale.id, 'ended') },
      ],
    );
  };

  const deleteSale = (sale: Sale) => {
    Alert.alert(
      'Delete sale?',
      `"${sale.title}" will be permanently removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (user) {
              const folder = `${user.id}/${sale.id}`;
              try {
                const { data: files } = await supabase.storage.from('sale-media').list(folder);
                const paths = (files ?? []).map((f) => `${folder}/${f.name}`);
                if (paths.length > 0) await supabase.storage.from('sale-media').remove(paths);
              } catch { /* best-effort */ }
            }
            await supabase.from('sales').delete().eq('id', sale.id);
            refetchSales();
          },
        },
      ],
    );
  };

  const markListingSold = async (listing: Listing) => {
    await supabase.from('listings').update({ status: 'sold' }).eq('id', listing.id);
    refetchListings();
  };

  const markListingAvailable = async (listing: Listing) => {
    await supabase.from('listings').update({ status: 'available' }).eq('id', listing.id);
    refetchListings();
  };

  const deleteListing = (listing: Listing) => {
    Alert.alert(
      'Delete listing?',
      `"${listing.title}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (user) {
              const folder = `${user.id}/${listing.id}`;
              try {
                const { data: files } = await supabase.storage.from('listing-media').list(folder);
                const paths = (files ?? []).map((f) => `${folder}/${f.name}`);
                if (paths.length > 0) await supabase.storage.from('listing-media').remove(paths);
              } catch { /* best-effort */ }
            }
            await supabase.from('listings').delete().eq('id', listing.id);
            refetchListings();
          },
        },
      ],
    );
  };

  const loading = activeTab === 'sales' ? salesLoading : listingsLoading;
  const isEmpty = activeTab === 'sales' ? sales.length === 0 : listings.length === 0;
  const isFilteredEmpty = activeTab === 'sales' ? filteredSales.length === 0 : filteredListings.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="bg-white px-5 pt-4 pb-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-extrabold text-zinc-900">My sales</Text>
            <Text className="text-xs text-zinc-500">
              {activeTab === 'sales'
                ? sales.length === 0 ? 'Nothing posted yet' : `${sales.length} ${sales.length === 1 ? 'sale' : 'sales'} total`
                : listings.length === 0 ? 'No listings yet' : `${listings.length} ${listings.length === 1 ? 'listing' : 'listings'} total`}
            </Text>
          </View>
          <IconButton
            variant="brand"
            size="md"
            onPress={() => activeTab === 'sales' ? navigation.navigate('CreateSale') : navigation.navigate('CreateListing')}
            icon={<Ionicons name="add" size={24} color="#fff" />}
          />
        </View>

        {/* Yard Sales / Listings toggle */}
        <View className="mt-4 flex-row rounded-xl bg-zinc-100 p-1">
          <Pressable
            onPress={() => { setActiveTab('sales'); setQuery(''); setFilter('all'); }}
            className="flex-1 rounded-lg py-2 items-center"
            style={{ backgroundColor: activeTab === 'sales' ? '#fff' : 'transparent' }}
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: activeTab === 'sales' ? '#18181B' : '#71717A' }}
            >
              Yard Sales
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setActiveTab('listings'); setQuery(''); setFilter('all'); }}
            className="flex-1 rounded-lg py-2 items-center"
            style={{ backgroundColor: activeTab === 'listings' ? '#fff' : 'transparent' }}
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: activeTab === 'listings' ? '#18181B' : '#71717A' }}
            >
              Listings
            </Text>
          </Pressable>
        </View>

        {/* Search + filter chips (sales only) */}
        {!isEmpty && (
          <>
            <View className="mt-3">
              <Input
                placeholder={activeTab === 'sales' ? 'Search your sales' : 'Search your listings'}
                value={query}
                onChangeText={setQuery}
                leftIcon={<Ionicons name="search" size={18} color="#71717A" />}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {activeTab === 'sales' && (
              <View className="mt-3 flex-row" style={{ gap: 6 }}>
                {FILTERS.map((f) => (
                  <Chip
                    key={f.key}
                    label={`${f.label}${counts[f.key] ? ` · ${counts[f.key]}` : ''}`}
                    size="sm"
                    active={filter === f.key}
                    onPress={() => setFilter(f.key)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </View>

      {/* Content */}
      {loading && isEmpty ? (
        <View style={{ padding: 16, gap: 12 }}>
          <SaleCardSkeleton />
          <SaleCardSkeleton />
          <SaleCardSkeleton />
        </View>
      ) : activeTab === 'sales' ? (
        sales.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="pricetag-outline" size={32} color="#1F4D3A" />}
            title="Host your first yard sale"
            description="Pin a location, snap a few photos, and you're on the map."
            action={
              <Button size="lg" onPress={() => navigation.navigate('CreateSale')} leftIcon={<Ionicons name="add" size={20} color="#fff" />}>
                Post a sale
              </Button>
            }
          />
        ) : isFilteredEmpty ? (
          <EmptyState
            icon={<Ionicons name="filter-outline" size={28} color="#1F4D3A" />}
            title={`No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} sales`}
            description="Try a different filter or post a new sale."
          />
        ) : (
          <FlatList
            data={filteredSales}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onRefresh={refetchSales}
            refreshing={salesLoading}
            renderItem={({ item }) => (
              <SaleCard
                sale={item}
                onUpdateStatus={updateStatus}
                onEndSale={() => confirmEndSale(item)}
                onDelete={() => deleteSale(item)}
                onEdit={() => navigation.navigate('EditSale', { saleId: item.id })}
                onView={() => navigation.navigate('EditSale', { saleId: item.id })}
              />
            )}
          />
        )
      ) : (
        listings.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="storefront-outline" size={32} color="#1F4D3A" />}
            title="Post your first listing"
            description="Add a photo, set a price, and let buyers find your items."
            action={
              <Button size="lg" onPress={() => navigation.navigate('CreateListing')} leftIcon={<Ionicons name="add" size={20} color="#fff" />}>
                Post a listing
              </Button>
            }
          />
        ) : isFilteredEmpty ? (
          <EmptyState
            icon={<Ionicons name="search-outline" size={28} color="#1F4D3A" />}
            title="No listings match"
            description="Try a different search term."
          />
        ) : (
          <FlatList
            data={filteredListings}
            keyExtractor={(l) => l.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onRefresh={refetchListings}
            refreshing={listingsLoading}
            renderItem={({ item }) => (
              <ListingCard
                listing={item}
                onMarkSold={() => markListingSold(item)}
                onMarkAvailable={() => markListingAvailable(item)}
                onEdit={() => navigation.navigate('EditListing', { listingId: item.id })}
                onDelete={() => deleteListing(item)}
              />
            )}
          />
        )
      )}
    </SafeAreaView>
  );
}

function SaleCard({
  sale,
  onUpdateStatus,
  onEndSale,
  onDelete,
  onEdit,
  onView,
}: {
  sale: Sale;
  onUpdateStatus: (id: string, status: SaleStatus) => void;
  onEndSale: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onView: () => void;
}) {
  const firstImage = sale.media?.find((m) => m.type === 'image');
  const thumbUrl = transformedImageUrl(firstImage?.url, { width: 200, height: 200, resize: 'cover', quality: 75 });

  return (
    <Card className="overflow-hidden">
      <Pressable onPress={onView} className="active:bg-zinc-50">
        <View className="flex-row p-3">
          <View className="overflow-hidden rounded-xl" style={{ width: 88, height: 88 }}>
            {thumbUrl ? (
              <Image
                source={{ uri: thumbUrl }}
                placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
              />
            ) : (
              <View className="h-full w-full items-center justify-center bg-brand-50">
                <Ionicons name="image-outline" size={28} color="#1F4D3A" />
              </View>
            )}
          </View>
          <View className="ml-3 flex-1">
            <View className="flex-row items-start justify-between">
              <Text className="flex-1 pr-2 text-base font-bold text-zinc-900" numberOfLines={1}>
                {sale.title}
              </Text>
              <StatusBadge status={sale.status} />
            </View>
            <View className="mt-1 flex-row items-center">
              <Ionicons name="location-outline" size={13} color="#71717A" />
              <Text className="ml-1 flex-1 text-xs text-zinc-500" numberOfLines={1}>{sale.address}</Text>
            </View>
            <View className="mt-1 flex-row items-center">
              <Ionicons name="time-outline" size={13} color="#1F4D3A" />
              <Text className="ml-1 text-xs font-medium text-brand-600" numberOfLines={1}>
                {formatSaleDate(sale.start_date, sale.end_date)} · {formatSaleTime(sale.start_time, sale.end_time)}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      <View className="border-t border-zinc-100 px-3 py-2 flex-row flex-wrap" style={{ gap: 6 }}>
        {sale.status !== 'active' && sale.status !== 'ended' && (
          <Chip label="Mark live" size="sm" onPress={() => onUpdateStatus(sale.id, 'active')} />
        )}
        {sale.status === 'active' && (
          <Chip label="Ending soon" size="sm" onPress={() => onUpdateStatus(sale.id, 'winding_down')} />
        )}
        {sale.status !== 'ended' && (
          <Chip label="End sale" size="sm" onPress={onEndSale} />
        )}
        {sale.status === 'ended' && (
          <Chip label="Reopen" size="sm" onPress={() => onUpdateStatus(sale.id, 'active')} />
        )}
      </View>

      <View className="border-t border-zinc-100 p-3 flex-row" style={{ gap: 8 }}>
        <Pressable onPress={onEdit} className="flex-1 flex-row items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 active:bg-zinc-50">
          <Ionicons name="pencil" size={16} color="#27272A" />
          <Text className="ml-1.5 text-sm font-semibold text-zinc-800">Edit</Text>
        </Pressable>
        <Pressable onPress={onDelete} className="flex-1 flex-row items-center justify-center rounded-xl border border-red-100 bg-red-50 py-2.5 active:bg-red-100">
          <Ionicons name="trash-outline" size={16} color="#DC2626" />
          <Text className="ml-1.5 text-sm font-semibold text-red-600">Delete</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function ListingCard({
  listing,
  onMarkSold,
  onMarkAvailable,
  onEdit,
  onDelete,
}: {
  listing: Listing;
  onMarkSold: () => void;
  onMarkAvailable: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const firstImage = listing.media?.find((m) => m.type === 'image');
  const thumbUrl = transformedImageUrl(firstImage?.url, { width: 200, height: 200, resize: 'cover', quality: 75 });

  return (
    <Card className="overflow-hidden">
      <View className="flex-row p-3">
        <View className="overflow-hidden rounded-xl" style={{ width: 88, height: 88 }}>
          {thumbUrl ? (
            <Image
              source={{ uri: thumbUrl }}
              placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
            />
          ) : (
            <View className="h-full w-full items-center justify-center bg-brand-50">
              <Ionicons name="image-outline" size={28} color="#1F4D3A" />
            </View>
          )}
        </View>
        <View className="ml-3 flex-1">
          <View className="flex-row items-start justify-between">
            <Text className="flex-1 pr-2 text-base font-bold text-zinc-900" numberOfLines={1}>
              {listing.title}
            </Text>
            <View
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: listing.status === 'sold' ? '#FEE2E2' : '#DCFCE7' }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: listing.status === 'sold' ? '#DC2626' : '#16A34A' }}
              >
                {listing.status === 'sold' ? 'Sold' : 'Available'}
              </Text>
            </View>
          </View>
          <Text className="mt-1 text-base font-bold text-brand-600">
            ${Number(listing.price).toFixed(2)}
          </Text>
          <View className="mt-1 flex-row items-center">
            <Ionicons name="location-outline" size={13} color="#71717A" />
            <Text className="ml-1 flex-1 text-xs text-zinc-500" numberOfLines={1}>
              {listing.pickup_display}
            </Text>
          </View>
        </View>
      </View>

      <View className="border-t border-zinc-100 px-3 py-2 flex-row flex-wrap" style={{ gap: 6 }}>
        {listing.status === 'available' ? (
          <Chip label="Mark as sold" size="sm" onPress={onMarkSold} />
        ) : (
          <Chip label="Mark available" size="sm" onPress={onMarkAvailable} />
        )}
      </View>

      <View className="border-t border-zinc-100 p-3 flex-row" style={{ gap: 8 }}>
        <Pressable onPress={onEdit} className="flex-1 flex-row items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 active:bg-zinc-50">
          <Ionicons name="pencil" size={16} color="#27272A" />
          <Text className="ml-1.5 text-sm font-semibold text-zinc-800">Edit</Text>
        </Pressable>
        <Pressable onPress={onDelete} className="flex-1 flex-row items-center justify-center rounded-xl border border-red-100 bg-red-50 py-2.5 active:bg-red-100">
          <Ionicons name="trash-outline" size={16} color="#DC2626" />
          <Text className="ml-1.5 text-sm font-semibold text-red-600">Delete</Text>
        </Pressable>
      </View>
    </Card>
  );
}
