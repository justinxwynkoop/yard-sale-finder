import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useAppForeground } from '../useAppForeground';

// Capture the AppState listener so tests can drive transitions directly.
let listener: ((state: string) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  listener = null;
  remove.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (state: string) => void,
  ) => {
    listener = handler;
    return { remove } as any;
  }) as any);
  (AppState as any).currentState = 'active';
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useAppForeground', () => {
  it('fires only on a background/inactive -> active transition', async () => {
    const cb = jest.fn();
    await renderHook(() => useAppForeground(cb));
    expect(listener).not.toBeNull();

    await act(() => listener!('active')); // active -> active: not a return
    expect(cb).not.toHaveBeenCalled();

    await act(() => listener!('inactive'));
    await act(() => listener!('background'));
    expect(cb).not.toHaveBeenCalled();

    await act(() => listener!('active'));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('calls the latest callback without re-subscribing', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await renderHook(({ cb }) => useAppForeground(cb), {
      initialProps: { cb: first },
    });
    // Relative count: the test renderer registers its own AppState listener.
    const subscriptions = (AppState.addEventListener as jest.Mock).mock.calls.length;

    await rerender({ cb: second });
    expect(AppState.addEventListener).toHaveBeenCalledTimes(subscriptions);

    await act(() => listener!('background'));
    await act(() => listener!('active'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('removes the listener on unmount', async () => {
    const { unmount } = await renderHook(() => useAppForeground(() => {}));
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
