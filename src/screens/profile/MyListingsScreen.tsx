import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { SubHeader } from '../../components/SubHeader';
import { useAuth } from '../../hooks/useAuth';
import { useMyListings } from '../../hooks/useListings';
import { supabase } from '../../lib/supabase';
import { Listing, ListingStatus } from '../../types';
import { PLACEHOLDER_BLURHASH, transformedImageUrl } from '../../lib/imageUrl';
import { toast } from '../../lib/toast';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

type Segment = 'live' | 'sold';

/**
 * v3 redesign — "Your listings". Manage one-off items in a compact
 * row layout. Mark sold / Relist mutate status in place.
 */
export default function MyListingsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { listings, loading, refetch } = useMyListings(user?.id);
  const [segment, setSegment] = useState<Segment>('live');

  const filtered = useMemo(
    () =>
      listings.filter((l) =>
        segment === 'live' ? l.status === 'available' : l.status === 'sold',
      ),
    [listings, segment],
  );
  const liveCount = listings.filter((l) => l.status === 'available').length;
  const soldCount = listings.filter((l) => l.status === 'sold').length;

  const mutateStatus = async (listing: Listing, status: ListingStatus) => {
    const { error } = await supabase
      .from('listings')
      .update({ status })
      .eq('id', listing.id);
    if (error) {
      toast.error("Couldn't update", error.message);
      return;
    }
    toast.success(status === 'sold' ? 'Marked sold' : 'Relisted');
    refetch();
  };

  const confirmMarkSold = (listing: Listing) => {
    Alert.alert('Mark as sold?', listing.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark sold', onPress: () => mutateStatus(listing, 'sold') },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader
        title="Your listings"
        right={
          <Pressable
            onPress={() => navigation.navigate('CreateListing')}
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
            accessibilityLabel="New listing"
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
              New
            </Text>
          </Pressable>
        }
      />

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
          label={`Live · ${liveCount}`}
          active={segment === 'live'}
          onPress={() => setSegment('live')}
        />
        <SegmentButton
          label={`Sold · ${soldCount}`}
          active={segment === 'sold'}
          onPress={() => setSegment('sold')}
        />
      </View>

      {loading && listings.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <ListingManageRow
              listing={item}
              onEdit={() =>
                navigation.navigate('EditListing', { listingId: item.id })
              }
              onMarkSold={() => confirmMarkSold(item)}
              onRelist={() => mutateStatus(item, 'available')}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ color: INK_MUTED }}>
                {segment === 'live'
                  ? 'No live items yet.'
                  : 'No items sold yet.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function ListingManageRow({
  listing,
  onEdit,
  onMarkSold,
  onRelist,
}: {
  listing: Listing;
  onEdit: () => void;
  onMarkSold: () => void;
  onRelist: () => void;
}) {
  const sold = listing.status === 'sold';
  const firstImage = listing.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 200,
    height: 200,
    resize: 'cover',
    quality: 75,
  });
  // Stats placeholder until analytics ship.
  const views = 0;
  const saves = 0;
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        marginBottom: 10,
        flexDirection: 'row',
        overflow: 'hidden',
      }}
    >
      <View style={{ width: 84, height: 84, position: 'relative' }}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            style={{ width: 84, height: 84 }}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View
            style={{
              width: 84,
              height: 84,
              backgroundColor: BRAND_SOFT,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="pricetag-outline" size={26} color={BRAND} />
          </View>
        )}
        {sold ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(20,18,15,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 0.6,
              }}
            >
              SOLD
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <Text
            style={{ fontSize: 14, fontWeight: '700', color: INK, flex: 1 }}
            numberOfLines={1}
          >
            {listing.title}
          </Text>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '800',
              color: sold ? INK_MUTED : BRAND,
            }}
          >
            ${listing.price.toFixed(0)}
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 3 }}>
          {sold
            ? `Sold for $${listing.price.toFixed(0)}`
            : `${views} views · ${saves} saved`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {sold ? (
            <PillButton label="Relist" onPress={onRelist} />
          ) : (
            <>
              <PillButton label="Edit" onPress={onEdit} />
              <PillButton label="Mark sold" onPress={onMarkSold} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function PillButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 5,
        paddingHorizontal: 11,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderRadius: 99,
        backgroundColor: '#fff',
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: INK }}>
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
