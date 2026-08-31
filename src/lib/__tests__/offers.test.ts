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
  it('lets the listing owner respond to a pending offer', () => {
    expect(canRespondToOffer(msg({}), 'seller', 'seller')).toBe(true);
  });

  it('does NOT let the buyer respond to their own offer', () => {
    expect(canRespondToOffer(msg({}), 'buyer', 'seller')).toBe(false);
  });

  it('does NOT let a non-owner respond even if they are in the thread', () => {
    expect(canRespondToOffer(msg({}), 'buyer', 'seller')).toBe(false);
  });

  it('does NOT allow responding twice — only pending offers are actionable', () => {
    expect(canRespondToOffer(msg({ offer_status: 'accepted' }), 'seller', 'seller')).toBe(false);
    expect(canRespondToOffer(msg({ offer_status: 'countered' }), 'seller', 'seller')).toBe(false);
  });

  it('returns false for a signed-out viewer', () => {
    expect(canRespondToOffer(msg({}), null, 'seller')).toBe(false);
  });

  it('returns false for a non-offer row', () => {
    expect(canRespondToOffer(msg({ kind: 'text', offer_status: null }), 'seller', 'seller')).toBe(false);
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
