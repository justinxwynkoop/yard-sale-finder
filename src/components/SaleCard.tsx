import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Sale } from '../types';
import { formatSaleTime } from '../utils/format';
import { formatDistanceMiles, haversineMeters } from '../utils/distance';
import { isOpenNow } from '../utils/saleStatus';
import { PLACEHOLDER_BLURHASH, transformedImageUrl } from '../lib/imageUrl';
import { useFavorites } from '../hooks/useFavorites';

const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const ROSE = '#A23E2D';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

export type SaleCardDensity = 'compact' | 'comfy' | 'hero';

interface Props {
  sale: Sale;
  /** 0-indexed; the badge shows index+1. */
  index?: number;
  density?: SaleCardDensity;
  userLat?: number;
  userLng?: number;
  onPress: () => void;
}

function SaleCardInner({
  sale,
  index,
  density = 'comfy',
  userLat,
  userLng,
  onPress,
}: Props) {
  const { isFavorited, toggle } = useFavorites();
  const saved = isFavorited(sale.id);
  const open = isOpenNow(sale);

  const distance =
    userLat != null && userLng != null
      ? haversineMeters(userLat, userLng, sale.latitude, sale.longitude)
      : null;
  const distLabel = distance != null ? formatDistanceMiles(distance) : '';
  const driveLabel = distance != null ? `${Math.max(1, Math.round(distance / 805))} min` : '';
  const hours = formatSaleTime(sale.start_time, sale.end_time);

  const firstImage = sale.media?.find((m) => m.type === 'image');

  const handleHeartPress = (e: any) => {
    e.stopPropagation?.();
    toggle(sale.id);
  };

  if (density === 'compact') {
    return (
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          marginBottom: 6,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderWidth: 1,
          borderColor: HAIRLINE,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            backgroundColor: open ? BRAND : INK_MUTED,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 11,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
            {(index ?? 0) + 1}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 14,
                fontWeight: '700',
                color: INK,
                letterSpacing: -0.2,
              }}
            >
              {sale.title}
            </Text>
            {distLabel ? (
              <Text style={{ fontSize: 11, fontWeight: '700', color: INK, marginLeft: 6 }}>
                {distLabel}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 1,
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: 11, color: INK_SOFT, flexShrink: 1 }}>
              {sale.address}
            </Text>
            <View
              style={{
                width: 3,
                height: 3,
                borderRadius: 99,
                backgroundColor: HAIRLINE,
                marginHorizontal: 6,
              }}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: open ? BRAND : INK_MUTED,
              }}
            >
              {open ? 'Open · ' : ''}
              {hours}
            </Text>
          </View>
        </View>
        <Pressable onPress={handleHeartPress} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={15}
            color={saved ? ROSE : INK_MUTED}
          />
        </Pressable>
      </Pressable>
    );
  }

  if (density === 'hero') {
    return (
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: '#fff',
          borderRadius: 18,
          marginBottom: 14,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: HAIRLINE,
        }}
      >
        <View style={{ height: 168 }}>
          <Photo url={firstImage?.url} />
          <View
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              backgroundColor: open ? 'rgba(255,255,255,0.95)' : 'rgba(20,18,15,0.85)',
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
                backgroundColor: open ? BRAND : '#bbb',
                marginRight: 5,
              }}
            />
            <Text
              style={{
                color: open ? BRAND : '#fff',
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 0.3,
              }}
            >
              {open ? 'OPEN NOW' : 'CLOSED'}
            </Text>
          </View>
          <Pressable
            onPress={handleHeartPress}
            hitSlop={10}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.95)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={16}
              color={saved ? ROSE : INK}
            />
          </Pressable>
        </View>
        <View style={{ padding: 14 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 17,
                fontWeight: '700',
                color: INK,
                letterSpacing: -0.3,
                paddingRight: 8,
              }}
            >
              {sale.title}
            </Text>
            {driveLabel ? (
              <View
                style={{
                  backgroundColor: BRAND_SOFT,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 99,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND }}>
                  {driveLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Ionicons name="time-outline" size={11} color={INK_MUTED} />
            <Text style={{ fontSize: 12, color: INK_SOFT, marginLeft: 5 }}>{hours}</Text>
          </View>
          {sale.categories.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 9 }}>
              {sale.categories.slice(0, 3).map((c) => (
                <View
                  key={c}
                  style={{
                    backgroundColor: BRAND_SOFT,
                    paddingHorizontal: 9,
                    paddingVertical: 3,
                    borderRadius: 99,
                    marginRight: 5,
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '600', color: BRAND }}>
                    {labelForCategory(c)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  // Comfy (default)
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: HAIRLINE,
        flexDirection: 'row',
      }}
    >
      <View
        style={{
          position: 'relative',
          width: 116,
          height: 130,
          // Soft dim on the photo when the sale is over so the row
          // reads as "still here for reference, but past."
          opacity: sale.status === 'ended' ? 0.7 : 1,
        }}
      >
        <Photo url={firstImage?.url} />
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            backgroundColor:
              sale.status === 'ended'
                ? '#F5DDD7'
                : 'rgba(255,255,255,0.95)',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 99,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          {sale.status !== 'ended' ? (
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 99,
                backgroundColor: open ? BRAND : INK_MUTED,
                marginRight: 3,
              }}
            />
          ) : null}
          <Text
            style={{
              fontSize: 9,
              fontWeight: '700',
              letterSpacing: sale.status === 'ended' ? 0.4 : 0,
              color:
                sale.status === 'ended'
                  ? ROSE
                  : open
                  ? BRAND
                  : INK_SOFT,
            }}
          >
            {sale.status === 'ended' ? 'ENDED' : open ? 'OPEN' : 'SOON'}
          </Text>
        </View>
        {typeof index === 'number' && (
          <View
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: BRAND,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 99,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>
              {index + 1}
            </Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, padding: 12, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: '700',
              color: INK,
              letterSpacing: -0.2,
              paddingRight: 6,
            }}
          >
            {sale.title}
          </Text>
          <Pressable onPress={handleHeartPress} hitSlop={10} style={{ padding: 2, margin: -2 }}>
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={14}
              color={saved ? ROSE : INK_MUTED}
            />
          </Pressable>
        </View>
        <Text
          numberOfLines={1}
          style={{ fontSize: 11, color: INK_MUTED, marginTop: 3 }}
        >
          {sale.address}
        </Text>
        {driveLabel || distLabel ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 7 }}>
            <Ionicons name="car-outline" size={11} color={BRAND} />
            <Text style={{ fontSize: 11, color: INK, marginLeft: 6, fontWeight: '600' }}>
              {driveLabel}
              {distLabel ? ` · ${distLabel}` : ''}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
          <Ionicons name="time-outline" size={11} color={INK_MUTED} />
          <Text style={{ fontSize: 11, color: INK_SOFT, marginLeft: 5 }} numberOfLines={1}>
            {hours}
          </Text>
        </View>
        {sale.categories.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 6,
              flexWrap: 'wrap',
            }}
          >
            {sale.categories.slice(0, 2).map((c) => (
              <View
                key={c}
                style={{
                  backgroundColor: BRAND_SOFT,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 99,
                  marginRight: 4,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '600', color: BRAND }}>
                  {labelForCategory(c)}
                </Text>
              </View>
            ))}
            {sale.categories.length > 2 && (
              <Text style={{ fontSize: 10, fontWeight: '600', color: INK_MUTED }}>
                +{sale.categories.length - 2}
              </Text>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function Photo({ url }: { url?: string }) {
  // Track explicit load failures. The blurhash placeholder hides
  // 404s / RLS rejects silently otherwise, so a deleted-storage-object
  // shows as "broken but loading forever" instead of falling back.
  const [failed, setFailed] = React.useState(false);
  const thumb = transformedImageUrl(url, {
    width: 240,
    height: 280,
    resize: 'cover',
    quality: 75,
  });
  if (!thumb || failed) {
    return (
      <View
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: BRAND_SOFT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="image-outline" size={28} color={BRAND} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: thumb }}
      placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
    />
  );
}

function labelForCategory(c: string): string {
  return c
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export default React.memo(SaleCardInner, (prev, next) => {
  return (
    prev.sale.id === next.sale.id &&
    prev.sale.updated_at === next.sale.updated_at &&
    prev.sale.status === next.sale.status &&
    prev.index === next.index &&
    prev.density === next.density &&
    prev.userLat === next.userLat &&
    prev.userLng === next.userLng &&
    prev.onPress === next.onPress
  );
});
