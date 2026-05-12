import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import { Sale } from '../types';
import { formatSaleDate, formatSaleTime } from '../utils/format';

interface Props {
  sale: Sale;
  onClose: () => void;
  onViewDetails: () => void;
}

export default function SalePinCallout({ sale, onClose, onViewDetails }: Props) {
  const firstImage = sale.media?.find(m => m.type === 'image');

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
        {sale.media && sale.media.length > 0 ? (
          sale.media.filter(m => m.type === 'image').map(m => (
            <Image key={m.id} source={{ uri: m.url }} style={styles.image} />
          ))
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>🏡</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{sale.title}</Text>
          <StatusBadge status={sale.status} />
        </View>
        <Text style={styles.address} numberOfLines={1}>{sale.address}</Text>
        <Text style={styles.date}>
          {formatSaleDate(sale.start_date, sale.end_date)} · {formatSaleTime(sale.start_time, sale.end_time)}
        </Text>
        {sale.categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            {sale.categories.map(cat => (
              <View key={cat} style={styles.catChip}>
                <Text style={styles.catText}>{cat}</Text>
              </View>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity style={styles.detailBtn} onPress={onViewDetails}>
          <Text style={styles.detailBtnText}>View Details & Directions</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: Sale['status'] }) {
  const config = {
    active: { bg: '#D1FAE5', text: '#065F46', label: 'Active' },
    winding_down: { bg: '#FEF3C7', text: '#92400E', label: 'Winding Down' },
    ended: { bg: '#F3F4F6', text: '#6B7280', label: 'Ended' },
  }[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.badgeText, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  imageScroll: { maxHeight: 160 },
  image: { width: 280, height: 160, resizeMode: 'cover' },
  imagePlaceholder: {
    width: 280,
    height: 120,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: { fontSize: 48 },
  info: { padding: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 8 },
  address: { fontSize: 13, color: '#666', marginBottom: 4 },
  date: { fontSize: 13, color: '#2563EB', fontWeight: '500', marginBottom: 8 },
  catScroll: { marginBottom: 12 },
  catChip: { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6 },
  catText: { fontSize: 12, color: '#2563EB', textTransform: 'capitalize' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  detailBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  detailBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
