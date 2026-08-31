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
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.getByText(/\$15/)).toBeTruthy();
  });

  it('shows actions to the seller on a pending buyer offer', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="seller" participants={participants}
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.getByText('Accept')).toBeTruthy();
    expect(screen.getByText('Decline')).toBeTruthy();
  });

  it('hides actions from the buyer who sent it', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="buyer" participants={participants}
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.queryByText('Accept')).toBeNull();
  });

  it('shows actions to the buyer on a pending seller counter-offer', async () => {
    // The case the old owner-only design got wrong: the seller sent a
    // counter, so the buyer (not the "listing owner") is the responder.
    await render(
      <OfferBubble message={offer({ sender_id: 'seller' })} viewerId="buyer" participants={participants}
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.getByText('Accept')).toBeTruthy();
    expect(screen.getByText('Decline')).toBeTruthy();
  });

  it('hides actions once the offer is resolved', async () => {
    await render(
      <OfferBubble message={offer({ offer_status: 'accepted' })} viewerId="seller"
        participants={participants} onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.getByText('Accepted')).toBeTruthy();
  });

  it('calls onAccept when Accept is pressed', async () => {
    const onAccept = jest.fn();
    await render(
      <OfferBubble message={offer()} viewerId="seller" participants={participants}
        onAccept={onAccept} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    await act(async () => { fireEvent.press(screen.getByText('Accept')); });
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
