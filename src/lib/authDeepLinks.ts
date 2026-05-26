// Handle Supabase auth deep links (email confirmation, password reset).
//
// The links Supabase emails come in two shapes depending on which auth
// flow is configured in the project:
//   1) Implicit flow — tokens in the URL fragment:
//        trove://auth-callback#access_token=...&refresh_token=...&type=recovery
//   2) PKCE / code flow — a code in the query string:
//        trove://reset-password?code=abc123
//
// In React Native there is no window.location for the Supabase JS client
// to auto-detect, so we listen for Linking events ourselves and feed the
// token / code into supabase.auth.

import { supabase } from './supabase';

export type DeepLinkResult =
  | { kind: 'session_set'; type: string | null }
  | { kind: 'code_exchanged' }
  | { kind: 'ignored' }
  | { kind: 'error'; message: string };

function parseFragment(fragment: string): URLSearchParams {
  return new URLSearchParams(fragment);
}

export async function handleAuthDeepLink(url: string): Promise<DeepLinkResult> {
  try {
    // Fragment-based (implicit flow)
    const hashIdx = url.indexOf('#');
    if (hashIdx >= 0) {
      const params = parseFragment(url.slice(hashIdx + 1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) return { kind: 'error', message: error.message };
        return { kind: 'session_set', type };
      }
    }

    // Query-based (PKCE / code flow)
    const qIdx = url.indexOf('?');
    if (qIdx >= 0) {
      const params = new URLSearchParams(url.slice(qIdx + 1));
      const code = params.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) return { kind: 'error', message: error.message };
        return { kind: 'code_exchanged' };
      }
    }

    return { kind: 'ignored' };
  } catch (e: any) {
    return { kind: 'error', message: e?.message ?? 'Deep link handling failed' };
  }
}
