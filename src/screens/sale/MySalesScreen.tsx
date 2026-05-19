import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  Pressable,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useMySales } from '../../hooks/useSales';
import { supabase } from '../../lib/supabase';
import { Sale, SaleStackParamList, SaleStatus } from '../../types';
import { formatSaleDate, formatSaleTime } from '../../utils/format';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  StatusBadge,
} from '../../components/ui';

type Nav = NativeStackNavigationProp<SaleStackParamList, 'MySalesHome'>;

type Filter = 'all' | 'active' | 'winding_down' | 'ended';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Live' },
  { key: 'winding_down', label: 'Winding down' },
  { key: 'ended', label: 'Ended' },
];

export default function MySalesScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { sales, loading, refetch } = useMySales(user?.id);
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    return {
      all: sales.length,
      active: sales.filter((s) => s.status === 'active').length,
      winding_down: sales.filter((s) => s.status === 'winding_down').length,
      ended: sales.filter((s) => s.status === 'ended').length,
    };
  }, [sales]);

  const filtered = filter === 'all' ? sales : sales.filter((s) => s.status === filter);

  const updateStatus = async (saleId: string, status: SaleStatus) => {
    await supabase.from('sales').update({ status }).eq('id', saleId);
    refetch();
  };

  const confirmEndSale = (sale: Sale) => {
    Alert.alert(
      'End this sale?',
      `"${sale.title}" will no longer appear on the discovery map.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End sale',
          style: 'destructive',
          onPress: () => updateStatus(sale.id, 'ended'),
        },
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
            await supabase.from('sales').delete().eq('id', sale.id);
            refetch();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="bg-white px-5 pt-4 pb-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-extrabold text-zinc-900">My sales</Text>
            <Text className="text-xs text-zinc-500">
              {sales.length === 0
                ? 'Nothing posted yet'
                : `${sales.length} ${sales.length === 1 ? 'sale' : 'sales'} total`}
            </Text>
          </View>
          <IconButton
            variant="brand"
            size="md"
            onPress={() => navigation.navigate('CreateSale')}
            icon={<Ionicons name="add" size={24} color="#fff" />}
          />
        </View>

        {/* Filter chips */}
        {sales.length > 0 && (
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
      </View>

      {loading && sales.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : sales.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="pricetag-outline" size={32} color="#F97316" />}
          title="Host your first yard sale"
          description="Pin a location, snap a few photos, and you're on the map."
          action={
            <Button
              size="lg"
              onPress={() => navigation.navigate('CreateSale')}
              leftIcon={<Ionicons name="add" size={20} color="#fff" />}
            >
              Post a sale
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="filter-outline" size={28} color="#F97316" />}
          title={`No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} sales`}
          description="Try a different filter or post a new sale."
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={refetch}
          refreshing={loading}
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

  return (
    <Card className="overflow-hidden">
      <Pressable onPress={onView} className="active:bg-zinc-50">
        <View className="flex-row p-3">
          {/* Cover thumbnail */}
          <View
            className="overflow-hidden rounded-xl"
            style={{ width: 88, height: 88 }}
          >
            {firstImage ? (
              <Image
                source={{ uri: firstImage.url }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            ) : (
              <View className="h-full w-full items-center justify-center bg-brand-50">
                <Ionicons name="image-outline" size={28} color="#F97316" />
              </View>
            )}
          </View>

          {/* Info */}
          <View className="ml-3 flex-1">
            <View className="flex-row items-start justify-between">
              <Text
                className="flex-1 pr-2 text-base font-bold text-zinc-900"
                numberOfLines={1}
              >
                {sale.title}
              </Text>
              <StatusBadge status={sale.status} />
            </View>
            <View className="mt-1 flex-row items-center">
              <Ionicons name="location-outline" size={13} color="#71717A" />
              <Text
                className="ml-1 flex-1 text-xs text-zinc-500"
                numberOfLines={1}
              >
                {sale.address}
              </Text>
            </View>
            <View className="mt-1 flex-row items-center">
              <Ionicons name="time-outline" size={13} color="#F97316" />
              <Text className="ml-1 text-xs font-medium text-brand-600" numberOfLines={1}>
                {formatSaleDate(sale.start_date, sale.end_date)} ·{' '}
                {formatSaleTime(sale.start_time, sale.end_time)}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      {/* Status quick-set */}
      <View className="border-t border-zinc-100 px-3 py-2 flex-row flex-wrap" style={{ gap: 6 }}>
        {sale.status !== 'active' && sale.status !== 'ended' && (
          <Chip
            label="Mark live"
            size="sm"
            onPress={() => onUpdateStatus(sale.id, 'active')}
          />
        )}
        {sale.status === 'active' && (
          <Chip
            label="Winding down"
            size="sm"
            onPress={() => onUpdateStatus(sale.id, 'winding_down')}
          />
        )}
        {sale.status !== 'ended' && (
          <Chip label="End sale" size="sm" onPress={onEndSale} />
        )}
        {sale.status === 'ended' && (
          <Chip
            label="Reopen"
            size="sm"
            onPress={() => onUpdateStatus(sale.id, 'active')}
          />
        )}
      </View>

      <View className="border-t border-zinc-100 p-3 flex-row" style={{ gap: 8 }}>
        <Pressable
          onPress={onEdit}
          className="flex-1 flex-row items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 active:bg-zinc-50"
        >
          <Ionicons name="pencil" size={16} color="#27272A" />
          <Text className="ml-1.5 text-sm font-semibold text-zinc-800">Edit</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          className="flex-1 flex-row items-center justify-center rounded-xl border border-red-100 bg-red-50 py-2.5 active:bg-red-100"
        >
          <Ionicons name="trash-outline" size={16} color="#DC2626" />
          <Text className="ml-1.5 text-sm font-semibold text-red-600">Delete</Text>
        </Pressable>
      </View>
    </Card>
  );
}
