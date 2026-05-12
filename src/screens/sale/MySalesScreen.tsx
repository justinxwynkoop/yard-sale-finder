import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../hooks/useAuth';
import { useMySales } from '../../hooks/useSales';
import { supabase } from '../../lib/supabase';
import { Sale, SaleStackParamList, SaleStatus } from '../../types';
import { formatSaleDate, formatSaleTime } from '../../utils/format';

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
    Alert.alert('Delete Sale', 'Are you sure? This cannot be undone.', [
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

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Sales</Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => navigation.navigate('CreateSale')}
        >
          <Text style={styles.createBtnText}>+ New Sale</Text>
        </TouchableOpacity>
      </View>

      {sales.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏷️</Text>
          <Text style={styles.emptyTitle}>No sales yet</Text>
          <Text style={styles.emptySubtitle}>Host your first yard sale and put it on the map.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('CreateSale')}>
            <Text style={styles.emptyBtnText}>Post a Sale</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={s => s.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <SaleCard
              sale={item}
              onUpdateStatus={updateStatus}
              onDelete={deleteSale}
              onEdit={() => navigation.navigate('EditSale', { saleId: item.id })}
            />
          )}
          onRefresh={refetch}
          refreshing={loading}
        />
      )}
    </SafeAreaView>
  );
}

function SaleCard({ sale, onUpdateStatus, onDelete, onEdit }: {
  sale: Sale;
  onUpdateStatus: (id: string, status: SaleStatus) => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  const statusConfig = {
    active: { bg: '#D1FAE5', text: '#065F46', label: 'Active' },
    winding_down: { bg: '#FEF3C7', text: '#92400E', label: 'Winding Down' },
    ended: { bg: '#F3F4F6', text: '#6B7280', label: 'Ended' },
  }[sale.status];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{sale.title}</Text>
        <View style={[styles.badge, { backgroundColor: statusConfig.bg }]}>
          <Text style={[styles.badgeText, { color: statusConfig.text }]}>{statusConfig.label}</Text>
        </View>
      </View>

      <Text style={styles.cardAddress} numberOfLines={1}>{sale.address}</Text>
      <Text style={styles.cardDate}>
        {formatSaleDate(sale.start_date, sale.end_date)} · {formatSaleTime(sale.start_time, sale.end_time)}
      </Text>

      {/* Status controls */}
      <View style={styles.statusRow}>
        {sale.status !== 'active' && (
          <TouchableOpacity style={styles.statusBtn} onPress={() => onUpdateStatus(sale.id, 'active')}>
            <Text style={styles.statusBtnText}>Mark Active</Text>
          </TouchableOpacity>
        )}
        {sale.status !== 'winding_down' && (
          <TouchableOpacity style={styles.statusBtn} onPress={() => onUpdateStatus(sale.id, 'winding_down')}>
            <Text style={styles.statusBtnText}>Winding Down</Text>
          </TouchableOpacity>
        )}
        {sale.status !== 'ended' && (
          <TouchableOpacity style={[styles.statusBtn, { backgroundColor: '#F3F4F6' }]} onPress={() => onUpdateStatus(sale.id, 'ended')}>
            <Text style={[styles.statusBtnText, { color: '#6B7280' }]}>End Sale</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(sale.id)}>
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },
  createBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  emptyBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  cardAddress: { fontSize: 13, color: '#6B7280', marginBottom: 2 },
  cardDate: { fontSize: 13, color: '#2563EB', fontWeight: '500', marginBottom: 12 },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  statusBtn: { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  statusBtnText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8 },
  editBtn: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  editBtnText: { fontSize: 14, color: '#374151', fontWeight: '600' },
  deleteBtn: { flex: 1, backgroundColor: '#FEE2E2', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  deleteBtnText: { fontSize: 14, color: '#DC2626', fontWeight: '600' },
});
