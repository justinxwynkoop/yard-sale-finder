import React from 'react';
import { View, ScrollView } from 'react-native';
import { Chip } from './ui';

/**
 * One-tap conversation starters. Purely presentational — the parent
 * decides what a pick does (we pre-fill the composer, never auto-send,
 * so the buyer always owns the message they appear to have written).
 */
export function QuickReplyChips({
  prompts,
  onPick,
}: {
  prompts: string[];
  onPick: (text: string) => void;
}) {
  if (prompts.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {prompts.map((p) => (
        <Chip
          key={p}
          label={p}
          tone="tonal"
          onPress={() => onPick(p)}
          accessibilityLabel={`Send: ${p}`}
        />
      ))}
      <View style={{ width: 8 }} />
    </ScrollView>
  );
}
