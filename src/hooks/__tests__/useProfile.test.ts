import {
  splitProfilePatch,
  isProfileComplete,
  PRIVATE_PROFILE_COLUMNS,
} from '../useProfile';
import { Profile } from '../../types';

// Mock the supabase client so importing useProfile (which transitively imports
// the client) doesn't open a real connection in the test env. jest hoists this
// above the imports, so the mock is in place before useProfile loads. We only
// exercise the pure helpers here.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

describe('PRIVATE_PROFILE_COLUMNS', () => {
  it('is exactly the PII columns moved off profiles', () => {
    expect([...PRIVATE_PROFILE_COLUMNS].sort()).toEqual(
      ['birthdate', 'email', 'phone', 'zip_code'].sort(),
    );
  });
});

describe('splitProfilePatch', () => {
  it('routes PII to privatePatch and everything else to profilesPatch', () => {
    const { profilesPatch, privatePatch } = splitProfilePatch({
      display_name: 'A',
      city: 'X',
      notify_messages: true,
      email: 'e@x.com',
      phone: '1',
      birthdate: '2000-01-01',
      zip_code: '07040',
    } as Partial<Profile>);
    expect(profilesPatch).toEqual({
      display_name: 'A',
      city: 'X',
      notify_messages: true,
    });
    expect(privatePatch).toEqual({
      email: 'e@x.com',
      phone: '1',
      birthdate: '2000-01-01',
      zip_code: '07040',
    });
  });

  it('handles empty, profiles-only, and private-only patches', () => {
    expect(splitProfilePatch({})).toEqual({ profilesPatch: {}, privatePatch: {} });
    expect(splitProfilePatch({ bio: 'hi' } as Partial<Profile>)).toEqual({
      profilesPatch: { bio: 'hi' },
      privatePatch: {},
    });
    expect(splitProfilePatch({ phone: '5' } as Partial<Profile>)).toEqual({
      profilesPatch: {},
      privatePatch: { phone: '5' },
    });
  });
});

describe('isProfileComplete (gate also depends on the merged birthdate + zip)', () => {
  const complete = {
    first_name: 'A',
    last_name: 'B',
    city: 'C',
    state: 'NJ',
    zip_code: '07040',
    birthdate: '2000-01-01',
  } as Profile;

  it('true when all required fields are present', () => {
    expect(isProfileComplete(complete)).toBe(true);
  });

  it('false when the merged PII (birthdate / zip) is missing', () => {
    expect(isProfileComplete({ ...complete, birthdate: null } as Profile)).toBe(false);
    expect(isProfileComplete({ ...complete, zip_code: null } as Profile)).toBe(false);
  });

  it('false when a profiles field is missing, and for null', () => {
    expect(isProfileComplete({ ...complete, first_name: null } as Profile)).toBe(false);
    expect(isProfileComplete(null)).toBe(false);
  });
});
