import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { SubHeader } from '../../components/SubHeader';
import { useAuth } from '../../hooks/useAuth';
import { useMySales } from '../../hooks/useSales';
import { supabase } from '../../lib/supabase';
import { Sale, SaleStatus } from '../../types';
import { PLACEHOLDER_BLURHASH, transformedImageUrl } from '../../lib/imageUrl';
import { formatSaleDate, formatSaleTime } from '../../utils/format';
import { toast } from '../../lib/toast';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';
const ENDED_BG = '#EFEBE0';

type Segment = 'active' | 'ended';

/**
 * v3 redesign — "Your sales". Push from Profile → Your sales.
 * Active/Ended segmented control + per-sale manage cards with:
 * - Photo (dimmed for ended), status chip, title, date label,
 * - Stat row (Views / Saved / Chats — stubbed 0 until analytics ship),
 * - Action row (Active: Edit · Share · End; Ended: Repost · View · Delete)
 */
export default function MySalesScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { sales, loading, refetch } = useMySales(user?.id);
  const [segment, setSegment] = useState<Segment>('active');

  const filtered = useMemo(
    () =>
      sales.filter((s) =>
        segment === 'active' ? s.status !== 'ended' : s.status === 'ended',
      ),
    [sales, segment],
  );
  const activeCount = sales.filter((s) => s.status !== 'ended').length;
  const endedCount = sales.filter((s) => s.status === 'ended').length;

  const handleEnd = (sale: Sale) => {
    Alert.alert(
      'End this sale?',
      `${sale.title} will be marked ended and hidden from the map.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End sale',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('sales')
              .update({ status: 'ended' as SaleStatus })
              .eq('id', sale.id);
            if (error) {
              toast.error("Couldn't end sale", error.message);
              return;
            }
            toast.success('Sale ended');
            refetch();
          },
        },
      ],
    );
  };

  const handleDelete = (sale: Sale) => {
    Alert.alert(
      'Delete sale?',
      `${sale.title} will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('sales')
              .delete()
              .eq('id', sale.id);
            if (error) {
              toast.error("Couldn't delete sale", error.message);
              return;
            }
            toast.success('Sale deleted');
            refetch();
          },
        },
      ],
    );
  };

  const handleShare = (sale: Sale) => {
    Share.share({
      message: `${sale.title}\n${sale.address}\nhttps://trove.app/sale/${sale.id}`,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader
        title="Your sales"
        right={
          <Pressable
            onPress={() => navigation.navigate('CreateSale')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingVertical: 7,
              paddingHorizontal: 12,
              backgroundColor: BRAND,
              borderRadius: 99,
            }}
            accessibilityRole="button"
            accessibilityLabel="New sale"
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
              New
            </Text>
          </Pressable>
        }
      />

      {/* Segmented control */}
      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: HAIRLINE,
          padding: 4,
          flexDirection: 'row',
          marginHorizontal: 16,
          marginTop: 12,
        }}
      >
        <SegmentButton
          label={`Active · ${activeCount}`}
          active={segment === 'active'}
          onPress={() => setSegment('active')}
        />
        <SegmentButton
          label={`Ended · ${endedCount}`}
          active={segment === 'ended'}
          onPress={() => setSegment('ended')}
        />
      </View>

      {loading && sales.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 32,
          }}
          renderItem={({ item }) => (
            <SaleManageCard
              sale={item}
              onEdit={() =>
                navigation.navigate('EditSale', { saleId: item.id })
              }
              onShare={() => handleShare(item)}
              onEnd={() => handleEnd(item)}
              onView={() =>
                navigation.navigate('SaleDetail', { saleId: item.id })
              }
              onRepost={() => navigation.navigate('CreateSale')}
              onDelete={() => handleDelete(item)}
            />
          )}
          ListFooterComponent={
            segment === 'active' ? (
              <Pressable
                onPress={() => navigation.navigate('CreateSale')}
                style={{
                  borderWidth: 1.5,
                  borderColor: HAIRLINE,
                  borderStyle: 'dashed',
                  borderRadius: 16,
                  padding: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                }}
                accessibilityRole="button"
                accessibilityLabel="Post another sale"
              >
                <Ionicons name="add" size={15} color={INK_SOFT} />
                <Text
                  style={{ fontSize: 13, fontWeight: '600', color: INK_SOFT }}
                >
                  Post another sale
                </Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View
              style={{
                alignItems: 'center',
                paddingVertical: 40,
              }}
            >
              <Text style={{ color: INK_MUTED }}>
                {segment === 'active'
                  ? "You haven't posted a sale yet."
                  : 'No past sales.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function SaleManageCard({
  sale,
  onEdit,
  onShare,
  onEnd,
  onView,
  onRepost,
  onDelete,
}: {
  sale: Sale;
  onEdit: () => void;
  onShare: () => void;
  onEnd: () => void;
  onView: () => void;
  onRepost: () => void;
  onDelete: () => void;
}) {
  const ended = sale.status === 'ended';
  const firstImage = sale.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 240,
    height: 240,
    resize: 'cover',
    quality: 75,
  });
  // Engagement stats are placeholders until analytics infra exists.
  const stats = { views: 0, saved: 0, chats: 0 };
  const dateLabel = ended
    ? `Ended ${formatSaleDate(sale.end_date, sale.end_date)}`
    : `${formatSaleDate(sale.start_date, sale.end_date)} · ${formatSaleTime(
        sale.start_time,
        sale.end_time,
      )}`;

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: HAIRLINE,
        overflow: 'hidden',
      }}
    >
      {/* Row stretches to the right column's content height; the photo
          column is a fixed 104pt-wide panel that fills that height.
          `flexShrink: 0` stops flexbox from squeezing the 104pt width,
          `alignSelf: 'stretch'` + the Image's `flex: 1` make the photo
          fill the full card height instead of collapsing to 0 (the old
          `height: '100%'` against an unconstrained row was the root
          cause of the cards looking broken). minHeight guards the case
          where the right column is unusually short. */}
      <View style={{ flexDirection: 'row', minHeight: 104 }}>
        <View
          style={{
            width: 104,
            flexShrink: 0,
            alignSelf: 'stretch',
            position: 'relative',
          }}
        >
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
              style={{ width: 104, flex: 1 }}
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View
              style={{
                width: 104,
                flex: 1,
                backgroundColor: BRAND_SOFT,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="image-outline" size={28} color={BRAND} />
            </View>
          )}
          {ended ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(20,18,15,0.45)',
              }}
            />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, padding: 12 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 99,
              backgroundColor: ended ? ENDED_BG : BRAND_SOFT,
            }}
          >
            {/* Real round status dot rather than a '●' text glyph — the
                glyph baseline sat slightly high and rendered oversized
                next to the uppercase label. */}
            {!ended ? (
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 99,
                  backgroundColor: BRAND,
                  marginRight: 4,
                }}
              />
            ) : null}
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 0.4,
                color: ended ? INK_MUTED : BRAND,
              }}
            >
              {ended ? 'ENDED' : 'LIVE'}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 14.5,
              fontWeight: '700',
              color: INK,
              marginTop: 6,
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            {sale.title}
          </Text>
          <Text
            style={{ fontSize: 11, color: INK_MUTED, marginTop: 2 }}
            numberOfLines={1}
          >
            {dateLabel}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              marginTop: 9,
            }}
          >
            <Stat label="Views" value={stats.views} />
            <Stat label="Saved" value={stats.saved} />
            <Stat label="Chats" value={stats.chats} />
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: HAIRLINE,
        }}
      >
        {ended ? (
          <>
            <ActionButton
              icon="add"
              label="Repost"
              onPress={onRepost}
              first
            />
            <ActionButton
              icon="chevron-forward"
              label="View"
              onPress={onView}
            />
            <ActionButton
              icon="close"
              label="Delete"
              onPress={onDelete}
              destructive
            />
          </>
        ) : (
          <>
            <ActionButton
              icon="create-outline"
              label="Edit"
              onPress={onEdit}
              first
            />
            <ActionButton
              icon="share-social-outline"
              label="Share"
              onPress={onShare}
            />
            <ActionButton
              icon="checkmark"
              label="End sale"
              onPress={onEnd}
            />
          </>
        )}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '800',
          color: INK,
          lineHeight: 15,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: '600',
          color: INK_MUTED,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  first,
  destructive,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  first?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 44,
        paddingVertical: 10,
        paddingHorizontal: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        backgroundColor: 'transparent',
        borderLeftWidth: first ? 0 : 1,
        borderLeftColor: HAIRLINE,
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={13} color={destructive ? ROSE : INK_SOFT} />
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontSize: 12,
          fontWeight: '600',
          color: destructive ? ROSE : INK,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SegmentButton({
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
        flex: 1,
        paddingVertical: 8,
        borderRadius: 9,
        backgroundColor: active ? BRAND : 'transparent',
        alignItems: 'center',
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: '700',
          color: active ? '#fff' : INK,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
