import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Linking,
  Platform,
  ActivityIndicator,
  Dimensions,
  Pressable,
  Alert,
} from 'react-native';
import { shareSale } from '../../lib/share';
import { useSeenSales } from '../../hooks/useSeenSales';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import MapView, { Marker, Circle } from 'react-native-maps';
import {
  useRoute,
  RouteProp,
  useNavigation,
  useIsFocused,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStackBack } from '../../hooks/useStackBack';

import { Listing, MapStackParamList, Sale } from '../../types';
import { supabase } from '../../lib/supabase';
import { track } from '../../lib/analytics';
import {
  PLACEHOLDER_BLURHASH,
  transformedImageUrl,
} from '../../lib/imageUrl';
import { formatHM } from '../../utils/format';
import { saleScheduleTiles } from '../../utils/saleSchedule';
import { isOpenNow, minutesUntilClose } from '../../utils/saleStatus';
import { useFavorites } from '../../hooks/useFavorites';
import { useVisited } from '../../hooks/useVisited';
import { useAuth } from '../../hooks/useAuth';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { useStartConversation } from '../../hooks/useConversation';
import { navigateToConversation, navigateToEvent } from '../../lib/navigationRef';
import { promptSignIn } from '../../lib/guestGate';
import {
  saleDisplayLocation,
  approximateAreaLabel,
} from '../../lib/locationPrivacy';
import { useUserLocation } from '../../hooks/useUserLocation';
import { formatDistanceMiles, haversineMeters } from '../../utils/distance';
import { Avatar, HeaderButton } from '../../components/ui';
import { PhotoViewer } from '../../components/PhotoViewer';
import { ReportSheet } from '../../components/ReportSheet';
import { PaymentAccepted } from '../../components/PaymentAccepted';

type Route = RouteProp<MapStackParamList, 'SaleDetail'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_HEIGHT = 280;

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const AMBER = '#B8772C';
const AMBER_SOFT = '#FBEFD6';
const ROSE = '#A23E2D';

export default function SaleDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<any>();
  // Stack-local back — SaleDetail lives in MapStack, ListingsStack, ProfileStack.
  const goBack = useStackBack('MapHome', 'ListingsHome', 'ProfileHome');
  const insets = useSafeAreaInsets();
  // Defer mounting the mini-map until after the push animation has
  // finished. When the user arrives here from RoutePlanner (which also
  // has a MapView) the two AIRMaps would otherwise reconcile subviews
  // concurrently and crash under Fabric with
  //   -[__NSArrayM insertObject:atIndex:]: object cannot be nil
  // The 350ms delay matches react-navigation's default ios push timing
  // — by then the source screen has unmounted its MapView.
  const isFocused = useIsFocused();
  const [miniMapMounted, setMiniMapMounted] = useState(false);
  useEffect(() => {
    if (!isFocused) {
      setMiniMapMounted(false);
      return;
    }
    const t = setTimeout(() => setMiniMapMounted(true), 350);
    return () => clearTimeout(t);
  }, [isFocused]);
  const { saleId } = route.params;
  const { markSeen } = useSeenSales();

  // Opening a sale marks it "seen" for this user, which drops its NEW tag on
  // the map (it's no longer new to someone who's already looked at it).
  useEffect(() => {
    markSeen(saleId);
    track('sale_viewed', { saleId });
  }, [saleId, markSeen]);

  const [sale, setSale] = useState<Sale | null>(null);
  const [memberEvent, setMemberEvent] = useState<{ id: string; title: string } | null>(null);
  const [linkedListings, setLinkedListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeImage, setActiveImage] = useState(0);
  // Hero carousel position across ALL media (images + video); the photo
  // counter reads this. `activeImage` separately tracks which IMAGE the
  // lightbox opens to (video isn't shown in the lightbox).
  const [activeSlide, setActiveSlide] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { isFavorited, toggle: toggleFavorite } = useFavorites();
  const { isVisited, toggle: toggleVisited } = useVisited();
  const { user } = useAuth();
  const { block } = useBlockedUsers();
  const { start: startConversation } = useStartConversation();
  const [startingConversation, setStartingConversation] = useState(false);
  const userLocation = useUserLocation();
  // Sticky-CTA height (the "Mark visited" row only shows for non-owners,
  // so it varies). Declared up here with the other hooks — NOT after the
  // loading/!sale early returns below — or the hook order changes once
  // the sale loads ("rendered more hooks than during the previous render").
  const [ctaHeight, setCtaHeight] = useState(180);

  const isOwnSale = sale?.user_id === user?.id;
  // Address-privacy resolution. exactUnlocked is true for the owner; the
  // automated "unlocks once the host replies to this buyer" path needs
  // per-conversation reply tracking and is a scoped follow-up — until
  // then a 'reply'-mode sale stays approximate for non-owners, with a
  // note explaining how the exact address is shared.
  const loc = sale
    ? saleDisplayLocation(sale, { isOwner: isOwnSale })
    : null;
  const saved = sale ? isFavorited(sale.id) : false;
  const visited = sale ? isVisited(sale.id) : false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .select('*, media:sale_media(*)')
        .eq('id', saleId)
        .single();
      if (cancelled) return;
      // PGRST116 = zero rows (a genuinely missing/deleted sale). Anything
      // else is a fetch failure and must NOT render as "Sale not found."
      if (saleErr && saleErr.code !== 'PGRST116') {
        setLoadError(saleErr.message);
        setLoading(false);
        return;
      }
      if (!saleData) {
        setLoading(false);
        return;
      }
      // Everything below depends only on saleData, so it runs in PARALLEL —
      // the old sequential chain (profile, then listings) put two extra
      // ~120ms round-trips on the critical path of every sale open.
      const [{ data: profileData }, { data: linked }, { data: eventRow }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .eq('id', saleData.user_id)
            .maybeSingle(),
          // Best-effort fetch of listings the host linked to this sale.
          // Featured Items rail renders from this; empty → falls back
          // to a photo preview rail below.
          supabase
            .from('listings')
            .select('*, media:listing_media(*)')
            .eq('sale_id', saleId)
            .eq('status', 'available')
            .order('created_at', { ascending: false })
            .limit(12),
          // The neighborhood event this sale belongs to, if any — renders
          // the tappable "Part of …" strip below the schedule.
          saleData.event_id
            ? supabase
                .from('sale_events')
                .select('id, title')
                .eq('id', saleData.event_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
      if (cancelled) return;
      setSale({ ...saleData, profile: profileData ?? undefined });
      setMemberEvent((eventRow as { id: string; title: string } | null) ?? null);
      if (linked) setLinkedListings(linked as Listing[]);
      setLoading(false);
      // Count this view (the RPC skips the owner's own views).
      void supabase.rpc('increment_sale_view', { p_id: saleId });
    })();
    return () => {
      cancelled = true;
    };
  }, [saleId, reloadKey]);

  const handleMessageSeller = async () => {
    if (!sale) return;
    if (!user) {
      promptSignIn('message sellers about their sales');
      return;
    }
    setStartingConversation(true);
    const { id, error: convErr } = await startConversation('sale', sale.id);
    setStartingConversation(false);
    if (convErr) {
      // Generic copy — never echo the RPC's reason (e.g. a block), which would
      // reveal to a blocked user that they're blocked.
      Alert.alert('Could not start conversation', 'Please try again.');
      return;
    }
    if (id) {
      // Use the global helper so the Inbox tab is properly initialized
      // with InboxHome below Conversation — otherwise React Navigation
      // sometimes lands Conversation as the stack root and the back
      // button disappears. See navigationRef.ts for the rationale.
      navigateToConversation(id);
    }
  };

  const handleMoreMenu = () => {
    if (!sale) return;
    Alert.alert(sale.title, undefined, [
      {
        text: 'Report sale',
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
              sale.profile?.display_name ?? 'this user'
            } in the app.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Block',
                style: 'destructive',
                onPress: async () => {
                  const { error } = await block(sale.user_id);
                  if (error) {
                    Alert.alert('Could not block', error.message);
                    return;
                  }
                  goBack();
                },
              },
            ],
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openDirections = () => {
    if (!sale) return;
    // When the address is still approximate (reply-mode, not unlocked),
    // route to the blurred coordinates rather than the exact street
    // address so directions don't leak what the map is hiding.
    if (loc && !loc.showExactAddress) {
      const q = `${loc.latitude},${loc.longitude}`;
      const url = Platform.select({
        ios: `maps:?q=${q}`,
        android: `geo:0,0?q=${q}`,
        default: `https://www.google.com/maps/search/?api=1&query=${q}`,
      });
      Linking.openURL(url!);
      return;
    }
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

  if (loadError && !sale) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          paddingHorizontal: 32,
        }}
      >
        <Ionicons name="cloud-offline-outline" size={48} color={INK_MUTED} />
        <Text style={{ marginTop: 12, color: INK_SOFT }}>
          {"Couldn’t load this sale."}
        </Text>
        <Pressable
          onPress={() => setReloadKey((k) => k + 1)}
          style={{
            marginTop: 24,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: BRAND,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => goBack()} style={{ marginTop: 14 }}>
          <Text style={{ color: INK, fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!sale) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          paddingHorizontal: 32,
        }}
      >
        <Ionicons name="alert-circle-outline" size={48} color={INK_MUTED} />
        <Text style={{ marginTop: 12, color: INK_SOFT }}>Sale not found.</Text>
        <Pressable
          onPress={() => goBack()}
          style={{
            marginTop: 24,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: HAIRLINE,
          }}
        >
          <Text style={{ color: INK, fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // All media (images + video) in order — the hero carousel shows everything;
  // `images` (image-only) drives the lightbox + thumbnail rail since the
  // lightbox can't play video.
  const media = [...(sale.media ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const images = media.filter((m) => m.type === 'image');
  const open = isOpenNow(sale);
  const distance =
    userLocation != null
      ? haversineMeters(
          userLocation.latitude,
          userLocation.longitude,
          sale.latitude,
          sale.longitude,
        )
      : null;
  const driveMin =
    distance != null ? Math.max(1, Math.round(distance / 805)) : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView
        bounces={false}
        contentContainerStyle={{ paddingBottom: ctaHeight + 16 }}
      >
        {/* Hero */}
        <View style={{ height: HERO_HEIGHT, backgroundColor: BRAND_SOFT }}>
          {media.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(
                  e.nativeEvent.contentOffset.x / SCREEN_WIDTH,
                );
                setActiveSlide(idx);
              }}
            >
              {media.map((item) =>
                item.type === 'video' ? (
                  <VideoSlide key={item.id} uri={item.url} />
                ) : (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      // Open the lightbox at this image's position within the
                      // image-only list (video slides are skipped there).
                      const imgIdx = images.findIndex((m) => m.id === item.id);
                      setActiveImage(imgIdx < 0 ? 0 : imgIdx);
                      setIsViewerOpen(true);
                    }}
                  >
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
                      cachePolicy="memory-disk"
                    />
                  </Pressable>
                ),
              )}
            </ScrollView>
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
              onPress={() => goBack()}
              variant="glass"
              accessibilityLabel="Back"
            />
            <View style={{ flex: 1 }} />
            <GlassButton
              icon={saved ? 'heart' : 'heart-outline'}
              iconColor={saved ? ROSE : INK}
              size={38}
              iconSize={18}
              onPress={() =>
                user
                  ? toggleFavorite(sale.id)
                  : promptSignIn('save sales you want to revisit')
              }
              accessibilityLabel={saved ? 'Unsave sale' : 'Save sale'}
            />
            <View style={{ width: 8 }} />
            <GlassButton
              icon="share-outline"
              size={38}
              iconSize={18}
              onPress={() =>
                shareSale(sale, {
                  where: loc?.showExactAddress
                    ? sale.address
                    : approximateAreaLabel(sale),
                })
              }
              accessibilityLabel="Share"
            />
            {!isOwnSale && (
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

          {/* Media counter chip */}
          {media.length > 0 && (
            <View
              style={{
                position: 'absolute',
                bottom: 38,
                right: 12,
                backgroundColor: 'rgba(20,18,15,0.65)',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 99,
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: '600',
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                }}
              >
                {activeSlide + 1} / {media.length}
              </Text>
            </View>
          )}
        </View>

        {/* Body overlapping hero */}
        <View
          style={{
            marginTop: -22,
            backgroundColor: '#fff',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 20,
            paddingTop: 20,
          }}
        >
          {open && <OpenNowChip sale={sale} />}

          <Text
            style={{
              marginTop: open ? 8 : 0,
              fontSize: 24,
              fontWeight: '700',
              color: INK,
              letterSpacing: -0.4,
              lineHeight: 28,
            }}
            numberOfLines={2}
          >
            {sale.title}
          </Text>

          {/* Address line */}
          <View
            style={{
              marginTop: 6,
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Ionicons
              name={loc?.showExactAddress ? 'location-outline' : 'navigate-circle-outline'}
              size={13}
              color={INK_MUTED}
            />
            <Text
              style={{
                marginLeft: 4,
                fontSize: 13,
                color: INK_SOFT,
                flexShrink: 1,
              }}
            >
              {loc?.showExactAddress ? sale.address : approximateAreaLabel(sale)}
            </Text>
            {distance != null && (
              <Text
                style={{
                  marginLeft: 4,
                  fontSize: 13,
                  fontWeight: '700',
                  color: ROSE,
                }}
              >
                · {formatDistanceMiles(distance)}
              </Text>
            )}
            {driveMin != null && (
              <Text style={{ marginLeft: 4, fontSize: 13, color: INK_SOFT }}>
                · {driveMin} min drive
              </Text>
            )}
          </View>

          {/* Address-privacy note — only when the exact address is hidden */}
          {loc && !loc.showExactAddress && (
            <View
              style={{
                marginTop: 8,
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 6,
                backgroundColor: '#FBEFD6',
                borderRadius: 10,
                paddingVertical: 8,
                paddingHorizontal: 10,
              }}
            >
              <Ionicons name="lock-closed-outline" size={13} color="#6B4318" />
              <Text
                style={{ flex: 1, fontSize: 12, color: '#6B4318', lineHeight: 17 }}
              >
                The host shares their exact address after they reply to your
                message. Until then the map shows an approximate area.
              </Text>
            </View>
          )}

          {/* Stat strip */}
          <StatStrip sale={sale} />

          {/* Neighborhood event membership — tappable through to the event
              page, so shoppers can hop from any stop to the whole group. */}
          {memberEvent && (
            <Pressable
              onPress={() => navigateToEvent({ eventId: memberEvent.id })}
              accessibilityRole="button"
              accessibilityLabel={`View the ${memberEvent.title}`}
              style={{
                marginTop: 12,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: BRAND_SOFT,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Ionicons name="home" size={16} color={BRAND} />
              <Text
                style={{ marginLeft: 8, flex: 1, fontSize: 13, fontWeight: '700', color: BRAND }}
                numberOfLines={1}
              >
                Part of the {memberEvent.title}
              </Text>
              <Ionicons name="chevron-forward" size={15} color={BRAND} />
            </Pressable>
          )}

          {/* Pricing — full width + wrapping so longer notes (several options)
              show in full instead of being cut off in a tile. */}
          {sale.pricing_notes ? (
            <View
              style={{
                marginTop: 12,
                backgroundColor: BONE,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 9.5,
                  fontWeight: '700',
                  color: INK_MUTED,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                Pricing
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: INK,
                  marginTop: 4,
                }}
              >
                {sale.pricing_notes}
              </Text>
            </View>
          ) : null}

          {/* Category chips */}
          {sale.categories.length > 0 && (
            <View
              style={{
                marginTop: 16,
                flexDirection: 'row',
                flexWrap: 'wrap',
              }}
            >
              {sale.categories.map((cat) => (
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
                    {labelForCategory(cat)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Description */}
          {sale.description ? (
            <Text
              style={{
                marginTop: 16,
                fontSize: 14,
                lineHeight: 22,
                color: INK,
              }}
            >
              {sale.description}
            </Text>
          ) : null}

          <PaymentAccepted
            methods={sale.profile?.accepted_payments}
            style={{ marginTop: 18 }}
          />

          {/* Featured items rail — real linked listings when present,
              otherwise a photo preview rail from sale.media. */}
          {linkedListings.length > 0 ? (
            <View style={{ marginTop: 22 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{ fontSize: 14, fontWeight: '700', color: INK }}
                >
                  Items previewed
                </Text>
                {linkedListings.length > 4 && (
                  <Text
                    style={{ fontSize: 11, fontWeight: '600', color: BRAND }}
                  >
                    See all {linkedListings.length}
                  </Text>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 10 }}
              >
                {linkedListings.map((listing) => {
                  const firstImg = listing.media?.find(
                    (m) => m.type === 'image',
                  );
                  const thumb = transformedImageUrl(firstImg?.url, {
                    width: 240,
                    height: 240,
                    resize: 'cover',
                    quality: 75,
                  });
                  return (
                    <Pressable
                      key={listing.id}
                      onPress={() =>
                        navigation.navigate('Listings' as any, {
                          screen: 'ListingDetail',
                          params: { listingId: listing.id },
                        })
                      }
                      style={{ width: 96, marginRight: 8 }}
                    >
                      <View
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: 10,
                          overflow: 'hidden',
                          backgroundColor: BRAND_SOFT,
                        }}
                      >
                        {thumb ? (
                          <Image
                            source={{ uri: thumb }}
                            placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                            transition={120}
                          />
                        ) : (
                          <View
                            style={{
                              flex: 1,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Ionicons
                              name="pricetag-outline"
                              size={22}
                              color={BRAND}
                            />
                          </View>
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          marginTop: 5,
                          fontSize: 11,
                          fontWeight: '600',
                          color: INK,
                        }}
                      >
                        {listing.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: BRAND,
                        }}
                      >
                        {listing.price === 0
                          ? 'Free'
                          : `$${listing.price % 1 === 0 ? listing.price : listing.price.toFixed(2)}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : images.length > 0 ? (
            <View style={{ marginTop: 22 }}>
              <Text
                style={{ fontSize: 14, fontWeight: '700', color: INK }}
              >
                Photos
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 10 }}
              >
                {images.slice(0, 8).map((img, idx) => (
                  <Pressable
                    key={img.id}
                    onPress={() => {
                      setActiveImage(idx);
                      setIsViewerOpen(true);
                    }}
                    style={{ width: 96, marginRight: 8 }}
                  >
                    <View
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: 10,
                        overflow: 'hidden',
                      }}
                    >
                      <Image
                        source={{
                          uri: transformedImageUrl(img.url, {
                            width: 240,
                            height: 240,
                            resize: 'cover',
                            quality: 75,
                          }),
                        }}
                        placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        transition={120}
                      />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Host card */}
          {sale.profile && (
            <View
              style={{
                marginTop: 22,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: HAIRLINE,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Pressable
                onPress={() =>
                  sale.profile?.id &&
                  (navigation as any).navigate('PublicProfile', {
                    userId: sale.profile.id,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`View ${
                  sale.profile.display_name ?? 'host'
                }'s profile`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flex: 1,
                }}
              >
                <Avatar
                  uri={sale.profile.avatar_url}
                  name={sale.profile.display_name ?? 'Seller'}
                  size="md"
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={{ fontSize: 13, fontWeight: '700', color: INK }}
                  >
                    Hosted by {sale.profile.display_name ?? 'Anonymous'}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginTop: 2,
                    }}
                  >
                    <Ionicons name="star" size={11} color={AMBER} />
                    <Text
                      style={{
                        marginLeft: 3,
                        fontSize: 11,
                        color: INK_MUTED,
                      }}
                    >
                      New host
                    </Text>
                  </View>
                </View>
              </Pressable>
              {!isOwnSale && sale.allow_messages !== false && (
                <Pressable
                  onPress={handleMessageSeller}
                  disabled={startingConversation}
                  style={{
                    borderWidth: 1,
                    borderColor: HAIRLINE,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Message host"
                >
                  {startingConversation ? (
                    <ActivityIndicator size="small" color={INK} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: INK,
                      }}
                    >
                      Message
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          )}

          {/* Mini map */}
          <View style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: INK }}>
              How to get there
            </Text>
            <View
              style={{
                marginTop: 10,
                height: 130,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: '#E1ECDF',
              }}
            >
              {miniMapMounted && loc ? (
                <MapView
                  style={{ flex: 1 }}
                  initialRegion={{
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    // Zoom out a touch for approximate sales so the whole
                    // blur circle is comfortably in frame.
                    latitudeDelta: loc.approximate ? 0.04 : 0.02,
                    longitudeDelta: loc.approximate ? 0.04 : 0.02,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  showsUserLocation
                >
                  {loc.approximate ? (
                    // Approximate: a translucent brand circle instead of a
                    // precise pin, so the exact address isn't inferable.
                    <Circle
                      center={{
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                      }}
                      radius={loc.radiusMeters}
                      strokeColor="rgba(31,77,58,0.5)"
                      fillColor="rgba(31,77,58,0.14)"
                      strokeWidth={2}
                    />
                  ) : (
                    // Exact: custom child view rather than `pinColor` — the
                    // default native pin requires no React subview, but
                    // AIRMap under Fabric crashes during subview insert
                    // when the React-side child count is 0.
                    <Marker
                      key={`mini-${sale.id}`}
                      coordinate={{
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                      }}
                      anchor={{ x: 0.5, y: 0.5 }}
                      tracksViewChanges={false}
                    >
                      <View
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          backgroundColor: BRAND,
                          borderWidth: 2,
                          borderColor: '#fff',
                        }}
                      />
                    </Marker>
                  )}
                </MapView>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      <PhotoViewer
        visible={isViewerOpen}
        images={images.map((m) => ({ id: m.id, url: m.url }))}
        initialIndex={activeImage}
        onClose={() => setIsViewerOpen(false)}
      />

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="sale"
        targetId={sale.id}
        ownerUserId={sale.user_id}
        ownerName={sale.title}
        onSubmitted={() => goBack()}
      />

      {/* Sticky CTA */}
      <View
        onLayout={(e) => setCtaHeight(e.nativeEvent.layout.height)}
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
          // No insets.bottom here: this bar sits ABOVE the bottom tab bar,
          // which already clears the home indicator. Adding the inset just
          // created a big dead gap between the buttons and the tabs.
          paddingBottom: 16,
        }}
      >
        {/* Mark visited — the standalone primitive behind the (currently
            hidden) route planner's "Visited" action. Full-width toggle so
            it reads as the primary affordance. */}
        {!isOwnSale && (
          <Pressable
            onPress={() =>
              user
                ? toggleVisited(sale.id)
                : promptSignIn('keep track of the sales you visit')
            }
            style={{
              borderRadius: 12,
              paddingVertical: 11,
              marginBottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              backgroundColor: visited ? BRAND_SOFT : '#fff',
              borderWidth: 1,
              borderColor: visited ? BRAND : HAIRLINE,
            }}
            accessibilityRole="button"
            accessibilityState={{ checked: visited }}
            accessibilityLabel={visited ? 'Visited' : 'Mark visited'}
          >
            <Ionicons
              name={visited ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={18}
              color={visited ? BRAND : INK_SOFT}
            />
            <Text
              style={{
                fontSize: 13.5,
                fontWeight: '700',
                color: visited ? BRAND : INK,
              }}
            >
              {visited ? 'Visited' : 'Mark visited'}
            </Text>
          </Pressable>
        )}

        <View style={{ flexDirection: 'row' }}>
          <Pressable
            onPress={() =>
              user
                ? toggleFavorite(sale.id)
                : promptSignIn('save sales you want to revisit')
            }
          style={{
            borderWidth: 1,
            borderColor: HAIRLINE,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            marginRight: 10,
          }}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Saved' : 'Save'}
        >
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={16}
            color={saved ? ROSE : INK}
          />
          <Text
            style={{
              marginLeft: 6,
              fontSize: 13,
              fontWeight: '600',
              color: INK,
            }}
          >
            {saved ? 'Saved' : 'Save'}
          </Text>
        </Pressable>
        <Pressable
          onPress={openDirections}
          style={{
            flex: 1,
            backgroundColor: BRAND,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityRole="button"
          accessibilityLabel="Get directions"
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 14,
              fontWeight: '700',
              marginRight: 8,
            }}
          >
            Directions
          </Text>
          {driveMin != null && (
            <Text style={{ color: '#fff', fontSize: 13, opacity: 0.9 }}>
              {driveMin} min
            </Text>
          )}
          <Ionicons
            name="arrow-forward"
            size={16}
            color="#fff"
            style={{ marginLeft: 8 }}
          />
        </Pressable>
        </View>
      </View>
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
        backgroundColor: 'rgba(255,255,255,0.94)',
        borderWidth: 1,
        borderColor: 'rgba(20,18,15,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        // Tight low shadow (match HeaderButton glass) — defined edge does
        // the work, so it doesn't float over light photos.
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
      }}
    >
      <Ionicons name={icon} size={iconSize} color={iconColor} />
    </Pressable>
  );
}

function OpenNowChip({ sale }: { sale: Sale }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const minsLeft = minutesUntilClose(sale);
  const close = formatHM(sale.end_time.slice(0, 5));
  const tail =
    minsLeft != null && minsLeft <= 60
      ? `CLOSES IN ${minsLeft} MIN`
      : `CLOSES ${close}`;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: AMBER_SOFT,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 99,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 99,
          backgroundColor: AMBER,
          marginRight: 6,
        }}
      />
      <Text
        style={{
          color: AMBER,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.4,
        }}
      >
        OPEN NOW · {tail}
      </Text>
    </View>
  );
}

function StatStrip({ sale }: { sale: Sale }) {
  // One tile per sale day, date joined to the weekday ("FRI · AUG 28") so the
  // reader never has to match a bare weekday against a separate date range;
  // 4+ day spans collapse to a single range tile. Pricing is NOT shown here —
  // it's a full-width row below (see the Pricing block in the detail body) so
  // longer notes with several options aren't cut off.
  const hours = `${formatHM(sale.start_time.slice(0, 5))}–${formatHM(sale.end_time.slice(0, 5))}`;
  const tiles = saleScheduleTiles(sale.start_date, sale.end_date, hours);
  return (
    <View
      style={{
        marginTop: 14,
        flexDirection: 'row',
      }}
    >
      {tiles.map((tile, i) => (
        <StatTile key={tile.label} label={tile.label} value={tile.value} flex first={i === 0} />
      ))}
    </View>
  );
}

function StatTile({
  label,
  value,
  flex,
  first,
}: {
  label: string;
  value: string;
  flex?: boolean;
  first?: boolean;
}) {
  return (
    <View
      style={{
        flex: flex ? 1 : undefined,
        backgroundColor: BONE,
        borderRadius: 12,
        padding: 12,
        marginLeft: first ? 0 : 8,
      }}
    >
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: '700',
          color: INK_MUTED,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text
        style={{ fontSize: 13, fontWeight: '700', color: INK, marginTop: 4 }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function labelForCategory(c: string): string {
  return c
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

// Inline video player for the hero carousel. Mirrors ListingDetail's
// VideoSlide — native controls, doesn't autoplay.
function VideoSlide({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return (
    <View
      style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT, backgroundColor: '#000' }}
    >
      <VideoView
        player={player}
        style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT }}
        nativeControls
        contentFit="contain"
      />
    </View>
  );
}
