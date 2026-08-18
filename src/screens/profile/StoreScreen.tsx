import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useStore } from '../../hooks/useStore';
import { useStoreListings } from '../../hooks/useStoreListings';
import { buildStoreLayout } from '../../utils/storeLayout';
import { StoreFeaturedSection } from '../../components/StoreFeaturedSection';
import { StoreSection } from '../../components/StoreSection';
import { StoreListingTile } from '../../components/StoreListingTile';
import { ProfileStackParamList } from '../../types';

const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';

type Route = RouteProp<ProfileStackParamList, 'Store'>;

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { userId, displayName, avatarUrl, memberSince } = route.params;
  const { user } = useAuth();
  const isOwner = user?.id === userId;

  const { config, loading: configLoading } = useStore(userId);
  const { listings, loading: listingsLoading } = useStoreListings(userId);
  const loading = configLoading || listingsLoading;

  const layout = useMemo(
    () => buildStoreLayout(listings, config.featured, config.sections),
    [listings, config],
  );

  if (loading) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BONE }}
      >
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  const hasContent =
    layout.featuredListings.length > 0 ||
    layout.sections.some((s) => s.listings.length > 0) ||
    layout.recentListings.length > 0;

  const showRecentLabel =
    layout.featuredListings.length > 0 || layout.sections.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header band */}
        <View
          style={{
            backgroundColor: BRAND,
            paddingTop: insets.top + 8,
            paddingHorizontal: 18,
            paddingBottom: 22,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <CircleButton
              icon="chevron-back"
              onPress={() => navigation.goBack()}
              accessibilityLabel="Back"
            />
            {isOwner ? (
              <CircleButton
                icon="create-outline"
                onPress={() => navigation.navigate('ManageStore')}
                accessibilityLabel="Manage store"
              />
            ) : null}
          </View>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 }}
          >
            <Avatar uri={avatarUrl ?? undefined} name={displayName} px={56} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: '800',
                  color: '#fff',
                  letterSpacing: -0.4,
                }}
                numberOfLines={1}
              >
                {displayName}'s Store
              </Text>
              <Text
                style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}
              >
                Member since {memberSince} ·{' '}
                {listings.length} item{listings.length !== 1 ? 's' : ''} for sale
              </Text>
            </View>
          </View>
        </View>

        {/* Owner banner */}
        {isOwner ? (
          <Pressable
            onPress={() => navigation.navigate('ManageStore')}
            style={{
              backgroundColor: BRAND_SOFT,
              paddingVertical: 10,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
            accessibilityRole="button"
            accessibilityLabel="Manage your store"
          >
            <Ionicons name="eye-outline" size={14} color={BRAND} />
            <Text style={{ flex: 1, fontSize: 12, color: BRAND, fontWeight: '600' }}>
              This is how your store looks to others
            </Text>
            <Text style={{ fontSize: 12, color: BRAND, fontWeight: '700' }}>
              Manage →
            </Text>
          </Pressable>
        ) : null}

        {!hasContent ? (
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 64,
              paddingHorizontal: 24,
            }}
          >
            <Ionicons name="storefront-outline" size={40} color={INK_MUTED} />
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: INK,
                marginTop: 16,
                textAlign: 'center',
              }}
            >
              Nothing for sale right now
            </Text>
            <Text
              style={{ fontSize: 13, color: INK_MUTED, marginTop: 8, textAlign: 'center' }}
            >
              Check back later
            </Text>
          </View>
        ) : (
          <>
            {layout.featuredListings.length > 0 ? (
              <StoreFeaturedSection
                listings={layout.featuredListings}
                onPress={(listing) =>
                  navigation.navigate('ListingDetail', { listingId: listing.id })
                }
              />
            ) : null}

            {layout.sections.map((section) =>
              section.listings.length > 0 ? (
                <StoreSection
                  key={section.id}
                  name={section.name}
                  listings={section.listings}
                  onPressListing={(listing) =>
                    navigation.navigate('ListingDetail', { listingId: listing.id })
                  }
                />
              ) : null,
            )}

            {layout.recentListings.length > 0 ? (
              <View style={{ paddingTop: 18 }}>
                {showRecentLabel ? (
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: INK,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      paddingHorizontal: 16,
                      marginBottom: 10,
                    }}
                  >
                    Recent
                  </Text>
                ) : null}
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    paddingHorizontal: 16,
                    gap: 10,
                  }}
                >
                  {layout.recentListings.map((listing) => (
                    <StoreListingTile
                      key={listing.id}
                      listing={listing}
                      onPress={() =>
                        navigation.navigate('ListingDetail', { listingId: listing.id })
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CircleButton({
  icon,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 99,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={18} color="#fff" />
    </Pressable>
  );
}
