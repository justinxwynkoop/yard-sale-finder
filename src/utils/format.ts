/**
 * Friendly date formatter — special-cases the cases that read awkwardly:
 *
 *   today                       -> "Today"
 *   tomorrow                    -> "Tomorrow"
 *   yesterday                   -> "Yesterday"
 *   within the next 6 days      -> "Sat May 24"
 *   any other single day        -> "May 24"
 *   spans two days, both close  -> "Sat May 24 – Sun May 25"
 *   spans, far away             -> "May 24 – Jun 5"
 *   same month range            -> "May 24 – 27"
 *
 * Compares against the device's local "today" — not UTC — so a sale
 * that ends at 11:59 PM local time still reads as "Today" until midnight.
 */
export function formatSaleDate(
  startDateIso: string,
  endDateIso: string,
): string {
  const start = parseLocalDate(startDateIso);
  const end = parseLocalDate(endDateIso);
  const today = startOfToday();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  const sixDaysOut = addDays(today, 6);

  const sameDay = startDateIso === endDateIso;

  if (sameDay) {
    if (sameDate(start, today)) return 'Today';
    if (sameDate(start, tomorrow)) return 'Tomorrow';
    if (sameDate(start, yesterday)) return 'Yesterday';
    if (start <= sixDaysOut) {
      return start.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
    return start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  // Multi-day. Compact same-month form when both ends are in the same month.
  const sameMonth =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth();
  if (sameMonth) {
    const monthDay = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    return `${monthDay} – ${end.getDate()}`;
  }

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

/**
 * Friendly time-range formatter. Examples:
 *   "9 AM – 2 PM"
 *   "9:30 AM – 12 PM"
 *   "12 PM – 5:30 PM"
 *
 * Trims minute when it's :00 and omits leading zeros.
 */
export function formatSaleTime(startTime: string, endTime: string): string {
  return `${formatHM(startTime)} – ${formatHM(endTime)}`;
}

export function formatHM(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0
    ? `${hour} ${ampm}`
    : `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * "Today, 9 AM – 2 PM" / "Sat May 24, 8:30 AM – 1 PM" — the combined
 * line we show on cards and details. Single-day sales only render
 * date once; multi-day shows the range.
 */
export function formatSaleWhen(
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string,
): string {
  const date = formatSaleDate(startDate, endDate);
  const time = formatSaleTime(startTime, endTime);
  return `${date}, ${time}`;
}

/**
 * Human-friendly "when was this posted" label for listing detail screens.
 *   < 1 day  → "Posted today"
 *   1 day    → "Posted yesterday"
 *   2 days   → "Posted 2 days ago"
 *   3+ days  → "Posted May 2026"
 */
export function formatPostedDate(createdAt: string): string {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysDiff = Math.floor((Date.now() - new Date(createdAt).getTime()) / msPerDay);

  if (daysDiff === 0) return 'Posted today';
  if (daysDiff === 1) return 'Posted yesterday';
  if (daysDiff < 3) return `Posted ${daysDiff} days ago`;

  return `Posted ${new Date(createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })}`;
}

// -- internals -------------------------------------------------------

function parseLocalDate(iso: string): Date {
  // 'YYYY-MM-DD' parsed in LOCAL time (not UTC). Avoids the off-by-one
  // where `new Date('2026-05-21')` becomes May 20 in west-of-UTC zones.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
