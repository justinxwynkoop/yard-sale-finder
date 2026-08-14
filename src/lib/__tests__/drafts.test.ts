jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  isMeaningful,
  draftAge,
  mediaTypeForUri,
} from '../drafts';

beforeEach(() => AsyncStorage.clear());

describe('save/load/clear round-trip', () => {
  it('round-trips fields and media under the sale key', async () => {
    await saveDraft('sale', { title: 'Moving sale', startDate: '2026-08-15' }, ['file:///a.jpg']);
    const d = await loadDraft('sale');
    expect(d).not.toBeNull();
    expect(d!.v).toBe(1);
    expect(d!.fields.title).toBe('Moving sale');
    expect(d!.media).toEqual(['file:///a.jpg']);
    expect(typeof d!.savedAt).toBe('string');
    expect(Number.isNaN(Date.parse(d!.savedAt))).toBe(false);
  });

  it('sale and listing slots are independent', async () => {
    await saveDraft('sale', { title: 'S' }, []);
    await saveDraft('listing', { title: 'L' }, []);
    expect((await loadDraft('sale'))!.fields.title).toBe('S');
    expect((await loadDraft('listing'))!.fields.title).toBe('L');
  });

  it('saving again overwrites (one draft per type)', async () => {
    await saveDraft('sale', { title: 'first' }, []);
    await saveDraft('sale', { title: 'second' }, []);
    expect((await loadDraft('sale'))!.fields.title).toBe('second');
  });

  it('returns null when nothing is stored', async () => {
    expect(await loadDraft('sale')).toBeNull();
  });

  it('returns null on corrupt JSON', async () => {
    await AsyncStorage.setItem('trove:draft:sale', 'not json {');
    expect(await loadDraft('sale')).toBeNull();
  });

  it('returns null on an unknown version', async () => {
    await AsyncStorage.setItem(
      'trove:draft:sale',
      JSON.stringify({ v: 99, savedAt: new Date().toISOString(), fields: {}, media: [] }),
    );
    expect(await loadDraft('sale')).toBeNull();
  });

  it('clearDraft removes the slot', async () => {
    await saveDraft('listing', { title: 'x' }, []);
    await clearDraft('listing');
    expect(await loadDraft('listing')).toBeNull();
  });

  it('a clear issued after a save wins even when neither is awaited in order', async () => {
    const p1 = saveDraft('sale', { title: 'racing' }, []);
    const p2 = clearDraft('sale');
    await Promise.all([p1, p2]);
    expect(await loadDraft('sale')).toBeNull();
  });

  it('a save issued after a clear wins', async () => {
    const p1 = clearDraft('sale');
    const p2 = saveDraft('sale', { title: 'after' }, []);
    await Promise.all([p1, p2]);
    expect((await loadDraft('sale'))!.fields.title).toBe('after');
  });

  it(
    'a clear issued while a save is still in flight wins (delayed setItem)',
    async () => {
      // The jest mock mutates storage synchronously at call time, so the two
      // call-order tests above can't reproduce the real race (completion order
      // inverted vs call order). Force it: delay setItem's resolution past
      // removeItem's, so only genuine write serialization can keep order.
      const store = new Map<string, string>();
      const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation(
        ((key: string, value: string) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              store.set(key, value);
              resolve();
            }, 50);
          })) as any,
      );
      const getItemSpy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation(
        ((key: string) => Promise.resolve(store.get(key) ?? null)) as any,
      );
      const removeItemSpy = jest.spyOn(AsyncStorage, 'removeItem').mockImplementation(
        ((key: string) => {
          store.delete(key);
          return Promise.resolve();
        }) as any,
      );
      try {
        const p1 = saveDraft('sale', { title: 'slow save' }, []);
        const p2 = clearDraft('sale');
        await Promise.all([p1, p2]);
        expect(await loadDraft('sale')).toBeNull();
      } finally {
        setItemSpy.mockRestore();
        getItemSpy.mockRestore();
        removeItemSpy.mockRestore();
      }
    },
    15000,
  );
});

describe('isMeaningful', () => {
  it('false for an empty form', () => {
    expect(isMeaningful({ title: '', description: '', mediaCount: 0 })).toBe(false);
  });
  it('false for whitespace-only text', () => {
    expect(isMeaningful({ title: '   ', description: '\n', mediaCount: 0 })).toBe(false);
  });
  it('true with a title', () => {
    expect(isMeaningful({ title: 'Yard sale', mediaCount: 0 })).toBe(true);
  });
  it('true with a description only', () => {
    expect(isMeaningful({ description: 'lots of stuff', mediaCount: 0 })).toBe(true);
  });
  it('true with a photo only', () => {
    expect(isMeaningful({ mediaCount: 1 })).toBe(true);
  });
});

describe('draftAge', () => {
  const now = Date.parse('2026-08-13T12:00:00Z');
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  it('under a minute → "just now"', () => {
    expect(draftAge(at(30_000), now)).toBe('just now');
  });
  it('minutes', () => {
    expect(draftAge(at(5 * 60_000), now)).toBe('5 min ago');
  });
  it('one hour', () => {
    expect(draftAge(at(60 * 60_000), now)).toBe('1 hour ago');
  });
  it('hours', () => {
    expect(draftAge(at(3 * 3_600_000), now)).toBe('3 hours ago');
  });
  it('one day → "yesterday"', () => {
    expect(draftAge(at(26 * 3_600_000), now)).toBe('yesterday');
  });
  it('days', () => {
    expect(draftAge(at(3 * 86_400_000), now)).toBe('3 days ago');
  });
});

describe('mediaTypeForUri', () => {
  it.each([
    ['file:///x/photo.jpg', 'image'],
    ['file:///x/clip.mp4', 'video'],
    ['file:///x/clip.MOV', 'video'],
    ['https://cdn.example.com/a/0.jpg', 'image'],
    ['https://cdn.example.com/a/1.mp4', 'video'],
  ])('%s → %s', (uri, expected) => {
    expect(mediaTypeForUri(uri)).toBe(expected);
  });
});
