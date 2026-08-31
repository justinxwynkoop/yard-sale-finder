import { Message } from '../../types';
import {
  canRespondToOffer,
  formatOfferAmount,
  isOfferMessage,
  offerStatusLabel,
} from '../offers';

const msg = (o: Partial<Message>): Message => ({
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'buyer',
  body: 'Offered $15 for Thing',
  created_at: '2026-08-30T12:00:00Z',
  kind: 'offer',
  offer_amount: 15,
  offer_status: 'pending',
  ...o,
});

describe('isOfferMessage', () => {
  it('treats a row with no kind as text (rows sent before offers shipped)', () => {
    expect(isOfferMessage(msg({ kind: undefined }))).toBe(false);
  });

  it('identifies an offer row', () => {
    expect(isOfferMessage(msg({}))).toBe(true);
  });
});

describe('canRespondToOffer', () => {
  const participants = { buyer_id: 'buyer', seller_id: 'seller' };

  it('lets the seller respond to the buyer’s offer', () => {
    expect(canRespondToOffer(msg({ sender_id: 'buyer' }), 'seller', participants)).toBe(true);
  });

  it('lets the buyer respond to the seller’s counter-offer', () => {
    expect(canRespondToOffer(msg({ sender_id: 'seller' }), 'buyer', participants)).toBe(true);
  });

  it('does NOT let either party respond to their own offer', () => {
    expect(canRespondToOffer(msg({ sender_id: 'buyer' }), 'buyer', participants)).toBe(false);
    expect(canRespondToOffer(msg({ sender_id: 'seller' }), 'seller', participants)).toBe(false);
  });

  it('does NOT let a non-participant respond even to a valid pending offer', () => {
    expect(canRespondToOffer(msg({ sender_id: 'buyer' }), 'stranger', participants)).toBe(false);
  });

  it('does NOT allow responding to a resolved offer — accepted, declined, or countered', () => {
    expect(
      canRespondToOffer(msg({ sender_id: 'buyer', offer_status: 'accepted' }), 'seller', participants),
    ).toBe(false);
    expect(
      canRespondToOffer(msg({ sender_id: 'buyer', offer_status: 'declined' }), 'seller', participants),
    ).toBe(false);
    expect(
      canRespondToOffer(msg({ sender_id: 'buyer', offer_status: 'countered' }), 'seller', participants),
    ).toBe(false);
  });

  it('returns false for a signed-out viewer', () => {
    expect(canRespondToOffer(msg({ sender_id: 'buyer' }), null, participants)).toBe(false);
  });

  it('returns false when participants is null', () => {
    expect(canRespondToOffer(msg({ sender_id: 'buyer' }), 'seller', null)).toBe(false);
  });

  it('returns false for a non-offer row', () => {
    expect(
      canRespondToOffer(msg({ kind: 'text', offer_status: null, sender_id: 'buyer' }), 'seller', participants),
    ).toBe(false);
  });
});

describe('formatOfferAmount', () => {
  it('drops cents on a whole-dollar amount', () => {
    expect(formatOfferAmount(15)).toBe('$15');
  });

  it('keeps cents when they are significant', () => {
    expect(formatOfferAmount(15.5)).toBe('$15.50');
  });

  it('handles null defensively (a malformed row must not crash the thread)', () => {
    expect(formatOfferAmount(null)).toBe('');
  });
});

describe('offerStatusLabel', () => {
  it('reads as plain English for each state', () => {
    expect(offerStatusLabel('pending')).toBe('Pending');
    expect(offerStatusLabel('accepted')).toBe('Accepted');
    expect(offerStatusLabel('declined')).toBe('Declined');
    expect(offerStatusLabel('countered')).toBe('Countered');
  });
});
