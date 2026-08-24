import { track } from '../analytics';

const mockInsert = jest.fn();
const mockGetSession = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    from: () => ({ insert: (...args: unknown[]) => mockInsert(...args) }),
  },
}));

// track() is deliberately fire-and-forget; flush its microtask chain.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('track (fire-and-forget analytics)', () => {
  beforeEach(() => {
    mockInsert.mockReset().mockResolvedValue({ error: null });
    mockGetSession.mockReset();
  });

  it('attaches the signed-in user id', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    track('sale_viewed', { saleId: 's1' });
    await flush();
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'sale_viewed',
      props: { saleId: 's1' },
      user_id: 'u1',
    });
  });

  it('logs guests with a null user id', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    track('app_open');
    await flush();
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'app_open',
      props: {},
      user_id: null,
    });
  });

  it('never throws — a dead network must not break the app', async () => {
    mockGetSession.mockRejectedValue(new Error('offline'));
    expect(() => track('app_open')).not.toThrow();
    await flush();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockInsert.mockRejectedValue(new Error('rls says no'));
    expect(() => track('app_open')).not.toThrow();
    await flush();
  });
});
