const { pinnedRuntime, liveRuntime, checkRuntime } = require('../lib/runtime');

const LIVE = '13ae0c60e5076289ce40f51bf3d5ab10f1b1810a';
const builds = [
  {
    status: 'ERRORED',
    buildProfile: 'production',
    platform: 'IOS',
    runtimeVersion: 'bad',
  },
  {
    status: 'FINISHED',
    buildProfile: 'development',
    platform: 'IOS',
    runtimeVersion: 'dev',
  },
  {
    status: 'FINISHED',
    buildProfile: 'production',
    platform: 'ANDROID',
    runtimeVersion: 'droid',
  },
  {
    status: 'FINISHED',
    buildProfile: 'production',
    platform: 'IOS',
    runtimeVersion: LIVE,
  },
];

describe('pinnedRuntime', () => {
  it('returns the string runtime version', () => {
    expect(pinnedRuntime({ expo: { runtimeVersion: ' abc ' } })).toBe('abc');
  });
  it('returns null for a policy object, empty, or missing', () => {
    expect(
      pinnedRuntime({ expo: { runtimeVersion: { policy: 'fingerprint' } } }),
    ).toBeNull();
    expect(pinnedRuntime({ expo: { runtimeVersion: '' } })).toBeNull();
    expect(pinnedRuntime({ expo: {} })).toBeNull();
    expect(pinnedRuntime(null)).toBeNull();
  });
});

describe('liveRuntime', () => {
  it('skips errored and non-production builds and honours the platform', () => {
    expect(liveRuntime(builds, 'ios')).toBe(LIVE);
    expect(liveRuntime(builds, 'android')).toBe('droid');
  });
  it('returns null when nothing qualifies', () => {
    expect(liveRuntime([], 'ios')).toBeNull();
    expect(liveRuntime(null, 'ios')).toBeNull();
  });
});

describe('checkRuntime (the OTA gate)', () => {
  it('passes when the pinned runtime equals the live build runtime', () => {
    const r = checkRuntime({
      appJson: { expo: { runtimeVersion: LIVE } },
      builds,
      platform: 'ios',
    });
    expect(r.ok).toBe(true);
  });
  it('refuses a policy-derived runtime (the drift that orphaned the 2026-08-23 OTA)', () => {
    const r = checkRuntime({
      appJson: { expo: { runtimeVersion: { policy: 'fingerprint' } } },
      builds,
      platform: 'ios',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/pinned string/);
  });
  it('refuses a pinned runtime that no live build has, naming both values', () => {
    const r = checkRuntime({
      appJson: { expo: { runtimeVersion: '429c9ab8' } },
      builds,
      platform: 'ios',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('429c9ab8');
    expect(r.reason).toContain(LIVE);
  });
  it('refuses when there is no finished production build to compare against', () => {
    const r = checkRuntime({
      appJson: { expo: { runtimeVersion: LIVE } },
      builds: [],
      platform: 'ios',
    });
    expect(r.ok).toBe(false);
  });
});
