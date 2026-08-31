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
import { useNavigation, useFocusEffect } from '@react-navigation/native';

import { SubHeader } from '../../components/SubHeader';
import { useAuth } from '../../hooks/useAuth';
import { ListingWithHold, useMyListings } from '../../hooks/useListings';
import { supabase } from '../../lib/supabase';
import { setListingStatus } from '../../lib/listingStatus';
import { Listing, ListingStatus } from '../../types';
import { PLACEHOLDER_BLURHASH, transformedImageUrl } from '../../lib/imageUrl';
import { toast } from '../../lib/toast';
import { Draft, clearDraft, loadDraft } from '../../lib/drafts';
import { DraftRow } from '../../components/DraftRow';
import { shareListing } from '../../lib/share';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';
const AMBER = '#B8772C';
const AMBER_SOFT = '#FBEFD6';

type Segment = 'live' | 'sold';

/**
 * v3 redesign — "Your listings". Manage items in a compact
 * row layout. Mark sold / Relist mutate status in place.
 */
export default function MyListingsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { listings, loading, refetch } = useMyListings(user?.id);
  const [segment, setSegment] = useState<Segment>('live');
  const [draft, setDraft] = useState<Draft | null>(null);

  // Refresh on every focus so view/save counts reflect activity that
  // happened while the screen was open or backgrounded — without this the
  // numbers only updated on mount or after an action, which read as
  // "views don't work".
  useFocusEffect(
    React.useCallback(() => {
      refetch();
      loadDraft('listing').then(setDraft);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const filtered = useMemo(
    () =>
      listings.filter((l) =>
        // "Live" = anything not sold (available + pending), so pending items
        // don't vanish from the list.
        segment === 'live' ? l.status !== 'sold' : l.status === 'sold',
      ),
    [listings, segment],
  );
  const liveCount = listings.filter((l) => l.status !== 'sold').length;
  const soldCount = listings.filter((l) => l.status === 'sold').length;

  const mutateStatus = async (
    listing: Listing,
    status: Exclude<ListingStatus, 'pending'>,
    successMessage?: string,
  ) => {
    const { error } = await setListingStatus(listing.id, status);
    if (error) {
      toast.error("Couldn't update", error);
      return;
    }
    toast.success(
      successMessage ?? (status === 'sold' ? 'Marked sold' : 'Relisted'),
    );
    refetch();
  };

  const confirmMarkSold = (listing: Listing) => {
    Alert.alert('Mark as sold?', listing.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark sold', onPress: () => mutateStatus(listing, 'sold') },
    ]);
  };

  // With no expiry on a hold (by design — see 20260830100100_listing_holds.sql),
  // this confirm is the only guardrail between a seller and accidentally
  // reopening an item someone else is waiting on.
  const confirmReleaseHold = (listing: ListingWithHold) => {
    Alert.alert(
      'Release this hold?',
      `${listing.held_for_name ?? 'The buyer'} will be notified “${listing.title}” is back on the market.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release hold',
          style: 'destructive',
          onPress: () => mutateStatus(listing, 'available', 'Hold released'),
        },
      ],
    );
  };

  const confirmDelete = (listing: Listing) => {
    Alert.alert(
      'Delete this listing?',
      `“${listing.title}” will be permanently removed, along with its photos and anyone's saves of it. Existing message threads keep their history. This can't be undone — if it sold, “Mark sold” keeps it on your record instead.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // listing_media + listing_favorites cascade on delete (FKs).
            const { error } = await supabase
              .from('listings')
              .delete()
              .eq('id', listing.id);
            if (error) {
              toast.error("Couldn't delete", error.message);
              return;
            }
            toast.success('Listing deleted');
            refetch();
          },
        },
      ],
    );
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void clearDraft('listing');
          setDraft(null);
        },
      },
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
          ListHeaderComponent={
            segment === 'live' && draft ? (
              <DraftRow
                kind="listing"
                title={typeof draft.fields.title === 'string' ? draft.fields.title : ''}
                savedAt={draft.savedAt}
                onPress={() => navigation.navigate('CreateListing', { fromDraftRow: true })}
                onDiscard={handleDiscardDraft}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <ListingManageRow
              listing={item}
              onEdit={() =>
                navigation.navigate('EditListing', { listingId: item.id })
              }
              onShare={() => shareListing(item)}
              onMarkSold={() => confirmMarkSold(item)}
              onRelist={() => mutateStatus(item, 'available')}
              onReleaseHold={() => confirmReleaseHold(item)}
              onDelete={() => confirmDelete(item)}
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
  onShare,
  onMarkSold,
  onRelist,
  onReleaseHold,
  onDelete,
}: {
  listing: ListingWithHold;
  onEdit: () => void;
  onShare: () => void;
  onMarkSold: () => void;
  onRelist: () => void;
  onReleaseHold: () => void;
  onDelete: () => void;
}) {
  const sold = listing.status === 'sold';
  // No expiry on a hold by design — this row is the seller's only signal
  // that an item is sitting held for someone, so it needs to be impossible
  // to miss (see 20260830100100_listing_holds.sql).
  const onHold = listing.status === 'pending';
  const firstImage = listing.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 200,
    height: 200,
    resize: 'cover',
    quality: 75,
  });
  // Stats placeholder until analytics ship.
  const views = listing.view_count ?? 0;
  const saves = listing.save_count ?? 0;
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
        {sold ? (
          <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 3 }}>
            {`Sold for $${listing.price.toFixed(0)}`}
          </Text>
        ) : onHold ? (
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: AMBER_SOFT,
              borderRadius: 99,
              paddingVertical: 3,
              paddingHorizontal: 8,
              marginTop: 4,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: AMBER }}>
              On hold for {listing.held_for_name ?? 'a buyer'}
            </Text>
          </View>
        ) : (
          <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 3 }}>
            {`${views} views · ${saves} saved`}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {sold ? (
            <PillButton label="Relist" onPress={onRelist} />
          ) : onHold ? (
            <>
              <PillButton label="Mark sold" onPress={onMarkSold} />
              <PillButton label="Release hold" onPress={onReleaseHold} />
            </>
          ) : (
            <>
              <PillButton label="Edit" onPress={onEdit} />
              <PillButton label="Share" onPress={onShare} />
              <PillButton label="Mark sold" onPress={onMarkSold} />
            </>
          )}
          <PillButton label="Delete" onPress={onDelete} danger />
        </View>
      </View>
    </View>
  );
}

function PillButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 5,
        paddingHorizontal: 11,
        borderWidth: 1,
        borderColor: danger ? '#F0D9D3' : HAIRLINE,
        borderRadius: 99,
        backgroundColor: '#fff',
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: danger ? ROSE : INK }}>
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
