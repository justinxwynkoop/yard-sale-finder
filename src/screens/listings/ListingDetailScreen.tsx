import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Linking,
  Platform,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Alert,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';

import { supabase } from '../../lib/supabase';
import { Listing, ListingMedia, ListingsStackParamList } from '../../types';
import { PhotoViewer } from '../../components/PhotoViewer';
import { ReportSheet } from '../../components/ReportSheet';
import { useAuth } from '../../hooks/useAuth';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { useStartConversation } from '../../hooks/useConversation';
import { navigateToConversation } from '../../lib/navigationRef';
import { useFavoriteListings } from '../../hooks/useFavoriteListings';
import { useUserLocation } from '../../hooks/useUserLocation';
import {
  PLACEHOLDER_BLURHASH,
  transformedImageUrl,
} from '../../lib/imageUrl';
import { Avatar, HeaderButton } from '../../components/ui';
import { formatPostedDate } from '../../utils/format';
import { getCategoryLabel } from '../../lib/categories';
import { formatDistanceMiles, haversineMeters } from '../../utils/distance';

type Route = RouteProp<ListingsStackParamList, 'ListingDetail'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_HEIGHT = 360;

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';

export default function ListingDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { listingId } = route.params;

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const { user } = useAuth();
  const { block } = useBlockedUsers();
  const { start: startConversation } = useStartConversation();
  const { isFavorited, toggle: toggleFavorite } = useFavoriteListings();
  const [startingConversation, setStartingConversation] = useState(false);
  const userLocation = useUserLocation();

  const isOwnListing = listing?.user_id === user?.id;
  const favorited = listing ? isFavorited(listing.id) : false;

  useEffect(() => {
    supabase
      .from('listings')
      .select('*, profile:profiles(*), media:listing_media(*)')
      .eq('id', listingId)
      .single()
      .then(({ data }) => {
        if (data) {
          data.media = (data.media ?? []).sort(
            (a: ListingMedia, b: ListingMedia) => a.order - b.order,
          );
          setListing(data);
        }
        setLoading(false);
      });
  }, [listingId]);

  const handleMessageSeller = async () => {
    if (!listing) return;
    setStartingConversation(true);
    const { id, error: convErr } = await startConversation(
      'listing',
      listing.id,
    );
    setStartingConversation(false);
    if (convErr) {
      Alert.alert(
        'Could not start conversation',
        convErr.message ?? 'Please try again.',
      );
      return;
    }
    if (id) {
      // Use the global helper to ensure the Inbox tab is properly
      // initialized with InboxHome below Conversation. Otherwise React
      // Navigation lands Conversation as the stack root with no back
      // button. See navigationRef.ts for the rationale.
      navigateToConversation(id);
    }
  };

  const handleMakeOffer = async () => {
    // Pre-fills the message composer with an offer template. For now,
    // identical to Ask seller; richer offer UX can layer on later.
    handleMessageSeller();
  };

  const handleMoreMenu = () => {
    if (!listing) return;
    Alert.alert(listing.title, undefined, [
      {
        text: 'Report listing',
        style: 'destructive',
        onPress: () => setReportOpen(true),
      },
      {
        text: 'Block user',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Block user?',
            `You won't see any sales or listings from ${
              listing.profile?.display_name ?? 'this user'
            } in the app.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Block',
                style: 'destructive',
                onPress: async () => {
                  const { error } = await block(listing.user_id);
                  if (error) {
                    Alert.alert('Could not block', error.message);
                    return;
                  }
                  navigation.goBack();
                },
              },
            ],
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
        }}
      >
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          padding: 32,
        }}
      >
        <Ionicons name="alert-circle-outline" size={48} color={INK_MUTED} />
        <Text style={{ marginTop: 12, color: INK_SOFT }}>
          Listing not found.
        </Text>
        <Pressable
          style={{ marginTop: 24 }}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ color: BRAND, fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const media = listing.media ?? [];
  const hasMedia = media.length > 0;
  const viewerImages = media
    .filter((m) => m.type === 'image')
    .map((m) => ({ id: m.id, url: m.url }));

  const openViewer = (mediaIndex: number) => {
    const item = media[mediaIndex];
    if (item?.type !== 'image') return;
    const imgIdx = viewerImages.findIndex((img) => img.id === item.id);
    setViewerStartIndex(imgIdx >= 0 ? imgIdx : 0);
    setIsViewerOpen(true);
  };

  const distance =
    userLocation != null
      ? haversineMeters(
          userLocation.latitude,
          userLocation.longitude,
          listing.pickup_lat,
          listing.pickup_lng,
        )
      : null;
  const distLabel = distance != null ? formatDistanceMiles(distance) : null;
  const pickupCity = (listing.pickup_display.split(',')[1] ?? '').trim() ||
    listing.pickup_display;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Hero */}
        <View style={{ height: HERO_HEIGHT, backgroundColor: BRAND_SOFT }}>
          {hasMedia ? (
            <FlatList
              data={media}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(m) => m.id}
              onScroll={onScroll}
              scrollEventThrottle={16}
              renderItem={({ item, index }) =>
                item.type === 'video' ? (
                  <VideoSlide uri={item.url} />
                ) : (
                  <Pressable onPress={() => openViewer(index)}>
                    <Image
                      source={{
                        uri: transformedImageUrl(item.url, {
                          width: Math.round(SCREEN_WIDTH * 2),
                          height: HERO_HEIGHT * 2,
                          resize: 'cover',
                          quality: 80,
                        }),
                      }}
                      placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
                      style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT }}
                      contentFit="cover"
                      transition={200}
                    />
                  </Pressable>
                )
              }
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="image-outline" size={56} color={BRAND} />
            </View>
          )}

          {/* Floating buttons */}
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              top: insets.top + 6,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <HeaderButton
              onPress={() => navigation.goBack()}
              variant="glass"
              accessibilityLabel="Back"
            />
            <View style={{ flex: 1 }} />
            {!isOwnListing && (
              <>
                <GlassButton
                  icon={favorited ? 'heart' : 'heart-outline'}
                  iconColor={favorited ? ROSE : INK}
                  size={38}
                  iconSize={18}
                  onPress={() => toggleFavorite(listing.id)}
                  accessibilityLabel={favorited ? 'Unsave' : 'Save'}
                />
                <View style={{ width: 8 }} />
              </>
            )}
            <GlassButton
              icon="share-outline"
              size={38}
              iconSize={18}
              onPress={async () => {
                try {
                  await Share.share({
                    title: listing.title,
                    message: `${listing.title}\n${listing.pickup_display}`,
                  });
                } catch {
                  /* dismissed */
                }
              }}
              accessibilityLabel="Share"
            />
            {!isOwnListing && (
              <>
                <View style={{ width: 8 }} />
                <GlassButton
                  icon="ellipsis-horizontal"
                  size={38}
                  iconSize={18}
                  onPress={handleMoreMenu}
                  accessibilityLabel="More"
                />
              </>
            )}
          </View>

          {/* Photo dots */}
          {media.length > 1 && (
            <View
              style={{
                position: 'absolute',
                bottom: 14,
                left: 0,
                right: 0,
                flexDirection: 'row',
                justifyContent: 'center',
              }}
              pointerEvents="none"
            >
              {media.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === activeIndex ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      i === activeIndex
                        ? '#fff'
                        : 'rgba(255,255,255,0.55)',
                    marginHorizontal: 3,
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* Body */}
        <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 30,
                fontWeight: '700',
                color: INK,
                letterSpacing: -0.6,
              }}
            >
              {listing.price === 0
                ? 'Free'
                : `$${listing.price % 1 === 0 ? listing.price : listing.price.toFixed(2)}`}
            </Text>
            <View
              style={{
                backgroundColor:
                  listing.status === 'sold' ? '#EFEBE0' : BRAND_SOFT,
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 99,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: listing.status === 'sold' ? INK_SOFT : BRAND,
                  letterSpacing: 0.4,
                }}
              >
                {listing.status === 'sold' ? 'SOLD' : 'AVAILABLE'}
              </Text>
            </View>
          </View>

          <Text
            style={{
              marginTop: 6,
              fontSize: 17,
              fontWeight: '600',
              color: INK,
              lineHeight: 22,
            }}
          >
            {listing.title}
          </Text>

          <View
            style={{
              marginTop: 6,
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Ionicons name="location-outline" size={12} color={INK_MUTED} />
            <Text style={{ marginLeft: 3, fontSize: 12, color: INK_MUTED }}>
              {distLabel ? `${distLabel} · ` : ''}Pickup in {pickupCity}
              {' · '}
              {formatPostedDate(listing.created_at).replace('Posted ', '')}
            </Text>
          </View>

          {listing.description ? (
            <Text
              style={{
                marginTop: 16,
                fontSize: 13.5,
                lineHeight: 21,
                color: INK,
              }}
            >
              {listing.description}
            </Text>
          ) : null}

          {/* Categories */}
          {listing.categories.length > 0 && (
            <View
              style={{
                marginTop: 14,
                flexDirection: 'row',
                flexWrap: 'wrap',
              }}
            >
              {listing.categories.map((cat) => (
                <View
                  key={cat}
                  style={{
                    backgroundColor: BRAND_SOFT,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 99,
                    marginRight: 6,
                    marginBottom: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: BRAND,
                    }}
                  >
                    {getCategoryLabel(cat)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Seller card */}
          {listing.profile && (
            <Pressable
              onPress={() =>
                listing.profile?.id &&
                (navigation as any).navigate('PublicProfile', {
                  userId: listing.profile.id,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`View ${
                listing.profile?.display_name ?? 'seller'
              }'s profile`}
              style={{
                marginTop: 20,
                backgroundColor: BONE,
                padding: 12,
                borderRadius: 16,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Avatar
                uri={listing.profile.avatar_url}
                name={
                  listing.profile.display_name ?? listing.profile.email ?? ''
                }
                size="md"
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text
                  style={{ fontSize: 13, fontWeight: '700', color: INK }}
                >
                  {listing.profile.display_name ?? 'Anonymous'}
                </Text>
                <Text
                  style={{ fontSize: 11, color: INK_MUTED, marginTop: 2 }}
                >
                  {formatPostedDate(listing.created_at)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={INK_MUTED} />
            </Pressable>
          )}

          {/* Pickup tap-to-directions row */}
          <Pressable
            onPress={() => {
              const encoded = encodeURIComponent(listing.pickup_display);
              const url = Platform.select({
                ios: `maps:?q=${encoded}`,
                android: `geo:0,0?q=${encoded}`,
                default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
              });
              Linking.openURL(url!);
            }}
            style={{
              marginTop: 12,
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
              borderTopWidth: 1,
              borderColor: HAIRLINE,
            }}
          >
            <Ionicons name="navigate-outline" size={16} color={BRAND} />
            <Text
              style={{
                marginLeft: 8,
                fontSize: 13,
                fontWeight: '600',
                color: INK,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {listing.pickup_display}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={INK_MUTED} />
          </Pressable>
        </View>
      </ScrollView>

      <PhotoViewer
        visible={isViewerOpen}
        images={viewerImages}
        initialIndex={viewerStartIndex}
        onClose={() => setIsViewerOpen(false)}
      />

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="listing"
        targetId={listing.id}
        ownerUserId={listing.user_id}
        ownerName={listing.title}
        onSubmitted={() => navigation.goBack()}
      />

      {/* Sticky CTA */}
      {!isOwnListing && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: HAIRLINE,
            paddingHorizontal: 14,
            paddingTop: 12,
            // Sits above the tab bar (which clears the home indicator) —
            // no safe-area inset needed; it only made a big gap.
            paddingBottom: 16,
            flexDirection: 'row',
          }}
        >
          <Pressable
            onPress={handleMakeOffer}
            style={{
              flex: 1,
              borderWidth: 2,
              borderColor: BRAND,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: 'center',
              marginRight: 10,
            }}
            accessibilityRole="button"
            accessibilityLabel="Make offer"
          >
            <Text
              style={{ color: BRAND, fontSize: 13, fontWeight: '700' }}
            >
              Make offer
            </Text>
          </Pressable>
          <Pressable
            onPress={handleMessageSeller}
            disabled={startingConversation}
            style={{
              flex: 1,
              backgroundColor: BRAND,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
            }}
            accessibilityRole="button"
            accessibilityLabel="Ask seller"
          >
            {startingConversation ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={16}
                  color="#fff"
                />
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: '700',
                    marginLeft: 6,
                  }}
                >
                  Ask seller
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function GlassButton({
  icon,
  size,
  iconSize,
  iconColor = INK,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  size: number;
  iconSize: number;
  iconColor?: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(255,255,255,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
    >
      <Ionicons name={icon} size={iconSize} color={iconColor} />
    </Pressable>
  );
}

function VideoSlide({ uri }: { uri: string }) {
  const videoRef = useRef<any>(null);
  return (
    <View
      style={{
        width: SCREEN_WIDTH,
        height: HERO_HEIGHT,
        backgroundColor: '#000',
      }}
    >
      <Video
        ref={videoRef}
        source={{ uri }}
        style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT }}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls
        shouldPlay={false}
      />
    </View>
  );
}
