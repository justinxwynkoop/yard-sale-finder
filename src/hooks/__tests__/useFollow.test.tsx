import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useFollow } from '../useFollow'; // jest.mock calls below are hoisted above this

// Controllable mocks — jest.mock factories may only close over vars prefixed `mock`.
let mockUser: { id: string } | null = { id: 'me' };
let mockAuthLoading = false;
let mockCountImpl: () => Promise<any> = () =>
  Promise.resolve({ count: 1, error: null });
let mockMineImpl: () => Promise<any> = () =>
  Promise.resolve({ data: { notify: true }, error: null });
let mockWriteImpl: () => Promise<any> = () => Promise.resolve({ error: null });
let mockWrites: string[] = [];

jest.mock('../useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: mockAuthLoading }),
}));

jest.mock('../../lib/supabase', () => {
  // Reads resolve through `then` (the follower-count query) or `maybeSingle`
  // (the "am I following" query). Writes are recorded so a test can assert the
  // follow write is idempotent without depending on builder call order.
  const writeChain: any = {
    eq: () => writeChain,
    then: (resolve: any, reject: any) => mockWriteImpl().then(resolve, reject),
  };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => mockMineImpl(),
    insert: () => {
      mockWrites.push('insert');
      return mockWriteImpl();
    },
    upsert: () => {
      mockWrites.push('upsert');
      return mockWriteImpl();
    },
    delete: () => {
      mockWrites.push('delete');
      return writeChain;
    },
    update: () => {
      mockWrites.push('update');
      return writeChain;
    },
    then: (resolve: any, reject: any) => mockCountImpl().then(resolve, reject),
  };
  return { supabase: { from: () => chain } };
});

beforeEach(() => {
  mockUser = { id: 'me' };
  mockAuthLoading = false;
  mockCountImpl = () => Promise.resolve({ count: 1, error: null });
  mockMineImpl = () => Promise.resolve({ data: { notify: true }, error: null });
  mockWriteImpl = () => Promise.resolve({ error: null });
  mockWrites = [];
});

describe('useFollow — follow state survives auth resolving', () => {
  it('reports following once auth resolves', async () => {
    const { result } = await renderHook(() => useFollow('justin'));
    await waitFor(() => expect(result.current.following).toBe(true));
  });

  it('does not let a pre-auth fetch overwrite the authed result', async () => {
    // The hook mounts before useAuth has a session (it is per-instance and
    // starts null). That first pass cannot know whether we follow anyone, and
    // its response must never win over the authed one that follows it.
    mockUser = null;
    mockAuthLoading = true;

    let call = 0;
    mockCountImpl = () => {
      call += 1;
      const slow = call === 1; // the pre-auth pass lands LAST
      return new Promise((resolve) =>
        setTimeout(() => resolve({ count: 1, error: null }), slow ? 40 : 0),
      );
    };

    const { rerender, result } = await renderHook(() => useFollow('justin'));

    mockUser = { id: 'me' };
    mockAuthLoading = false;
    await act(async () => {
      rerender(undefined);
    });

    // Poll rather than race a fixed delay: the authed fetch has to resolve,
    // and the point of the test is that the earlier pass never overwrites it.
    await waitFor(() => expect(result.current.following).toBe(true));
  });
});

describe('useFollow — following someone already followed', () => {
  it('stays followed when the write reports a duplicate row', async () => {
    // The row already exists, so `follows`' (follower_id, followed_id) primary
    // key rejects a second insert. That is not a failure — it means the follow
    // is already in place, and the button must not flip back to "Follow".
    mockMineImpl = () => Promise.resolve({ data: null, error: null }); // state says not following
    mockWriteImpl = () =>
      Promise.resolve({
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
      });

    const { result } = await renderHook(() => useFollow('justin'));
    await waitFor(() => expect(result.current.following).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.following).toBe(true);
  });

  it('writes the follow idempotently rather than as a bare insert', async () => {
    mockMineImpl = () => Promise.resolve({ data: null, error: null });
    const { result } = await renderHook(() => useFollow('justin'));
    await waitFor(() => expect(result.current.following).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockWrites).toContain('upsert');
    expect(mockWrites).not.toContain('insert');
  });

  it('still unfollows when already following', async () => {
    const { result } = await renderHook(() => useFollow('justin'));
    await waitFor(() => expect(result.current.following).toBe(true));

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockWrites).toContain('delete');
    expect(result.current.following).toBe(false);
  });
});
