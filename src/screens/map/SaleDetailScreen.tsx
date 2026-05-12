import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
  Platform,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { MapStackParamList, Sale } from '../../types';
import { supabase } from '../../lib/supabase';
import { formatSaleDate, formatSaleTime } from '../../utils/format';

type Route = RouteProp<MapStackParamList, 'SaleDetail'>;

export default function SaleDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { saleId } = route.params;

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('sales')
      .select('*, profile:profiles(*), media:sale_media(*)')
      .eq('id', saleId)
      .single()
      .then(({ data }) => {
        setSale(data);
        setLoading(false);
      });
  }, [saleId]);

  const openDirections = () => {
    if (!sale) return;
    const encoded = encodeURIComponent(sale.address);
    const url = Platform.select({
      ios: `maps:?q=${encoded}`,
      android: `geo:0,0?q=${encoded}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    });
    Linking.openURL(url!);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!sale) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Sale not found.</Text>
      </View>
    );
  }

  const images = sale.media?.filter(m => m.type === 'image') ?? [];
  const videos = sale.media?.filter(m => m.type === 'video') ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView bounces={false}>
        {/* Media gallery */}
        {images.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
            {images.map(img => (
              <Image key={img.id} source={{ uri: img.url }} style={styles.galleryImage} />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.galleryPlaceholder}>
            <Text style={styles.galleryPlaceholderText}>🏡</Text>
          </View>
        )}

        <View style={styles.body}>
          {/* Status + title */}
          <View style={styles.titleRow}>
            <Text style={styles.title}>{sale.title}</Text>
            <StatusBadge status={sale.status} />
          </View>

          {/* Date / time */}
          <InfoRow icon="📅" text={`${formatSaleDate(sale.start_date, sale.end_date)} · ${formatSaleTime(sale.start_time, sale.end_time)}`} />

          {/* Address */}
          <InfoRow icon="📍" text={sale.address} />

          {/* Seller */}
          {sale.profile?.display_name && (
            <InfoRow icon="👤" text={`Hosted by ${sale.profile.display_name}`} />
          )}

          {/* Categories */}
          {sale.categories.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Categories</Text>
              <View style={styles.chipRow}>
                {sale.categories.map(cat => (
                  <View key={cat} style={styles.chip}>
                    <Text style={styles.chipText}>{cat}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Description */}
          {sale.description && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>About this Sale</Text>
              <Text style={styles.description}>{sale.description}</Text>
            </View>
          )}

          {/* Pricing notes */}
          {sale.pricing_notes && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Pricing Notes</Text>
              <Text style={styles.description}>{sale.pricing_notes}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Directions CTA */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.directionsBtn} onPress={openDirections}>
          <Text style={styles.directionsBtnText}>🗺️  Get Directions</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <Text style={styles.infoText}>{text}</Text>
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

const SCREEN_WIDTH = 390;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#666', fontSize: 16 },
  gallery: { height: 260 },
  galleryImage: { width: SCREEN_WIDTH, height: 260, resizeMode: 'cover' },
  galleryPlaceholder: {
    height: 200,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryPlaceholderText: { fontSize: 64 },
  body: { padding: 20 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  infoIcon: { fontSize: 16, marginTop: 1 },
  infoText: { fontSize: 15, color: '#444', flex: 1, lineHeight: 22 },
  section: { marginTop: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, color: '#2563EB', textTransform: 'capitalize' },
  description: { fontSize: 15, color: '#444', lineHeight: 22 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  directionsBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  directionsBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
