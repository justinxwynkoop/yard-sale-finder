import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ListingStatus, Message } from '../types';
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
  listingStatus,
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
  /** Current status of the listing this thread is about. Undefined when the
   * listing could not be loaded (deleted) — treated the same as unavailable,
   * which fails closed rather than rendering a button the server refuses. */
  listingStatus: ListingStatus | null | undefined;
  onAccept: () => void;
  onDecline: () => void;
  /** Opens the amount sheet pre-filled — a counter is a new offer. */
  onCounter: () => void;
}) {
  const actionable = canRespondToOffer(message, viewerId, participants);
  // The listing-status rule lives HERE rather than inside canRespondToOffer
  // because it is not one rule: the server permits `decline` at any status,
  // gates `accept` on 'available', and Counter isn't respond_to_offer at all
  // (it's send_offer, which has its own status rule). canRespondToOffer
  // mirrors respond_to_offer's *authorization* -- "is this viewer the
  // responder on a live offer?" -- and folding a single status boolean into
  // it would make it answer "no" for decline, which is false and would strand
  // exactly the stale offers decline exists to clear.
  //
  // Reachable on day one: send_offer's one-pending-offer rule is per
  // CONVERSATION, so two buyers can each hold a pending offer on the same
  // listing. Accepting buyer 1's flips the listing to 'pending' and buyer 2's
  // thread would otherwise still render a live Accept (raw server alert) and
  // Counter (succeeds, creating another un-acceptable offer).
  const itemAvailable = listingStatus === 'available';
  const showRespondActions = actionable && itemAvailable;
  // Decline stays up whenever the viewer is the responder -- it is how a
  // stale offer on a held or sold item gets cleared, and the server allows it.
  const showDecline = actionable;
  const status = message.offer_status ?? 'pending';
  const statusColor =
    status === 'accepted' ? BRAND : status === 'declined' ? ROSE : AMBER;
  // Explain the missing buttons instead of leaving an offer that looks inert.
  // Deliberately not "held for someone else": the holder may well be the
  // person reading this (accept an offer, then they send another one).
  const unavailableNote = showRespondActions
    ? null
    : !actionable
      ? null
      : listingStatus === 'sold'
        ? 'This item has sold, so this offer can no longer be accepted.'
        : listingStatus === 'pending'
          ? "This item is on hold, so this offer can't be accepted right now."
          : 'This item is no longer available, so this offer can no longer be accepted.';

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

      {unavailableNote ? (
        <Text style={{ fontSize: 12, color: INK_MUTED, marginTop: 10, lineHeight: 17 }}>
          {unavailableNote}
        </Text>
      ) : null}

      {showDecline && (
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          {showRespondActions && (
            <>
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
            </>
          )}
          <Pressable
            onPress={onDecline}
            accessibilityRole="button"
            style={{
              flex: 1,
              marginLeft: showRespondActions ? 8 : 0,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: 'center',
              // Standing alone it is the only affordance in the bubble, so it
              // needs a surface; beside Accept/Counter it stays the quiet
              // third option it has always been.
              backgroundColor: showRespondActions ? undefined : BONE,
            }}
          >
            <Text style={{ color: ROSE, fontWeight: '800', fontSize: 13.5 }}>Decline</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
