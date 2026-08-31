/**
 * Turn a raw Supabase/Postgres error into something worth showing a person.
 *
 * The thread's send path surfaced `err.message` directly. That was survivable
 * while the only realistic failure was a rate limit (whose message the DB
 * writes in plain English) -- but blocking is now actually enforced at the
 * messages INSERT policy, so a blocked sender's very next tap produced
 * "new row violates row-level security policy for table \"messages\"" in an
 * alert.
 *
 * The replacement deliberately does NOT say "you have been blocked". This
 * codebase already refuses to confirm a block elsewhere -- ListingDetail's
 * start-conversation failure uses generic copy with the comment "never echo
 * the RPC's reason (e.g. a block), which would reveal to a blocked user that
 * they're blocked" -- and that only holds if every path stays quiet.
 *
 * Messages raised deliberately by our own triggers and RPCs are already
 * written for humans ("This account is suspended."), so they pass through.
 */
export function friendlySendError(message: string | null | undefined): string {
  if (!message) return 'Please try again.';
  if (/row-level security|violates row-level/i.test(message)) {
    return "You can't send messages in this conversation.";
  }
  return message;
}
