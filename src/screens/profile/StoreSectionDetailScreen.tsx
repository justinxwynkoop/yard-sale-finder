import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useStore } from '../../hooks/useStore';
import { useStoreListings } from '../../hooks/useStoreListings';
import { StoreListingTile } from '../../components/StoreListingTile';
import { supabase } from '../../lib/supabase';
import { Listing, ProfileStackParamList } from '../../types';

const BRAND = '#1F4D3A';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

type Route = RouteProp<ProfileStackParamList, 'StoreSectionDetail'>;

export default function StoreSectionDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { sectionId, sectionName } = route.params;
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const { config, loading: configLoading, refetch } = useStore(userId);
  const { listings, loading: listingsLoading } = useStoreListings(userId);
  const [showPicker, setShowPicker] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(sectionName);
  const [saving, setSaving] = useState(false);

  const section = config.sections.find((s) => s.id === sectionId);

  const sectionListings = useMemo(
    () =>
      (section?.listingIds ?? [])
        .map((id) => listings.find((l) => l.id === id))
        .filter((l): l is Listing => l !== undefined),
    [section, listings],
  );

  const eligibleListings = useMemo(
    () => listings.filter((l) => !(section?.listingIds ?? []).includes(l.id)),
    [listings, section],
  );

  const handleRenameSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await supabase
      .from('store_sections')
      .update({ name: trimmed })
      .eq('id', sectionId);
    await refetch();
    setEditingName(false);
    setSaving(false);
  };

  const handleAddListing = async (listingId: string) => {
    setSaving(true);
    const position = section?.listingIds.length ?? 0;
    await supabase
      .from('store_section_items')
      .insert({ section_id: sectionId, listing_id: listingId, position });
    await refetch();
    setSaving(false);
    setShowPicker(false);
  };

  const handleRemoveListing = async (listingId: string) => {
    setSaving(true);
    await supabase
      .from('store_section_items')
      .delete()
      .eq('section_id', sectionId)
      .eq('listing_id', listingId);
    await refetch();
    setSaving(false);
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
          {editingName ? (
            <>
              <TextInput
                value={name}
                onChangeText={setName}
                autoFocus
                style={{
                  flex: 1,
                  fontSize: 17,
                  fontWeight: '700',
                  color: INK,
                  borderBottomWidth: 1,
                  borderBottomColor: BRAND,
                  paddingVertical: 2,
                }}
              />
              <Pressable
                onPress={handleRenameSave}
                accessibilityRole="button"
                accessibilityLabel="Save name"
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND }}>Save</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: INK }}>
                {section?.name ?? sectionName}
              </Text>
              {saving ? (
                <ActivityIndicator size="small" color={BRAND} />
              ) : (
                <Pressable
                  onPress={() => setEditingName(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Rename section"
                >
                  <Ionicons name="create-outline" size={18} color={BRAND} />
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* Items in section */}
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 20,
            backgroundColor: '#fff',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: HAIRLINE,
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
              borderBottomColor: HAIRLINE,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: INK }}>
              Items in this section
            </Text>
            <Pressable
              onPress={() => setShowPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Add item"
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>+ Add</Text>
            </Pressable>
          </View>

          {sectionListings.length === 0 ? (
            <Text style={{ fontSize: 13, color: INK_MUTED, padding: 16 }}>
              No items in this section yet. Tap + Add to assign listings here.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 10 }}>
              {sectionListings.map((listing) => (
                <View key={listing.id} style={{ position: 'relative', width: '47%' }}>
                  <StoreListingTile listing={listing} onPress={() => {}} />
                  <Pressable
                    onPress={() => handleRemoveListing(listing.id)}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      backgroundColor: 'rgba(0,0,0,0.55)',
                      borderRadius: 99,
                      padding: 4,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${listing.title}`}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Listing picker modal */}
      <Modal
        visible={showPicker}
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
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
              onPress={() => setShowPicker(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={INK} />
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '700', color: INK }}>Add to section</Text>
          </View>
          <FlatList
            data={eligibleListings}
            keyExtractor={(l) => l.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 10 }}
            renderItem={({ item }) => (
              <StoreListingTile listing={item} onPress={() => handleAddListing(item.id)} />
            )}
            ListEmptyComponent={
              <Text style={{ padding: 24, color: INK_MUTED, textAlign: 'center' }}>
                No more listings to add
              </Text>
            }
          />
        </View>
      </Modal>
    </View>
  );
}
