import { renderHook, act } from '@testing-library/react-native';
import { useFavorites } from '../useFavorites'; // jest.mock calls below are hoisted above this

// Controllable mocks — jest.mock factories may only close over vars prefixed `mock`.
let mockUser: { id: string } | null = { id: 'u1' };
let mockAuthLoading = false;
let mockQueryImpl: () => Promise<any> = () =>
  Promise.resolve({ data: [], error: null });

jest.mock('../useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: mockAuthLoading }),
}));
jest.mock('../useBlockedUsers', () => ({
  useBlockedUsers: () => ({ blockedIds: new Set() }),
}));
jest.mock('../../lib/supabase', () => {
  // A single chainable thenable: awaiting any query chain runs mockQueryImpl,
  // so tests don't depend on the exact builder call order.
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    abortSignal: () => chain,
    delete: () => chain,
    in: () => Promise.resolve({ error: null }),
    insert: () => Promise.resolve({ error: null }),
    then: (resolve: any, reject: any) => mockQueryImpl().then(resolve, reject),
  };
  return { supabase: { from: () => chain } };
});

describe('useFavorites — loading never gets stuck (Saved Sales spinner bug)', () => {
  beforeEach(() => {
    mockUser = { id: 'u1' };
    mockAuthLoading = false;
    mockQueryImpl = () => Promise.resolve({ data: [], error: null });
  });

  it('clears loading even when the favorites query rejects (or hangs)', async () => {
    // A rejected/aborted query must not strand the shared loading flag on.
    mockQueryImpl = () =>
      Promise.reject(new Error('network down / auth lock hang'));
    const { result } = await renderHook(() => useFavorites());
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.loading).toBe(false);
  });

  it('does not pin loading = true when refetch runs with no user', async () => {
    mockUser = null;
    const { result } = await renderHook(() => useFavorites());
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.loading).toBe(false);
  });

  it('does not wipe the shared store when a new screen mounts before auth resolves', async () => {
    // 1. A signed-in instance loads a favorite into the shared module store.
    mockUser = { id: 'u1' };
    mockAuthLoading = false;
    mockQueryImpl = () =>
      Promise.resolve({
        data: [{ sale_id: 's1', sale: { id: 's1', user_id: 'u1', media: [] } }],
        error: null,
      });
    const first = await renderHook(() => useFavorites());
    await act(async () => {
      await first.result.current.refetch();
    });
    expect(first.result.current.favorites).toHaveLength(1);

    // 2. A second screen (e.g. SavedScreen) mounts while ITS useAuth hasn't
    //    resolved yet: user=null, loading=true. The regression: the mount
    //    effect used to call _reset() here — blanking the list and pinning
    //    loading=true, i.e. a spinner over an empty list on every open.
    //    With the auth-loading gate it must be a no-op: store preserved.
    mockUser = null;
    mockAuthLoading = true;
    const second = await renderHook(() => useFavorites());
    expect(second.result.current.favorites).toHaveLength(1);
    expect(second.result.current.loading).toBe(false);
  });
});
