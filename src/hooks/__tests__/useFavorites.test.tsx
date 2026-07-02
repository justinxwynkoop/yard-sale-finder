import { renderHook, act } from '@testing-library/react-native';
import { useFavorites } from '../useFavorites'; // jest.mock calls below are hoisted above this

// Controllable mocks — jest.mock factories may only close over vars prefixed `mock`.
let mockUser: { id: string } | null = { id: 'u1' };
let mockQueryImpl: () => Promise<any> = () =>
  Promise.resolve({ data: [], error: null });

jest.mock('../useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
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
});
