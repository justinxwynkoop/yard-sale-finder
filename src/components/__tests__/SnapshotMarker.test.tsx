import React from 'react';
import { Platform, Text } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';

// Local mock: render the Marker as a probe exposing tracksViewChanges so the
// tests can watch the snapshot window open and close.
jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    Marker: ({ children, tracksViewChanges }: any) => (
      <View testID={`tracking:${String(tracksViewChanges)}`}>{children}</View>
    ),
  };
});

import { SnapshotMarker } from '../SnapshotMarker';

const marker = (redrawKey: string) => (
  <SnapshotMarker
    coordinate={{ latitude: 0, longitude: 0 }}
    redrawKey={redrawKey}
  >
    <Text>pin</Text>
  </SnapshotMarker>
);

describe('SnapshotMarker', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('on Android: tracks on mount, freezes after the settle window, re-arms on redrawKey change', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.useFakeTimers();

    await render(marker('a'));
    // Mount: the snapshot window is open so the first draw is captured.
    expect(screen.getByTestId('tracking:true')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.getByTestId('tracking:false')).toBeTruthy();

    // A look change (e.g. saved → heart) re-opens the window…
    await screen.rerender(marker('b'));
    expect(screen.getByTestId('tracking:true')).toBeTruthy();

    // …and it closes again.
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.getByTestId('tracking:false')).toBeTruthy();
  });

  it('on iOS: never tracks (children render live on Apple Maps)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.useFakeTimers();

    await render(marker('a'));
    expect(screen.getByTestId('tracking:false')).toBeTruthy();

    await screen.rerender(marker('b'));
    expect(screen.getByTestId('tracking:false')).toBeTruthy();
  });
});
