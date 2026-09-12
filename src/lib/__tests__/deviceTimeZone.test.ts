import { deviceTimeZone } from '../deviceTimeZone';

describe('deviceTimeZone', () => {
  const realDTF = Intl.DateTimeFormat;
  const stubZone = (timeZone: unknown) => {
    (Intl as any).DateTimeFormat = jest.fn(() => ({
      resolvedOptions: () => ({ timeZone }),
    }));
  };

  afterEach(() => {
    (Intl as any).DateTimeFormat = realDTF;
  });

  it('returns the IANA zone the device reports', () => {
    stubZone('America/Indiana/Indianapolis');
    expect(deviceTimeZone()).toBe('America/Indiana/Indianapolis');
  });

  // The Android emulator ships set to UTC. Recording that on a US sale would
  // make the server end it hours EARLY; null makes it end late instead.
  it('refuses UTC rather than recording an emulator default', () => {
    stubZone('UTC');
    expect(deviceTimeZone()).toBeNull();
    stubZone('Etc/UTC');
    expect(deviceTimeZone()).toBeNull();
  });

  it('returns null for a missing zone', () => {
    stubZone(undefined);
    expect(deviceTimeZone()).toBeNull();
  });

  it('returns null instead of throwing when Intl is unavailable', () => {
    (Intl as any).DateTimeFormat = jest.fn(() => {
      throw new Error('no Intl');
    });
    expect(deviceTimeZone()).toBeNull();
  });
});
