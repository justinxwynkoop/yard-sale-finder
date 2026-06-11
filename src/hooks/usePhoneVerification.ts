import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { invalidateProfile } from './useProfile';

/**
 * Real phone verification via Supabase Auth phone OTP.
 *
 * Flow: sendCode() attaches the phone to the signed-in account, which
 * triggers an SMS OTP; verifyCode() confirms it and, on success, marks
 * profiles.phone + phone_verified so the trust badge can light up.
 *
 * REQUIRES an SMS provider (e.g. Twilio) configured in Supabase Auth →
 * Providers → Phone. Without one, sendCode() returns a provider error
 * (surfaced to the user) — the flow is real, it just can't deliver SMS
 * until a provider is enabled.
 */

/** Best-effort E.164 normalization (assume US if no country code). */
export function toE164(input: string): string {
  const digits = input.replace(/[^\d]/g, '');
  if (input.trim().startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

export function usePhoneVerification() {
  const sendCode = useCallback(async (phoneInput: string) => {
    const phone = toE164(phoneInput);
    const { error } = await supabase.auth.updateUser({ phone });
    return { phone, error };
  }, []);

  const verifyCode = useCallback(
    async (phone: string, token: string) => {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: token.trim(),
        type: 'phone_change',
      });
      if (error) return { error };

      // OTP confirmed → reflect it on the profile so the badge shows.
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        await supabase
          .from('profiles')
          .update({ phone, phone_verified: true })
          .eq('id', auth.user.id);
        invalidateProfile();
      }
      return { error: null };
    },
    [],
  );

  return { sendCode, verifyCode };
}
