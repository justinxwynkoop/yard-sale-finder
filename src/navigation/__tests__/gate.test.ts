import { gateStep } from '../gate';
import { Profile } from '../../types';

// The gate only reads the fields isProfileComplete / hasAcceptedTerms need.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const complete = {
  id: 'u1',
  first_name: 'Jason',
  last_name: 'W',
  birthdate: '1990-01-01',
  city: 'Muncie',
  state: 'IN',
  terms_accepted_at: '2026-01-01T00:00:00Z',
} as unknown as Profile;

const base = {
  isGuest: false,
  profile: complete,
  profileLoading: false,
  onboardingDone: true,
  onboardingLoading: false,
};

describe('gateStep (post-sign-in gate ordering)', () => {
  it('guests skip every gate, even mid-boot', () => {
    expect(gateStep({ ...base, isGuest: true, profile: null })).toBe('tabs');
    expect(
      gateStep({
        ...base,
        isGuest: true,
        profile: null,
        profileLoading: true,
        onboardingLoading: true,
      }),
    ).toBe('tabs');
  });

  it('boots only while there is NO profile yet — a background refetch must not re-boot', () => {
    expect(gateStep({ ...base, profile: null, profileLoading: true })).toBe(
      'booting',
    );
    // Profile already loaded + refetch in flight -> stay on tabs.
    expect(gateStep({ ...base, profileLoading: true })).toBe('tabs');
  });

  it('waits for the onboarding flag so tabs never flash before the slides', () => {
    expect(gateStep({ ...base, onboardingLoading: true })).toBe('booting');
  });

  it('orders the gates: profile -> terms -> onboarding -> tabs', () => {
    expect(gateStep({ ...base, profile: null })).toBe('complete_profile');
    expect(
      gateStep({
        ...base,
        profile: { ...complete, first_name: '  ' } as unknown as Profile,
      }),
    ).toBe('complete_profile');
    expect(
      gateStep({
        ...base,
        profile: { ...complete, terms_accepted_at: null } as unknown as Profile,
      }),
    ).toBe('terms');
    expect(gateStep({ ...base, onboardingDone: false })).toBe('onboarding');
    expect(gateStep(base)).toBe('tabs');
  });
});
