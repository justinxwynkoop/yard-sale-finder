import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { draftAge } from '../lib/drafts';

const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';

/**
 * Pinned "Draft" row for My Sales / My Listings — the second door back into
 * an unfinished post (the first is the DraftBanner on the Create form).
 * Labeled "on this device" because local drafts don't follow the account.
 */
export function DraftRow({
  kind,
  title,
  savedAt,
  onPress,
  onDiscard,
}: {
  kind: 'sale' | 'listing';
  title: string;
  savedAt: string;
  onPress: () => void;
  onDiscard: () => void;
}) {
  const displayTitle =
    title.trim() || (kind === 'sale' ? 'Untitled sale' : 'Untitled item');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Continue draft"
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderStyle: 'dashed',
        marginBottom: 10,
        flexDirection: 'row',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: 84,
          minHeight: 84,
          backgroundColor: BRAND_SOFT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="document-text-outline" size={26} color={BRAND} />
      </View>
      <View style={{ flex: 1, padding: 10, paddingLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 99,
              backgroundColor: BRAND_SOFT,
            }}
          >
            <Text
              style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: BRAND }}
            >
              DRAFT
            </Text>
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: '700', color: INK, marginTop: 5 }}
        >
          {displayTitle}
        </Text>
        <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 3 }}>
          {`Saved ${draftAge(savedAt)} · on this device`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            accessibilityRole="button"
            accessibilityLabel="Discard"
            style={{
              paddingVertical: 5,
              paddingHorizontal: 11,
              borderWidth: 1,
              borderColor: '#F0D9D3',
              borderRadius: 99,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: ROSE }}>Discard</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
