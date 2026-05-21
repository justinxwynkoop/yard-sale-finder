import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Linking,
  Platform,
  ActivityIndicator,
  Dimensions,
  Share,
} from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { Image } from 'expo-image';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { MapStackParamList, Sale } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  PLACEHOLDER_BLURHASH,
  transformedImageUrl,
} from '../../lib/imageUrl';
import { formatSaleDate, formatSaleTime } from '../../utils/format';
import { isOpenNow, minutesUntilClose } from '../../utils/saleStatus';
import { useFavorites } from '../../hooks/useFavorites';
import {
  Avatar,
  Badge,
  Button,
  Card,
  IconButton,
  Section,
  StatusBadge,
} from '../../components/ui';
import { PhotoViewer } from '../../components/PhotoViewer';

type Route = RouteProp<MapStackParamList, 'SaleDetail'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const GALLERY_HEIGHT = 320;

export default function SaleDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { saleId } = route.params;

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const { isFavorited, toggle: toggleFavorite } = useFavorites();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Fetch sale + media first (no profile embed, so the sale loads
      // even if the host has no profile row). Then best-effort fetch
      // the host profile separately.
      const { data: saleData } = await supabase
        .from('sales')
        .select('*, media:sale_media(*)')
        .eq('id', saleId)
        .single();
      if (cancelled || !saleData) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', saleData.user_id)
        .maybeSingle();
      if (cancelled) return;
      setSale({ ...saleData, profile: profileData ?? undefined });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
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
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (!sale) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-8">
        <Ionicons name="alert-circle-outline" size={48} color="#A1A1AA" />
        <Text className="mt-3 text-base text-zinc-500">Sale not found.</Text>
        <View className="mt-6 w-full max-w-xs">
          <Button variant="outline" onPress={() => navigation.goBack()}>
            Go back
          </Button>
        </View>
      </View>
    );
  }

  const images = sale.media?.filter((m) => m.type === 'image') ?? [];

  return (
    <View className="flex-1 bg-white">
      <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Hero gallery */}
        <View style={{ height: GALLERY_HEIGHT }}>
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(
                  e.nativeEvent.contentOffset.x / SCREEN_WIDTH,
                );
                setActiveImage(idx);
              }}
            >
              {images.map((img) => (
                <Image
                  key={img.id}
                  source={{
                    uri: transformedImageUrl(img.url, {
                      width: Math.round(SCREEN_WIDTH * 2),
                      height: GALLERY_HEIGHT * 2,
                      resize: 'cover',
                      quality: 80,
                    }),
                  }}
                  placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
                  style={{
                    width: SCREEN_WIDTH,
                    height: GALLERY_HEIGHT,
                  }}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="memory-disk"
                />
              ))}
            </ScrollView>
          ) : (
            <View className="flex-1 items-center justify-center bg-brand-50">
              <Ionicons name="image-outline" size={72} color="#FB923C" />
              <Text className="mt-2 text-sm text-brand-700">No photos yet</Text>
            </View>
          )}

          {/* Floating back button */}
          <View className="absolute left-4" style={{ top: 56 }}>
            <IconButton
              variant="glass"
              size="md"
              icon={<Ionicons name="chevron-back" size={22} color="#18181B" />}
              onPress={() => navigation.goBack()}
            />
          </View>

          {/* Floating status / open-now badge */}
          <View
            className="absolute right-4 flex-row items-center"
            style={{ top: 56, gap: 6 }}
          >
            {isOpenNow(sale) && (
              <Badge tone="live" dot>
                Open now
              </Badge>
            )}
            <StatusBadge status={sale.status} />
            <IconButton
              variant="glass"
              size="sm"
              icon={
                <Ionicons
                  name={isFavorited(sale.id) ? 'heart' : 'heart-outline'}
                  size={16}
                  color={isFavorited(sale.id) ? '#DC2626' : '#18181B'}
                />
              }
              onPress={() => toggleFavorite(sale.id)}
            />
            <IconButton
              variant="glass"
              size="sm"
              icon={<Ionicons name="share-outline" size={16} color="#18181B" />}
              onPress={async () => {
                const url = ExpoLinking.createURL(`sale/${sale.id}`);
                try {
                  await Share.share({
                    title: sale.title,
                    message: `${sale.title}\n${sale.address}\n${url}`,
                    url, // iOS-only — Android uses message
                  });
                } catch {
                  /* user dismissed sheet */
                }
              }}
            />
          </View>

          {/* Floating 'expand' button — opens full-screen viewer at the current photo */}
          {images.length > 0 && (
            <View className="absolute bottom-3 right-4">
              <IconButton
                variant="glass"
                size="sm"
                icon={<Ionicons name="expand-outline" size={16} color="#18181B" />}
                onPress={() => setIsViewerOpen(true)}
              />
            </View>
          )}

          {/* Page dots */}
          {images.length > 1 && (
            <View className="absolute bottom-3 left-0 right-0 flex-row items-center justify-center" pointerEvents="none">
              {images.map((_, i) => (
                <View
                  key={i}
                  className={[
                    'mx-1 h-1.5 rounded-full',
                    i === activeImage ? 'w-6 bg-white' : 'w-1.5 bg-white/60',
                  ].join(' ')}
                />
              ))}
            </View>
          )}
        </View>

        {/* Body */}
        <View className="px-5 pt-5">
          <Text className="text-2xl font-extrabold text-zinc-900">
            {sale.title}
          </Text>

          <EndsSoonBanner sale={sale} />

          {/* Quick info card */}
          <Card className="mt-4 p-4">
            <View className="flex-row items-center">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
                <Ionicons name="calendar-outline" size={20} color="#F97316" />
              </View>
              <View className="flex-1">
                <Text className="text-xs uppercase tracking-wide text-zinc-400">
                  When
                </Text>
                <Text className="text-sm font-semibold text-zinc-900">
                  {formatSaleDate(sale.start_date, sale.end_date)}
                </Text>
                <Text className="text-sm text-zinc-600">
                  {formatSaleTime(sale.start_time, sale.end_time)}
                </Text>
              </View>
            </View>
            <View className="my-3 h-px bg-zinc-100" />
            <View className="flex-row items-center">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
                <Ionicons name="location-outline" size={20} color="#F97316" />
              </View>
              <View className="flex-1">
                <Text className="text-xs uppercase tracking-wide text-zinc-400">
                  Where
                </Text>
                <Text className="text-sm font-semibold text-zinc-900">
                  {sale.address}
                </Text>
              </View>
            </View>
          </Card>

          {/* Host */}
          {sale.profile && (
            <Card className="mt-3 flex-row items-center p-4">
              <Avatar
                uri={sale.profile.avatar_url}
                name={sale.profile.display_name ?? sale.profile.email}
                size="md"
              />
              <View className="ml-3 flex-1">
                <Text className="text-xs uppercase tracking-wide text-zinc-400">
                  Hosted by
                </Text>
                <Text className="text-sm font-semibold text-zinc-900">
                  {sale.profile.display_name ?? 'Anonymous'}
                </Text>
              </View>
            </Card>
          )}

          {/* Categories */}
          {sale.categories.length > 0 && (
            <Section title="What you'll find">
              <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                {sale.categories.map((cat) => (
                  <Badge key={cat} tone="brand">
                    {cat}
                  </Badge>
                ))}
              </View>
            </Section>
          )}

          {/* Description */}
          {sale.description && (
            <Section title="About this sale">
              <Text className="text-base leading-6 text-zinc-700">
                {sale.description}
              </Text>
            </Section>
          )}

          {/* Pricing notes */}
          {sale.pricing_notes && (
            <Section title="Pricing">
              <Text className="text-base leading-6 text-zinc-700">
                {sale.pricing_notes}
              </Text>
            </Section>
          )}
        </View>
      </ScrollView>

      <PhotoViewer
        visible={isViewerOpen}
        images={images.map((m) => ({ id: m.id, url: m.url }))}
        initialIndex={activeImage}
        onClose={() => setIsViewerOpen(false)}
      />

      {/* Sticky CTA */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-zinc-100 bg-white px-4 pb-8 pt-3">
        <Button
          size="lg"
          onPress={openDirections}
          leftIcon={<Ionicons name="navigate" size={20} color="#fff" />}
        >
          Get directions
        </Button>
      </View>
    </View>
  );
}

/**
 * Banner that shows under the title when the sale closes within the
 * next 2 hours TODAY. Re-evaluates every minute via a tick state so
 * the countdown stays fresh as long as the user is on the page.
 */
function EndsSoonBanner({ sale }: { sale: Sale }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const minsLeft = minutesUntilClose(sale);
  if (minsLeft == null || minsLeft > 120) return null;

  let label: string;
  if (minsLeft <= 1) label = 'Closing now';
  else if (minsLeft < 60) label = `Ends in ${minsLeft} min`;
  else {
    const h = Math.floor(minsLeft / 60);
    const m = minsLeft % 60;
    label = m === 0 ? `Ends in ${h} hr` : `Ends in ${h}h ${m}m`;
  }

  return (
    <View
      style={{
        marginTop: 12,
        backgroundColor: '#FEF3C7',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Ionicons name="time" size={18} color="#92400E" />
      <Text
        style={{
          color: '#92400E',
          fontWeight: '700',
          fontSize: 13,
          flex: 1,
        }}
      >
        {label} — head over now if you're nearby.
      </Text>
    </View>
  );
}
