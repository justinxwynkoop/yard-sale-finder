import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { OfferBubble } from '../OfferBubble';
import { Message } from '../../types';

const participants = { buyer_id: 'buyer', seller_id: 'seller' };

const offer = (o: Partial<Message> = {}): Message => ({
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

describe('OfferBubble', () => {
  it('shows the amount', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="seller" participants={participants}
        listingStatus="available"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.getByText(/\$15/)).toBeTruthy();
  });

  it('shows actions to the seller on a pending buyer offer', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="seller" participants={participants}
        listingStatus="available"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.getByText('Accept')).toBeTruthy();
    expect(screen.getByText('Counter')).toBeTruthy();
    expect(screen.getByText('Decline')).toBeTruthy();
  });

  it('hides actions from the buyer who sent it', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="buyer" participants={participants}
        listingStatus="available"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.queryByText('Accept')).toBeNull();
  });

  it('shows actions to the buyer on a pending seller counter-offer', async () => {
    // The case the old owner-only design got wrong: the seller sent a
    // counter, so the buyer (not the "listing owner") is the responder.
    await render(
      <OfferBubble message={offer({ sender_id: 'seller' })} viewerId="buyer" participants={participants}
        listingStatus="available"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.getByText('Accept')).toBeTruthy();
    expect(screen.getByText('Decline')).toBeTruthy();
  });

  it('hides actions once the offer is resolved', async () => {
    await render(
      <OfferBubble message={offer({ offer_status: 'accepted' })} viewerId="seller"
        participants={participants} listingStatus="available"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.getByText('Accepted')).toBeTruthy();
  });

  it('calls onAccept when Accept is pressed', async () => {
    const onAccept = jest.fn();
    await render(
      <OfferBubble message={offer()} viewerId="seller" participants={participants}
        listingStatus="available"
        onAccept={onAccept} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    await act(async () => { fireEvent.press(screen.getByText('Accept')); });
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  // The listing status gate. send_offer's one-pending-offer rule is per
  // CONVERSATION, so two buyers can each have a live offer on one listing:
  // accepting buyer 1's holds the item, and buyer 2's thread must stop
  // offering an Accept the server will refuse ('listing is no longer
  // available') and a Counter that only makes another un-acceptable offer.
  it('hides Accept and Counter while the listing is on hold, but keeps Decline', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="seller" participants={participants}
        listingStatus="pending"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Counter')).toBeNull();
    expect(screen.getByText('Decline')).toBeTruthy();
  });

  it('hides Accept and Counter once the listing is sold, but keeps Decline', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="seller" participants={participants}
        listingStatus="sold"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Counter')).toBeNull();
    expect(screen.getByText('Decline')).toBeTruthy();
  });

  it('explains why the actions are missing rather than looking inert', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="seller" participants={participants}
        listingStatus="sold"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.getByText(/sold/i)).toBeTruthy();
  });

  it('still lets a stale offer be declined on a held item', async () => {
    const onDecline = jest.fn();
    await render(
      <OfferBubble message={offer()} viewerId="seller" participants={participants}
        listingStatus="pending"
        onAccept={jest.fn()} onDecline={onDecline} onCounter={jest.fn()} />,
    );
    await act(async () => { fireEvent.press(screen.getByText('Decline')); });
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the listing could not be loaded at all', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="seller" participants={participants}
        listingStatus={undefined}
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.getByText('Decline')).toBeTruthy();
  });

  it('shows no explanation to someone who had no actions to lose', async () => {
    // The offer's own sender never had Accept/Counter, so a "no longer
    // available" line under their offer would just be noise.
    await render(
      <OfferBubble message={offer()} viewerId="buyer" participants={participants}
        listingStatus="sold"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.queryByText(/no longer be accepted/i)).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
  });
});
