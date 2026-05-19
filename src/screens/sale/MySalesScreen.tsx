import React from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Pressable,
} from 'react-native';
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

export default function MySalesScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { sales, loading, refetch } = useMySales(user?.id);

  const updateStatus = async (saleId: string, status: SaleStatus) => {
    await supabase.from('sales').update({ status }).eq('id', saleId);
    refetch();
  };

  const deleteSale = (saleId: string) => {
    Alert.alert('Delete sale?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('sales').delete().eq('id', saleId);
          refetch();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center justify-between bg-white px-5 py-4">
        <View>
          <Text className="text-2xl font-extrabold text-zinc-900">My sales</Text>
          <Text className="text-xs text-zinc-500">
            {sales.length === 0
              ? 'Nothing posted yet'
              : `${sales.length} ${sales.length === 1 ? 'sale' : 'sales'}`}
          </Text>
        </View>
        <IconButton
          variant="brand"
          size="md"
          onPress={() => navigation.navigate('CreateSale')}
          icon={<Ionicons name="add" size={24} color="#fff" />}
        />
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
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={refetch}
          refreshing={loading}
          renderItem={({ item }) => (
            <SaleCard
              sale={item}
              onUpdateStatus={updateStatus}
              onDelete={deleteSale}
              onEdit={() => navigation.navigate('EditSale', { saleId: item.id })}
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
  onDelete,
  onEdit,
}: {
  sale: Sale;
  onUpdateStatus: (id: string, status: SaleStatus) => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <View className="p-4">
        <View className="mb-2 flex-row items-start justify-between">
          <Text className="flex-1 pr-3 text-lg font-bold text-zinc-900" numberOfLines={1}>
            {sale.title}
          </Text>
          <StatusBadge status={sale.status} />
        </View>

        <View className="mb-1 flex-row items-center">
          <Ionicons name="location-outline" size={14} color="#71717A" />
          <Text className="ml-1 flex-1 text-sm text-zinc-500" numberOfLines={1}>
            {sale.address}
          </Text>
        </View>
        <View className="mb-3 flex-row items-center">
          <Ionicons name="time-outline" size={14} color="#F97316" />
          <Text className="ml-1 text-sm font-medium text-brand-600">
            {formatSaleDate(sale.start_date, sale.end_date)} ·{' '}
            {formatSaleTime(sale.start_time, sale.end_time)}
          </Text>
        </View>

        {/* Status quick-set */}
        <View className="mb-3 flex-row" style={{ gap: 6 }}>
          {sale.status !== 'active' && (
            <Chip
              label="Mark live"
              size="sm"
              onPress={() => onUpdateStatus(sale.id, 'active')}
            />
          )}
          {sale.status !== 'winding_down' && (
            <Chip
              label="Winding down"
              size="sm"
              onPress={() => onUpdateStatus(sale.id, 'winding_down')}
            />
          )}
          {sale.status !== 'ended' && (
            <Chip
              label="End sale"
              size="sm"
              onPress={() => onUpdateStatus(sale.id, 'ended')}
            />
          )}
        </View>

        <View className="flex-row" style={{ gap: 8 }}>
          <Pressable
            onPress={onEdit}
            className="flex-1 flex-row items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 active:bg-zinc-50"
          >
            <Ionicons name="pencil" size={16} color="#27272A" />
            <Text className="ml-1.5 text-sm font-semibold text-zinc-800">Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(sale.id)}
            className="flex-1 flex-row items-center justify-center rounded-xl border border-red-100 bg-red-50 py-2.5 active:bg-red-100"
          >
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
            <Text className="ml-1.5 text-sm font-semibold text-red-600">Delete</Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}
