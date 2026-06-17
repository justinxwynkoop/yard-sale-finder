// Tiny module-level emitter that signals "a password-recovery deep link
// was just processed", so the navigator can force the ResetPassword
// screen.
//
// Why this exists: in React Native we handle Supabase auth links
// ourselves (setSession / exchangeCodeForSession). That path emits a
// SIGNED_IN event, NOT the PASSWORD_RECOVERY event the web SDK fires via
// detectSessionInUrl. Relying on PASSWORD_RECOVERY alone means a tapped
// reset link silently logs the user into the app instead of letting them
// set a new password. authDeepLinks calls triggerRecovery() when it sees
// a reset link; useAuth subscribes and flips `inRecovery`.

type Listener = () => void;

const listeners = new Set<Listener>();

export function onRecovery(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function triggerRecovery(): void {
  listeners.forEach((fn) => fn());
}
