import { Alert } from 'react-native';
import { navigateToAuth } from './navigationRef';

/**
 * Guest-mode gate for account-based actions.
 *
 * Guests can browse everything (map, sale/listing details, search) without an
 * account — required by App Review guideline 5.1.1(v). Account-based actions
 * (saving, messaging, posting, following) call this instead: it offers the
 * sign-in flow with a one-line explanation of why.
 *
 * Usage at a call site with a signed-in user available via useAuth():
 *   const onSave = () => {
 *     if (!user) return promptSignIn('save sales you want to revisit');
 *     toggle(sale.id);
 *   };
 */
export function promptSignIn(actionDescription: string): void {
  Alert.alert(
    'Sign in to continue',
    `Create a free account to ${actionDescription}.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Sign in', onPress: () => navigateToAuth('signup') },
    ],
  );
}
