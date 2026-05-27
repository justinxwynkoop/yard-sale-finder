import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Linking,
  Platform,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useFavoriteListings } from '../../hooks/useFavoriteListings';
import { Button } from '../../components/ui';

type Route = RouteProp<ListingsStackParamList, 'ListingDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MEDIA_HEIGHT = 320;

export default function ListingDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation();
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

  const isOwnListing = listing?.user_id === user?.id;
  const favorited = listing ? isFavorited(listing.id) : false;

  const handleMessageSeller = async () => {
    if (!listing) return;
    setStartingConversation(true);
    const { id, error: convErr } = await startConversation('listing', listing.id);
    setStartingConversation(false);
    if (convErr) {
      Alert.alert(
        'Could not start conversation',
        convErr.message ?? 'Please try again.',
      );
      return;
    }
    if (id) {
      (navigation as any).navigate('Messages', {
        screen: 'Conversation',
        params: { conversationId: id },
      });
    }
  };

  const handleMoreMenu = () => {
    if (!listing) return;
    Alert.alert(
      listing.title,
      undefined,
      [
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
      ],
    );
  };

  useEffect(() => {
    supabase
      .from('listings')
      .select('*, profile:profiles(*), media:listing_media(*)')
      .eq('id', listingId)
      .single()
      .then(({ data }) => {
        if (data) {
          // Sort media by order
          data.media = (data.media ?? []).sort(
            (a: ListingMedia, b: ListingMedia) => a.order - b.order,
          );
          setListing(data);
        }
        setLoading(false);
      });
  }, [listingId]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  const openDirections = () => {
    if (!listing) return;
    const encoded = encodeURIComponent(listing.pickup_display);
    const url = Platform.select({
      ios: `maps:?q=${encoded}`,
      android: `geo:0,0?q=${encoded}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    });
    Linking.openURL(url!);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2D5F3E" />
      </View>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Ionicons name="alert-circle-outline" size={48} color="#D4D4D8" />
        <Text className="mt-3 text-base text-zinc-400">Listing not found.</Text>
        <Pressable className="mt-4" onPress={() => navigation.goBack()}>
          <Text className="font-semibold text-brand-600">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const media = listing.media ?? [];
  const hasMedia = media.length > 0;

  // Only images go into the full-screen viewer (videos have native controls)
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

  return (
    <View className="flex-1 bg-white">
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        {/* Media carousel */}
        {hasMedia ? (
          <View style={{ height: MEDIA_HEIGHT }}>
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
                      source={{ uri: item.url }}
                      style={{ width: SCREEN_WIDTH, height: MEDIA_HEIGHT }}
                      resizeMode="cover"
                    />
                  </Pressable>
                )
              }
            />

            {/* Dot indicators */}
            {media.length > 1 && (
              <View
                className="absolute bottom-3 left-0 right-0 flex-row justify-center"
                style={{ gap: 5 }}
                pointerEvents="none"
              >
                {media.map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: i === activeIndex ? 18 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: i === activeIndex ? '#2D5F3E' : 'rgba(255,255,255,0.7)',
                    }}
                  />
                ))}
              </View>
            )}

            {/* Media count badge */}
            {media.length > 1 && (
              <View
                className="absolute bottom-3 right-4 flex-row items-center rounded-full bg-black/50 px-2 py-1"
                style={{ gap: 4 }}
              >
                <Ionicons name="images-outline" size={12} color="#fff" />
                <Text className="text-xs font-semibold text-white">
                  {activeIndex + 1}/{media.length}
                </Text>
              </View>
            )}

            {/* Expand button — only shown when active slide is an image */}
            {media[activeIndex]?.type === 'image' && (
              <Pressable
                onPress={() => openViewer(activeIndex)}
                className="absolute bottom-12 right-4 h-8 w-8 items-center justify-center rounded-full bg-black/50 active:bg-black/70"
              >
                <Ionicons name="expand-outline" size={16} color="#fff" />
              </Pressable>
            )}
          </View>
        ) : (
          <View
            className="items-center justify-center bg-zinc-100"
            style={{ height: 200 }}
          >
            <Ionicons name="image-outline" size={56} color="#D4D4D8" />
          </View>
        )}

        {/* Content */}
        <View className="px-5 pt-5 pb-8">
          {/* Price + title */}
          <Text className="text-3xl font-extrabold text-brand-600">
            {listing.price === 0
              ? 'Free'
              : `$${listing.price % 1 === 0 ? listing.price : listing.price.toFixed(2)}`}
          </Text>
          <Text className="mt-1 text-xl font-bold text-zinc-900">{listing.title}</Text>

          {/* Status badge */}
          {listing.status === 'sold' && (
            <View className="mt-2 self-start rounded-full bg-zinc-200 px-3 py-1">
              <Text className="text-xs font-bold text-zinc-600 uppercase tracking-wide">Sold</Text>
            </View>
          )}

          {/* Seller */}
          {listing.profile?.display_name && (
            <View className="mt-4 flex-row items-center" style={{ gap: 8 }}>
              <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-100">
                <Text className="text-sm font-bold text-brand-600">
                  {listing.profile.display_name[0].toUpperCase()}
                </Text>
              </View>
              <Text className="text-sm text-zinc-600">
                Listed by{' '}
                <Text className="font-semibold text-zinc-900">
                  {listing.profile.display_name}
                </Text>
              </Text>
            </View>
          )}

          <View className="my-5 h-px bg-zinc-100" />

          {/* Description */}
          {listing.description ? (
            <>
              <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Description
              </Text>
              <Text className="text-base leading-6 text-zinc-700">{listing.description}</Text>
              <View className="my-5 h-px bg-zinc-100" />
            </>
          ) : null}

          {/* Categories */}
          {listing.categories.length > 0 && (
            <>
              <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Categories
              </Text>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {listing.categories.map((cat) => (
                  <View
                    key={cat}
                    className="rounded-full bg-brand-50 px-3 py-1.5"
                  >
                    <Text className="text-xs font-semibold capitalize text-brand-700">
                      {cat}
                    </Text>
                  </View>
                ))}
              </View>
              <View className="my-5 h-px bg-zinc-100" />
            </>
          )}

          {/* Pickup location */}
          <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Pickup location
          </Text>
          <Pressable
            className="flex-row items-center rounded-2xl bg-zinc-50 p-4 active:bg-zinc-100"
            style={{ gap: 12 }}
            onPress={openDirections}
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-100">
              <Ionicons name="location" size={20} color="#2D5F3E" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-zinc-900" numberOfLines={2}>
                {listing.pickup_display}
              </Text>
              <Text className="mt-0.5 text-xs text-brand-600 font-medium">
                Tap to open in Maps
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#A1A1AA" />
          </Pressable>
        </View>
      </ScrollView>

      {/* Sticky back button */}
      <View
        className="absolute left-4"
        style={{ top: insets.top + 8 }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          className="h-10 w-10 items-center justify-center rounded-full bg-black/40 active:bg-black/60"
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Top-right overlay: heart + overflow menu */}
      <View
        className="absolute right-4 flex-row"
        style={{ top: insets.top + 8, gap: 8 }}
      >
        {/* Heart — save/unsave this listing. Hidden on own listing. */}
        {!isOwnListing && (
          <Pressable
            onPress={() => listing && toggleFavorite(listing.id)}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/40 active:bg-black/60"
            accessibilityRole="button"
            accessibilityLabel={favorited ? 'Remove from saved' : 'Save listing'}
          >
            <Ionicons
              name={favorited ? 'heart' : 'heart-outline'}
              size={20}
              color={favorited ? '#F43F5E' : '#fff'}
            />
          </Pressable>
        )}

        {/* Overflow menu (Report / Block). Hidden on own listing. */}
        {!isOwnListing && (
          <Pressable
            onPress={handleMoreMenu}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/40 active:bg-black/60"
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
          </Pressable>
        )}
      </View>

      {/* Full-screen photo viewer */}
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

      {/* Sticky Message-seller CTA. Hidden on the user's own listing. */}
      {!isOwnListing && (
        <View
          className="absolute bottom-0 left-0 right-0 border-t border-zinc-100 bg-white px-4 pb-8 pt-3"
        >
          <Button
            size="lg"
            onPress={handleMessageSeller}
            loading={startingConversation}
            leftIcon={
              <Ionicons name="chatbubble-outline" size={18} color="#fff" />
            }
          >
            Message seller
          </Button>
        </View>
      )}
    </View>
  );
}

// ── Video slide ────────────────────────────────────────────────────────────

function VideoSlide({ uri }: { uri: string }) {
  const videoRef = useRef<any>(null);
  return (
    <View style={{ width: SCREEN_WIDTH, height: MEDIA_HEIGHT, backgroundColor: '#000' }}>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={{ width: SCREEN_WIDTH, height: MEDIA_HEIGHT }}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls
        shouldPlay={false}
      />
    </View>
  );
}
