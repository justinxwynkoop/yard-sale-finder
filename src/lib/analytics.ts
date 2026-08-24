import { supabase } from './supabase';

/**
 * Minimal self-hosted product analytics: fire-and-forget inserts into the
 * `events` table (insert-only RLS; only the ops API can read them back).
 * Answers activation/retention questions the ops row-counts can't — do
 * signups post, view, message, come back?
 *
 * Rules of the road:
 * - track() must NEVER throw or slow the UI: errors are swallowed, the
 *   insert is not awaited by callers.
 * - Event names are a small fixed vocabulary (see EventName) so the ops
 *   aggregates stay meaningful — don't invent ad-hoc names at call sites.
 * - Props are small identifiers/flags only, never user-typed text.
 */
export type EventName =
  | 'app_open'
  | 'profile_completed'
  | 'sale_posted'
  | 'listing_posted'
  | 'sale_viewed'
  | 'listing_viewed'
  | 'conversation_started'
  | 'message_sent';

export function track(name: EventName, props: Record<string, unknown> = {}): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      await supabase.from('events').insert({
        name,
        props,
        user_id: data.session?.user?.id ?? null,
      });
    } catch {
      // Analytics must never break the app.
    }
  })();
}
