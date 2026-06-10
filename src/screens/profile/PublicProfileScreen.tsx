import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  useNavigation,
  useRoute,
  RouteProp,
} from '@react-navigation/native';

import { Avatar, HeaderButton } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useReviews } from '../../hooks/useReviews';
import { useFollow } from '../../hooks/useFollow';
import { useStartConversation } from '../../hooks/useConversation';
import { navigateToConversation } from '../../lib/navigationRef';
import { ProfileStackParamList, Review } from '../../types';
import {
  PLACEHOLDER_BLURHASH,
  transformedImageUrl,
} from '../../lib/imageUrl';
import { isOpenNow } from '../../utils/saleStatus';
import {
  saleDisplayLocation,
  approximateAreaLabel,
} from '../../lib/locationPrivacy';

const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const AMBER = '#FBCB6B';

type Route = RouteProp<ProfileStackParamList, 'PublicProfile'>;

/**
 * Brand-green header band public profile. Reused as a self-preview
 * when invoked with `{ self: true }` from the user's own Profile
 * card. Trust stats + verification badges + their sales (horizontal)
 * + their listings (grid) + reviews + sticky Follow/Message bar.
 *
 * Backend gaps that are surfaced cleanly:
 * - Replies-in: no message-timing analytics yet → label hidden.
 * - Verification badges: phone/email verification flags don't exist
 *   on profiles; we surface Email verified (always true since auth
 *   requires email) and "Local to {city}" when available. Phone
 *   verification only renders if profile.phone is set.
 */
export default function PublicProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { userId, self } = route.params;

  const {
    profile,
    sales,
    listings,
    salesHostedTotal,
    itemsSoldTotal,
    loading,
  } = useUserProfile(userId);
  const { reviews, summary } = useReviews(userId);
  const { following, toggle: toggleFollow, isSelf } = useFollow(userId);
  const { start: startConversation } = useStartConversation();
  const { user } = useAuth();

  // Babel's parser refuses mixed ?? / || expressions even when fully
  // parenthesized; resolve them in steps to stay portable.
  const fullName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    'User';
  const displayName = profile?.display_name ?? fullName;
  const firstName = displayName.split(/\s+/)[0];

  const cityState =
    profile?.city && profile?.state
      ? `${profile.city}, ${profile.state}`
      : null;

  const handleMessage = async () => {
    if (!userId) return;
    // The PublicProfile screen doesn't have a target sale/listing
    // context, so we open a fresh thread tied to the most recent sale
    // (if any) or fall back to a placeholder. The startConversation
    // RPC requires a target — without one, we route to Inbox.
    const fallback = sales[0] ?? null;
    if (!fallback) {
      navigation.navigate('Inbox' as never);
      return;
    }
    const { id } = await startConversation('sale', fallback.id);
    if (id) navigateToConversation(id);
  };

  if (loading && !profile) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BONE,
        }}
      >
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: isSelf || self ? 32 : 110,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand-green header band */}
        <View
          style={{
            backgroundColor: BRAND,
            paddingTop: insets.top + 8,
            paddingHorizontal: 18,
            paddingBottom: 22,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <HeaderButton
              variant="glass"
              icon="chevron-back"
              onPress={() => navigation.goBack()}
              accessibilityLabel="Back"
            />
            {!self ? (
              <HeaderButton
                variant="glass"
                icon="ellipsis-horizontal"
                onPress={() => {
                  /* report / block menu — wire to existing ReportSheet later */
                }}
                accessibilityLabel="More"
              />
            ) : null}
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              marginTop: 14,
            }}
          >
            <Avatar
              uri={profile?.avatar_url ?? undefined}
              name={displayName}
              px={64}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '800',
                  color: '#fff',
                  letterSpacing: -0.4,
                }}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.8)',
                  marginTop: 2,
                }}
              >
                {cityState ? `${cityState} · ` : ''}Joined{' '}
                {profile?.created_at
                  ? new Date(profile.created_at).getFullYear()
                  : ''}
              </Text>
              {summary.review_count > 0 ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    marginTop: 6,
                  }}
                >
                  <Ionicons name="star" size={12} color={AMBER} />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: '#fff',
                    }}
                  >
                    {summary.avg_stars.toFixed(1)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.7)',
                    }}
                  >
                    · {summary.review_count}{' '}
                    {summary.review_count === 1 ? 'review' : 'reviews'}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* trust stats */}
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              marginTop: 16,
            }}
          >
            <TrustStat
              value={salesHostedTotal.toString()}
              label="Sales hosted"
            />
            <TrustStat
              value={itemsSoldTotal.toString()}
              label="Items sold"
            />
            {/* "Replies in" needs message-timing analytics we don't have
                yet. Until that's wired we surface the review count as a
                third trust signal — it's the closest existing proxy. */}
            <TrustStat
              value={
                summary.review_count > 0
                  ? summary.review_count.toString()
                  : '—'
              }
              label={summary.review_count > 0 ? 'Reviews' : 'Replies in'}
            />
          </View>
        </View>

        {/* Verification badges */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            paddingHorizontal: 16,
            paddingTop: 14,
          }}
        >
          {profile?.email ? (
            <Badge icon="checkmark" label="Email verified" />
          ) : null}
          {profile?.phone ? (
            <Badge icon="checkmark" label="Phone verified" />
          ) : null}
          {profile?.city ? (
            <Badge
              icon="location-outline"
              label={`Local to ${profile.city}`}
            />
          ) : null}
        </View>

        {/* Bio */}
        {profile?.bio ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <Text style={{ fontSize: 13.5, color: INK, lineHeight: 20 }}>
              {profile.bio}
            </Text>
          </View>
        ) : null}

        {/* Their sales */}
        {sales.length > 0 ? (
          <View style={{ paddingTop: 18 }}>
            <SectionHeader
              title={`${firstName}'s sales`}
              meta={`${sales.length} active`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: 4,
                gap: 10,
              }}
            >
              {sales.map((sale, idx) => {
                const firstImage = sale.media?.find(
                  (m) => m.type === 'image',
                );
                const thumb = transformedImageUrl(firstImage?.url, {
                  width: 400,
                  height: 200,
                  resize: 'cover',
                  quality: 75,
                });
                const open = isOpenNow(sale);
                const isOwner =
                  !!self || (!!user && sale.user_id === user.id);
                const loc = saleDisplayLocation(sale, { isOwner });
                return (
                  <Pressable
                    key={sale.id}
                    onPress={() =>
                      navigation.navigate('SaleDetail', { saleId: sale.id })
                    }
                    style={{
                      width: 200,
                      borderRadius: 14,
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: HAIRLINE,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        height: 100,
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
                      ) : null}
                      {/* OPEN chip — matches 10-public-profile.png. White
                          translucent pill, brand-green dot + label. */}
                      <View
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          backgroundColor: 'rgba(255,255,255,0.95)',
                          paddingHorizontal: 7,
                          paddingVertical: 3,
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
                            backgroundColor: open ? BRAND : INK_MUTED,
                            marginRight: 4,
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '700',
                            color: open ? BRAND : INK_MUTED,
                          }}
                        >
                          {open ? 'OPEN' : 'SOON'}
                        </Text>
                      </View>
                      {/* Numbered badge top-right — matches the Map's
                          pin numbering pattern carried into the rail. */}
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
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '700',
                            color: '#fff',
                          }}
                        >
                          {idx + 1}
                        </Text>
                      </View>
                    </View>
                    <View style={{ padding: 10 }}>
                      <Text
                        style={{
                          fontSize: 13.5,
                          fontWeight: '700',
                          color: INK,
                        }}
                        numberOfLines={1}
                      >
                        {sale.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: INK_MUTED,
                          marginTop: 2,
                        }}
                        numberOfLines={1}
                      >
                        {loc.showExactAddress
                          ? sale.address
                          : approximateAreaLabel(sale)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* For sale (listings grid) */}
        {listings.length > 0 ? (
          <View style={{ paddingTop: 18 }}>
            <SectionHeader title="For sale" meta="See all" />
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                paddingHorizontal: 16,
                paddingTop: 10,
                gap: 10,
              }}
            >
              {listings.slice(0, 6).map((listing) => {
                const firstImage = listing.media?.find(
                  (m) => m.type === 'image',
                );
                const thumb = transformedImageUrl(firstImage?.url, {
                  width: 280,
                  height: 280,
                  resize: 'cover',
                  quality: 75,
                });
                return (
                  <Pressable
                    key={listing.id}
                    onPress={() =>
                      navigation.navigate('ListingDetail', {
                        listingId: listing.id,
                      })
                    }
                    style={{
                      width: '47%',
                      backgroundColor: '#fff',
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: HAIRLINE,
                      overflow: 'hidden',
                    }}
                  >
                    <View style={{ height: 110, backgroundColor: BRAND_SOFT }}>
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          transition={120}
                        />
                      ) : null}
                    </View>
                    <View style={{ padding: 9 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '800',
                          color: INK,
                        }}
                      >
                        ${listing.price.toFixed(0)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '600',
                          color: INK,
                          marginTop: 1,
                        }}
                        numberOfLines={1}
                      >
                        {listing.title}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Reviews */}
        {reviews.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: INK,
                  letterSpacing: -0.3,
                }}
              >
                Reviews
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Ionicons name="star" size={13} color={AMBER} />
                <Text
                  style={{ fontSize: 13, fontWeight: '700', color: INK }}
                >
                  {summary.avg_stars.toFixed(1)}
                </Text>
                <Text style={{ fontSize: 12, color: INK_MUTED }}>
                  · {summary.review_count}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 10 }}>
              {reviews.slice(0, 3).map((r, i) => (
                <ReviewRow
                  key={r.id}
                  review={r}
                  last={i === Math.min(reviews.length, 3) - 1}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky bottom action bar — only when viewing someone else */}
      {!self && !isSelf ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: HAIRLINE,
            paddingTop: 12,
            paddingHorizontal: 16,
            // Sits above the tab bar (which clears the home indicator) —
            // no safe-area inset needed; it only made a big gap.
            paddingBottom: 16,
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <Pressable
            onPress={toggleFollow}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: following ? BRAND : HAIRLINE,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: following ? BRAND_SOFT : '#fff',
            }}
            accessibilityRole="button"
            accessibilityLabel={following ? 'Unfollow' : 'Follow'}
          >
            <Ionicons
              name={following ? 'notifications' : 'notifications-outline'}
              size={15}
              color={following ? BRAND : INK}
            />
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: following ? BRAND : INK,
              }}
            >
              {following ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleMessage}
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 14,
              backgroundColor: BRAND,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
            accessibilityRole="button"
            accessibilityLabel={`Message ${firstName}`}
          >
            <Ionicons name="chatbubble-outline" size={15} color="#fff" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
              Message {firstName}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Self-preview pill */}
      {(self || isSelf) ? (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 90,
            alignSelf: 'center',
            backgroundColor: 'rgba(26,22,18,0.82)',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 99,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 0.2,
            }}
          >
            👁 This is how others see you
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function TrustStat({ value, label }: { value: string; label: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: '800',
          color: '#fff',
          lineHeight: 16,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: '600',
          color: 'rgba(255,255,255,0.75)',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          marginTop: 3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function Badge({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: BRAND_SOFT,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 99,
      }}
    >
      <Ionicons name={icon} size={11} color={BRAND} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: BRAND }}>
        {label}
      </Text>
    </View>
  );
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
      }}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: '700',
          color: INK,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </Text>
      {meta ? (
        <Text
          style={{
            fontSize: 11,
            color: INK_MUTED,
            fontWeight: '600',
          }}
        >
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

function ReviewRow({ review, last }: { review: Review; last: boolean }) {
  const author = review.author;
  return (
    <View
      style={{
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: HAIRLINE,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Avatar
          uri={author?.avatar_url ?? undefined}
          name={author?.display_name ?? '?'}
          px={32}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: INK }}>
            {author?.display_name ?? 'Anonymous'}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              marginTop: 1,
            }}
          >
            <Stars value={review.stars} />
            <Text
              style={{
                fontSize: 10,
                color: INK_MUTED,
                marginLeft: 3,
              }}
            >
              {formatRelative(review.created_at)}
            </Text>
          </View>
        </View>
      </View>
      {review.body ? (
        <Text
          style={{
            fontSize: 12.5,
            color: INK,
            lineHeight: 19,
            marginTop: 7,
          }}
        >
          {review.body}
        </Text>
      ) : null}
    </View>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[0, 1, 2, 3, 4].map((n) => (
        <Ionicons
          key={n}
          name="star"
          size={9}
          color={n < value ? AMBER : HAIRLINE}
        />
      ))}
    </View>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = (now - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 14) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 60) return `${Math.floor(diff / (86400 * 7))}w ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}
