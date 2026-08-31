import { Message, OfferStatus } from '../types';

/**
 * Offer rules, in one place. Both the thread UI and the hook import these so
 * "can this person act on this offer?" is answered identically everywhere.
 * Mirrors src/lib/eventMatch.ts — pure, no Supabase, trivially testable.
 */

/** Rows written before offers shipped have no `kind`; they are text. */
export function isOfferMessage(m: Message): boolean {
  return m.kind === 'offer';
}

/**
 * Only the listing's owner can accept or decline, only while pending, and
 * never their own offer. The server enforces this too (respond_to_offer);
 * this is the client-side mirror so we don't render dead buttons.
 */
export function canRespondToOffer(
  m: Message,
  viewerId: string | null | undefined,
  listingOwnerId: string | null | undefined,
): boolean {
  if (!viewerId || !listingOwnerId) return false;
  if (!isOfferMessage(m)) return false;
  if (m.offer_status !== 'pending') return false;
  if (viewerId !== listingOwnerId) return false;
  if (m.sender_id === viewerId) return false;
  return true;
}

export function formatOfferAmount(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '';
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function offerStatusLabel(status: OfferStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'countered':
      return 'Countered';
  }
}
