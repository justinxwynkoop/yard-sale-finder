import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { draftAge } from '../lib/drafts';

const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

/**
 * "Pick up where you left off?" — shown at the top of a Create form when a
 * device-local draft exists. Restore hydrates the form; Start fresh clears
 * the slot. Purely presentational; the screens own the draft lifecycle.
 */
export function DraftBanner({
  savedAt,
  onRestore,
  onStartFresh,
}: {
  savedAt: string;
  onRestore: () => void;
  onStartFresh: () => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="document-text-outline" size={16} color={BRAND} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: INK }}>
          Pick up where you left off?
        </Text>
      </View>
      <Text style={{ marginTop: 3, marginLeft: 24, fontSize: 11, color: INK_MUTED }}>
        {`Saved ${draftAge(savedAt)} · on this device`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Pressable
          onPress={onRestore}
          accessibilityRole="button"
          accessibilityLabel="Restore draft"
          style={{
            flex: 1,
            backgroundColor: BRAND,
            borderRadius: 10,
            paddingVertical: 9,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Restore</Text>
        </Pressable>
        <Pressable
          onPress={onStartFresh}
          accessibilityRole="button"
          accessibilityLabel="Start fresh"
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: HAIRLINE,
            paddingVertical: 9,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: INK, fontSize: 12.5, fontWeight: '700' }}>Start fresh</Text>
        </Pressable>
      </View>
    </View>
  );
}
