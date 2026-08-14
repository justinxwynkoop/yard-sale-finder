import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { DraftRow } from '../DraftRow';

describe('DraftRow', () => {
  const savedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();

  it('renders title, DRAFT chip, and age sublabel', async () => {
    await render(
      <DraftRow kind="sale" title="Moving sale" savedAt={savedAt} onPress={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(screen.getByText('Moving sale')).toBeTruthy();
    expect(screen.getByText('DRAFT')).toBeTruthy();
    expect(screen.getByText('Saved 2 hours ago · on this device')).toBeTruthy();
  });

  it('falls back to an untitled label per kind', async () => {
    await render(
      <DraftRow kind="listing" title="" savedAt={savedAt} onPress={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(screen.getByText('Untitled item')).toBeTruthy();
  });

  it('fires onPress on the row and onDiscard on the pill', async () => {
    const onPress = jest.fn();
    const onDiscard = jest.fn();
    await render(
      <DraftRow kind="sale" title="X" savedAt={savedAt} onPress={onPress} onDiscard={onDiscard} />,
    );
    await act(() => {
      fireEvent.press(screen.getByLabelText('Continue draft'));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    await act(() => {
      fireEvent.press(screen.getByText('Discard'));
    });
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1); // pill press must not bubble
  });
});
