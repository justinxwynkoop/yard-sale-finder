/**
 * Schedule tiles for the sale detail stat strip.
 *
 * One tile per sale day with the date joined to the weekday ("Fri · Aug 28"),
 * so the reader never has to connect a bare weekday to a separate date range.
 * The current day reads "Today". Spans longer than three days collapse into a
 * single range tile ("Aug 28 – 31 · Daily") instead of one tile per day.
 *
 * Hours come in pre-formatted because the sale schema has a single
 * start_time/end_time — every day shares the same hours.
 */

export type ScheduleTile = { label: string; value: string };

const MAX_PER_DAY_TILES = 3;

export function saleScheduleTiles(
  startDateIso: string,
  endDateIso: string,
  hours: string,
  today: Date = new Date(),
): ScheduleTile[] {
  const start = parseLocalDate(startDateIso);
  const end = parseLocalDate(endDateIso);

  const dayCount =
    end < start ? 1 : Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;

  if (dayCount > MAX_PER_DAY_TILES) {
    return [{ label: `${rangeLabel(start, end)} · Daily`, value: hours }];
  }

  return Array.from({ length: dayCount }, (_, i) => {
    const day = addDays(start, i);
    const weekday = sameDate(day, today)
      ? 'Today'
      : day.toLocaleDateString('en-US', { weekday: 'short' });
    return { label: `${weekday} · ${monthDay(day)}`, value: hours };
  });
}

// -- internals -------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseLocalDate(iso: string): Date {
  // 'YYYY-MM-DD' parsed in LOCAL time (not UTC), matching utils/format.ts.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
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

function monthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function rangeLabel(start: Date, end: Date): string {
  const sameMonth =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  return sameMonth
    ? `${monthDay(start)} – ${end.getDate()}`
    : `${monthDay(start)} – ${monthDay(end)}`;
}
