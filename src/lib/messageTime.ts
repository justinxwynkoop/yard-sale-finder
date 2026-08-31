import { Message } from '../types';

/**
 * Time and read-state rules for the conversation thread, in one place.
 * Pure and injectable-clock, like src/lib/offers.ts -- the thread UI and its
 * tests import the same functions so "what does Seen mean" has one answer.
 *
 * Note these take ISO datetimes, unlike utils/format.ts's formatHM, which
 * takes a bare "HH:MM" sale time. Different inputs, deliberately not shared.
 */

/** Local calendar day, as a comparable key. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Do two ISO timestamps fall on the same LOCAL calendar day? */
export function isSameLocalDay(a: string, b: string): boolean {
  return dayKey(new Date(a)) === dayKey(new Date(b));
}

/**
 * Clock time on a bubble, e.g. "3:42 PM".
 *
 * Always renders minutes -- unlike formatHM, which trims ":00" because a sale
 * runs "9 AM - 2 PM". A column of message times reading 3:42, 3:44, 4 would
 * look broken, so 4:00 PM stays 4:00 PM.
 */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const hour = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hour}:${min} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Day divider label: "Today", "Yesterday", "Wed, Aug 27", or "Aug 27, 2025"
 * once the year differs. Deliberately never a bare weekday ("Wednesday") --
 * that's ambiguous past a week old, and threads here go quiet for months
 * between a sale and a relist.
 */
export function formatDaySeparator(
  iso: string,
  now: Date = new Date(),
): string {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';

  return d.getFullYear() === now.getFullYear()
    ? d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
}

/**
 * Has the other participant read this message?
 *
 * `otherLastReadAt` is their conversations.{buyer,seller}_last_read_at, which
 * mark_conversation_read stamps when they OPEN the thread. So "Seen" means
 * "this was on screen for them", the same promise every other marketplace app
 * makes -- not "they read the words".
 *
 * Null means they have never opened it, which is not the same as "not seen
 * yet" being unknowable: a never-opened thread is definitively unseen.
 */
export function isSeenBy(
  message: Pick<Message, 'created_at'>,
  otherLastReadAt: string | null | undefined,
): boolean {
  if (!otherLastReadAt) return false;
  return (
    new Date(otherLastReadAt).getTime() >=
    new Date(message.created_at).getTime()
  );
}

/**
 * The id of the NEWEST message of mine the other party has read, or null.
 *
 * Only one "Seen" marker is rendered per thread -- under this message. Every
 * older message of mine is implicitly seen too, and stamping each one would
 * turn a quiet signal into a wall of them.
 *
 * Excludes optimistic bubbles (not on the server, so provably not seen) and
 * system rows: release_hold and mark_listing_sold write those with the
 * seller's own sender_id, and "Seen" under an automated notice reads as a
 * claim about a message the user never wrote.
 */
export function lastSeenOwnMessageId(
  messages: Message[],
  myId: string | null | undefined,
  otherLastReadAt: string | null | undefined,
): string | null {
  if (!myId || !otherLastReadAt) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender_id !== myId) continue;
    if (m.kind === 'system') continue;
    if (m.id.startsWith('optimistic-')) continue;
    if (isSeenBy(m, otherLastReadAt)) return m.id;
  }
  return null;
}
