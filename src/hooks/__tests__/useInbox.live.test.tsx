import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useInbox } from '../useInbox'; // jest.mock calls below are hoisted above this

// Controllable mocks — jest.mock factories may only close over vars prefixed `mock`.
const mockUser = { id: 'u1' };
const mockFromCalls: string[] = [];
const mockChannels: { subscribe: jest.Mock; statusCb?: (s: string) => void }[] =
  [];
const mockRemoveChannel = jest.fn();

jest.mock('../useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));
jest.mock('../../lib/supabase', () => {
  const chain: any = {
    select: () => chain,
    or: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  return {
    supabase: {
      from: (table: string) => {
        mockFromCalls.push(table);
        return chain;
      },
      channel: () => {
        const ch: any = {
          on: () => ch,
          subscribe: jest.fn((cb?: (s: string) => void) => {
            ch.statusCb = cb;
            return ch;
          }),
        };
        mockChannels.push(ch);
        return ch;
      },
      removeChannel: (ch: unknown) => mockRemoveChannel(ch),
      rpc: () => Promise.resolve({ error: null }),
    },
  };
});

let appStateListener: ((state: string) => void) | null = null;

beforeEach(() => {
  mockFromCalls.length = 0;
  mockChannels.length = 0;
  mockRemoveChannel.mockClear();
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (state: string) => void,
  ) => {
    appStateListener = handler;
    return { remove: jest.fn() } as any;
  }) as any);
  (AppState as any).currentState = 'active';
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const flush = () => act(async () => {});

describe('useInbox — live updates', () => {
  it('returns stable refetch / silentRefetch identities across renders (no focus-effect refetch loop)', async () => {
    const { result, rerender } = await renderHook(() => useInbox());
    await flush();
    const { refetch, silentRefetch } = result.current;

    await rerender({});
    await flush();
    expect(result.current.refetch).toBe(refetch);
    expect(result.current.silentRefetch).toBe(silentRefetch);

    // Exactly one inbox load for the initial mount + re-render.
    expect(mockFromCalls.filter((t) => t === 'conversations')).toHaveLength(1);
  });

  it('refetches and rebuilds the Realtime channel when the app returns to the foreground', async () => {
    await renderHook(() => useInbox());
    await flush();
    expect(mockChannels).toHaveLength(1);
    expect(mockFromCalls.filter((t) => t === 'conversations')).toHaveLength(1);

    await act(() => appStateListener!('background'));
    await act(() => appStateListener!('active'));
    await flush();

    expect(mockFromCalls.filter((t) => t === 'conversations')).toHaveLength(2);
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    expect(mockChannels).toHaveLength(2);
  });

  it('rebuilds the channel after a CHANNEL_ERROR / TIMED_OUT status', async () => {
    jest.useFakeTimers();
    await renderHook(() => useInbox());
    await flush();
    expect(mockChannels).toHaveLength(1);

    await act(() => mockChannels[0].statusCb!('CHANNEL_ERROR'));
    expect(mockChannels).toHaveLength(1); // not immediately — after the retry delay

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    expect(mockChannels).toHaveLength(2);
  });
});
