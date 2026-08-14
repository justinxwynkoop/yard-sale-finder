import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { DraftBanner } from '../DraftBanner';

describe('DraftBanner', () => {
  const savedAt = new Date(Date.now() - 5 * 60_000).toISOString();

  it('shows the prompt, the age, and the on-this-device label', async () => {
    await render(
      <DraftBanner savedAt={savedAt} onRestore={jest.fn()} onStartFresh={jest.fn()} />,
    );
    expect(screen.getByText('Pick up where you left off?')).toBeTruthy();
    expect(screen.getByText('Saved 5 min ago · on this device')).toBeTruthy();
  });

  it('fires onRestore and onStartFresh', async () => {
    const onRestore = jest.fn();
    const onStartFresh = jest.fn();
    await render(
      <DraftBanner savedAt={savedAt} onRestore={onRestore} onStartFresh={onStartFresh} />,
    );
    await act(() => {
      fireEvent.press(screen.getByText('Restore'));
    });
    expect(onRestore).toHaveBeenCalledTimes(1);
    await act(() => {
      fireEvent.press(screen.getByText('Start fresh'));
    });
    expect(onStartFresh).toHaveBeenCalledTimes(1);
  });
});
