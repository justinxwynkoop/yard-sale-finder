import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useStore } from '../../hooks/useStore';
import { useStoreListings } from '../../hooks/useStoreListings';
import { StoreListingTile } from '../../components/StoreListingTile';
import { supabase } from '../../lib/supabase';
import { Listing } from '../../types';

const BRAND = '#1F4D3A';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';

export default function ManageStoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const { config, loading: configLoading, refetch } = useStore(userId);
  const { listings, loading: listingsLoading } = useStoreListings(userId);
  const [showFeaturedPicker, setShowFeaturedPicker] = useState(false);
  const [showSectionInput, setShowSectionInput] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const assignedIds = useMemo(
    () =>
      new Set([
        ...config.featured,
        ...config.sections.flatMap((s) => s.listingIds),
      ]),
    [config],
  );

  const unassignedListings = useMemo(
    () => listings.filter((l) => !assignedIds.has(l.id)),
    [listings, assignedIds],
  );

  const featuredEligible = useMemo(
    () => listings.filter((l) => !config.featured.includes(l.id)),
    [listings, config.featured],
  );

  const featuredListings = useMemo(
    () =>
      config.featured
        .map((id) => listings.find((l) => l.id === id))
        .filter((l): l is Listing => l !== undefined),
    [config.featured, listings],
  );

  const handleAddFeatured = async (listingId: string) => {
    setSaving(true);
    await supabase
      .from('store_featured')
      .insert({ user_id: userId, listing_id: listingId, position: config.featured.length });
    await refetch();
    setSaving(false);
    setShowFeaturedPicker(false);
  };

  const handleRemoveFeatured = async (listingId: string) => {
    setSaving(true);
    await supabase
      .from('store_featured')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);
    await refetch();
    setSaving(false);
  };

  const handleCreateSection = async () => {
    const name = newSectionName.trim();
    if (!name) return;
    setSaving(true);
    await supabase
      .from('store_sections')
      .insert({ user_id: userId, name, position: config.sections.length });
    await refetch();
    setNewSectionName('');
    setShowSectionInput(false);
    setSaving(false);
  };

  const handleDeleteSection = (sectionId: string, sectionName: string) => {
    Alert.alert(
      'Delete section',
      `Remove "${sectionName}"? Its listings stay in your store under Recent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            await supabase.from('store_sections').delete().eq('id', sectionId);
            await refetch();
            setSaving(false);
          },
        },
      ],
    );
  };

  if (configLoading || listingsLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BONE }}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 18,
            paddingBottom: 16,
            backgroundColor: '#fff',
            borderBottomWidth: 1,
            borderBottomColor: HAIRLINE,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={INK} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: INK }}>Manage Store</Text>
          {saving ? <ActivityIndicator size="small" color={BRAND} style={{ marginLeft: 8 }} /> : null}
        </View>

        {/* Featured */}
        <SectionCard
          title="★ Featured Items"
          action={{ label: '+ Add', onPress: () => setShowFeaturedPicker(true) }}
        >
          {featuredListings.length === 0 ? (
            <Text style={{ fontSize: 13, color: INK_MUTED, padding: 16 }}>
              No featured items yet. Tap + Add to pin items to the top of your store.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 10 }}>
              {featuredListings.map((listing) => (
                <View key={listing.id} style={{ position: 'relative', width: '47%' }}>
                  <StoreListingTile listing={listing} onPress={() => {}} />
                  <Pressable
                    onPress={() => handleRemoveFeatured(listing.id)}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      backgroundColor: 'rgba(0,0,0,0.55)',
                      borderRadius: 99,
                      padding: 4,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${listing.title} from featured`}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        {/* Sections */}
        <SectionCard
          title="Sections"
          action={{ label: '+ Add', onPress: () => setShowSectionInput(true) }}
        >
          {config.sections.length === 0 ? (
            <Text style={{ fontSize: 13, color: INK_MUTED, padding: 16 }}>
              No sections yet. Group your listings under custom names like "Vintage" or "Electronics".
            </Text>
          ) : (
            config.sections.map((section, idx) => (
              <View
                key={section.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                  borderBottomWidth: idx < config.sections.length - 1 ? 1 : 0,
                  borderBottomColor: HAIRLINE,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: INK }}>
                    {section.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 1 }}>
                    {section.listingIds.length} item{section.listingIds.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    navigation.navigate('StoreSectionDetail', {
                      sectionId: section.id,
                      sectionName: section.name,
                    })
                  }
                  style={{ marginRight: 16 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${section.name}`}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteSection(section.id, section.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${section.name}`}
                >
                  <Ionicons name="trash-outline" size={16} color={ROSE} />
                </Pressable>
              </View>
            ))
          )}
        </SectionCard>

        {/* Unassigned */}
        {unassignedListings.length > 0 ? (
          <SectionCard title="Unassigned Listings">
            <Text style={{ fontSize: 12, color: INK_MUTED, paddingHorizontal: 16, paddingTop: 10 }}>
              These items appear under "Recent" in your store. Add them to a section or feature them.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 10 }}>
              {unassignedListings.map((listing) => (
                <StoreListingTile key={listing.id} listing={listing} onPress={() => {}} />
              ))}
            </View>
          </SectionCard>
        ) : null}
      </ScrollView>

      {/* Featured picker modal */}
      <Modal
        visible={showFeaturedPicker}
        animationType="slide"
        onRequestClose={() => setShowFeaturedPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: BONE }}>
          <View
            style={{
              paddingTop: insets.top + 12,
              paddingHorizontal: 18,
              paddingBottom: 16,
              backgroundColor: '#fff',
              borderBottomWidth: 1,
              borderBottomColor: HAIRLINE,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Pressable
              onPress={() => setShowFeaturedPicker(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={INK} />
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '700', color: INK }}>
              Pick featured item
            </Text>
          </View>
          <FlatList
            data={featuredEligible}
            keyExtractor={(l) => l.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 10 }}
            renderItem={({ item }) => (
              <StoreListingTile
                listing={item}
                onPress={() => handleAddFeatured(item.id)}
              />
            )}
            ListEmptyComponent={
              <Text style={{ padding: 24, color: INK_MUTED, textAlign: 'center' }}>
                All listings are already featured
              </Text>
            }
          />
        </View>
      </Modal>

      {/* New section name modal */}
      <Modal
        visible={showSectionInput}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSectionInput(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 20,
              width: '100%',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: INK, marginBottom: 12 }}>
              Section name
            </Text>
            <TextInput
              value={newSectionName}
              onChangeText={setNewSectionName}
              placeholder="e.g. Vintage, Electronics..."
              autoFocus
              style={{
                borderWidth: 1,
                borderColor: HAIRLINE,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
                color: INK,
                marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => {
                  setShowSectionInput(false);
                  setNewSectionName('');
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: HAIRLINE,
                  alignItems: 'center',
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: INK_MUTED }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateSection}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: BRAND,
                  alignItems: 'center',
                }}
                accessibilityRole="button"
                accessibilityLabel="Create section"
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 20,
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5DECC',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#E5DECC',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#171513' }}>{title}</Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F4D3A' }}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
