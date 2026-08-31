import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Message } from '../types';
import { canRespondToOffer, formatOfferAmount, offerStatusLabel } from '../lib/offers';

const BRAND = '#1F4D3A';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const AMBER = '#B8772C';
const ROSE = '#A23E2D';

/**
 * An offer, rendered inline in the thread. Presentational and fully
 * controlled — it decides what to SHOW from the offer's state, never what
 * the offer's state should become (that lives in src/lib/offers.ts and,
 * authoritatively, in the respond_to_offer RPC).
 */
export function OfferBubble({
  message,
  viewerId,
  participants,
  onAccept,
  onDecline,
  onCounter,
}: {
  message: Message;
  viewerId: string | null | undefined;
  /** The conversation's buyer/seller pair — the responder is whichever of
   * the two did NOT send this offer, not "the listing owner" (a seller's
   * counter-offer must still be acceptable by the buyer). */
  participants: { buyer_id: string; seller_id: string } | null | undefined;
  onAccept: () => void;
  onDecline: () => void;
  /** Opens the amount sheet pre-filled — a counter is a new offer. */
  onCounter: () => void;
}) {
  const actionable = canRespondToOffer(message, viewerId, participants);
  const status = message.offer_status ?? 'pending';
  const statusColor =
    status === 'accepted' ? BRAND : status === 'declined' ? ROSE : AMBER;

  return (
    <View
      style={{
        alignSelf: 'center',
        width: '86%',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderRadius: 16,
        padding: 14,
        marginVertical: 6,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '800', color: INK_MUTED, letterSpacing: 0.5 }}>
        OFFER
      </Text>
      <Text style={{ fontSize: 26, fontWeight: '800', color: INK, marginTop: 2 }}>
        {formatOfferAmount(message.offer_amount)}
      </Text>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: statusColor, marginTop: 2 }}>
        {offerStatusLabel(status)}
      </Text>

      {actionable && (
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <Pressable
            onPress={onAccept}
            accessibilityRole="button"
            style={{ flex: 1, backgroundColor: BRAND, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13.5 }}>Accept</Text>
          </Pressable>
          <Pressable
            onPress={onCounter}
            accessibilityRole="button"
            style={{ flex: 1, marginLeft: 8, backgroundColor: BONE, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
          >
            <Text style={{ color: INK, fontWeight: '800', fontSize: 13.5 }}>Counter</Text>
          </Pressable>
          <Pressable
            onPress={onDecline}
            accessibilityRole="button"
            style={{ flex: 1, marginLeft: 8, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
          >
            <Text style={{ color: ROSE, fontWeight: '800', fontSize: 13.5 }}>Decline</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
