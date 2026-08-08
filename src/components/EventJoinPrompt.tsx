import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './ui';
import { SaleEvent } from '../types';
import { datesOverlap } from '../lib/eventMatch';
import { prettyRange } from '../utils/format';

const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';

/**
 * Post-create proximity prompt (spec §3, door two). Location-only trigger;
 * this component decides the copy by comparing dates:
 *  - overlap  → simple Join / No thanks
 *  - mismatch → nudge: move sale to the event weekend / keep dates / decline
 */
export function EventJoinPrompt({
  visible, event, saleStart, saleEnd, onJoin, onDecline, onDismiss,
}: {
  visible: boolean;
  event: SaleEvent;
  saleStart: string;
  saleEnd: string;
  onJoin: (moveDates: boolean) => void;
  /** Explicit "No thanks" — persists the decline so this event won't prompt again. */
  onDecline: () => void;
  /** Backdrop tap / hardware back — a soft dismiss, NOT a decline (the user
   * may just be closing the sheet, not rejecting the event permanently). */
  onDismiss: () => void;
}) {
  const overlap = datesOverlap(saleStart, saleEnd, event.start_date, event.end_date);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(23,21,19,0.45)' }}
        onPress={onDismiss}
        accessibilityLabel="Dismiss"
      />
      <View
        style={{
          backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 24, paddingTop: 14, paddingBottom: 34,
        }}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E4E4E7', marginBottom: 18 }} />
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#E8EFE9', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Ionicons name="home-outline" size={26} color={BRAND} />
        </View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: INK, letterSpacing: -0.3 }}>
          {overlap ? 'You’re inside a neighborhood sale' : 'Your street has a neighborhood sale'}
        </Text>
        <Text style={{ marginTop: 6, fontSize: 14.5, lineHeight: 21, color: INK_MUTED }}>
          {overlap
            ? `Your sale is inside the ${event.title} (${prettyRange(event.start_date, event.end_date)}) — want to be part of it? You’ll show up with the group on the map.`
            : `The ${event.title} runs ${prettyRange(event.start_date, event.end_date)}. Your sale is set for ${prettyRange(saleStart, saleEnd)} — group sales pull far more shoppers.`}
        </Text>
        <View style={{ marginTop: 20, gap: 10 }}>
          {overlap ? (
            <Button size="lg" onPress={() => onJoin(false)}>Join</Button>
          ) : (
            <>
              <Button size="lg" onPress={() => onJoin(true)}>
                Join & move my sale to that weekend
              </Button>
              <Button variant="ghost" onPress={() => onJoin(false)}>
                Join with my dates
              </Button>
            </>
          )}
          <Button variant="ghost" onPress={onDecline}>No thanks</Button>
        </View>
      </View>
    </Modal>
  );
}
