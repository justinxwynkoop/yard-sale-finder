import { Profile } from '../types';
import { isProfileComplete, hasAcceptedTerms } from '../hooks/useProfile';

export type GateStep =
  | 'booting'
  | 'tabs'
  | 'complete_profile'
  | 'terms'
  | 'onboarding';

/**
 * The post-sign-in gate decision, extracted pure so the ordering is unit
 * tested (a wrong order here strands users on the wrong screen — it has
 * bitten before). Semantics MainGate depends on:
 *
 * - Guests skip every gate (App Review 5.1.1(v): browsing must work
 *   without an account) — even mid-boot, since there's no profile to load.
 * - Boot blocks only while there is NO profile yet: once one exists, a
 *   background refetch must never swap MainTabs for the spinner (that
 *   remount resets the tab navigator).
 * - Gate order: profile completeness → terms → one-time onboarding → tabs.
 */
export function gateStep(args: {
  isGuest: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  onboardingDone: boolean;
  onboardingLoading: boolean;
}): GateStep {
  const { isGuest, profile, profileLoading, onboardingDone, onboardingLoading } =
    args;
  if (isGuest) return 'tabs';
  if ((profileLoading && !profile) || onboardingLoading) return 'booting';
  if (!isProfileComplete(profile)) return 'complete_profile';
  if (!hasAcceptedTerms(profile)) return 'terms';
  if (!onboardingDone) return 'onboarding';
  return 'tabs';
}
