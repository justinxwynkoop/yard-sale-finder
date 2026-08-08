import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { EventJoinPrompt } from '../EventJoinPrompt';
import { SaleEvent } from '../../types';

const event: SaleEvent = {
  id: 'e1', organizer_id: 'u1', title: 'Maple Grove Neighborhood Sale',
  description: null, cover_url: null, start_date: '2026-08-15',
  end_date: '2026-08-16', latitude: 0, longitude: 0, radius_m: 800,
  share_slug: 'abc12345', created_at: '', updated_at: '',
};

describe('EventJoinPrompt', () => {
  it('overlap variant: one Join button, joins without moving dates', async () => {
    const onJoin = jest.fn();
    await render(
      <EventJoinPrompt visible event={event} saleStart="2026-08-15"
        saleEnd="2026-08-15" onJoin={onJoin} onDecline={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(screen.getByText(/want to be part of it/i)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Join'));
    });
    expect(onJoin).toHaveBeenCalledWith(false);
  });

  it('mismatch variant: offers moving the sale to the event weekend', async () => {
    const onJoin = jest.fn();
    await render(
      <EventJoinPrompt visible event={event} saleStart="2026-08-22"
        saleEnd="2026-08-22" onJoin={onJoin} onDecline={jest.fn()} onDismiss={jest.fn()} />,
    );
    await act(async () => {
      fireEvent.press(screen.getByText(/move my sale/i));
    });
    expect(onJoin).toHaveBeenCalledWith(true);
  });

  it('mismatch variant: can join keeping own dates, and decline', async () => {
    const onJoin = jest.fn();
    const onDecline = jest.fn();
    await render(
      <EventJoinPrompt visible event={event} saleStart="2026-08-22"
        saleEnd="2026-08-22" onJoin={onJoin} onDecline={onDecline} onDismiss={jest.fn()} />,
    );
    await act(async () => {
      fireEvent.press(screen.getByText(/join with my dates/i));
    });
    expect(onJoin).toHaveBeenCalledWith(false);
    await act(async () => {
      fireEvent.press(screen.getByText(/no thanks/i));
    });
    expect(onDecline).toHaveBeenCalled();
  });

  it('backdrop press calls onDismiss, not onDecline (soft dismiss, not a permanent decline)', async () => {
    const onJoin = jest.fn();
    const onDecline = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <EventJoinPrompt visible event={event} saleStart="2026-08-15"
        saleEnd="2026-08-15" onJoin={onJoin} onDecline={onDecline} onDismiss={onDismiss} />,
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Dismiss'));
    });
    expect(onDismiss).toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
  });
});
