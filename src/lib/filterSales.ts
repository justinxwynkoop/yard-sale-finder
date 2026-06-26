import { Sale } from '../types';
import { MapFilters, WhenFilter } from './mapFilters';
import { isOpenNow } from '../utils/saleStatus';

function isoDate(d: Date): string {
  // LOCAL date components, not toISOString() (UTC) — otherwise a user west of
  // UTC in the evening gets tomorrow's date, shifting the "today"/"this
  // weekend" filters by a day. Matches saleStatus.todayString().
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * [Saturday, Sunday] ISO dates for this weekend (weeksAhead = 0) or next
 * weekend (weeksAhead = 1). If today is Sunday, "this weekend" is the
 * Sat–Sun pair that includes today.
 */
function weekendRange(weeksAhead: number): [string, string] {
  const now = new Date();
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const sat = new Date(now);
  if (day === 0) {
    sat.setDate(now.getDate() - 1 + weeksAhead * 7); // Sunday → yesterday's Sat
  } else {
    sat.setDate(now.getDate() + (6 - day) + weeksAhead * 7);
  }
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return [isoDate(sat), isoDate(sun)];
}

function matchesWhen(sale: Sale, when: NonNullable<WhenFilter>): boolean {
  if (when === 'today') {
    const t = isoDate(new Date());
    return sale.start_date <= t && sale.end_date >= t;
  }
  // 'weekend' | 'next_weekend' — the sale's date range overlaps the weekend.
  const [sat, sun] = weekendRange(when === 'next_weekend' ? 1 : 0);
  return sale.start_date <= sun && sale.end_date >= sat;
}

/**
 * Single source of truth for "does this sale match the active *attribute*
 * filters?" (open now, categories, vibe, when), shared by the Map list and
 * the FilterSheet preview so the two can't disagree.
 *
 * Spatial scoping is handled separately by the map viewport (regionContains
 * in lib/viewport) and `savedOnly` by the caller (it needs per-user state).
 */
export function saleMatchesFilters(sale: Sale, f: MapFilters): boolean {
  if (f.openNow && !isOpenNow(sale)) return false;
  if (
    f.categories.length > 0 &&
    !sale.categories.some((c) => f.categories.includes(c))
  )
    return false;
  if (
    f.vibeTags.length > 0 &&
    !(sale.vibe_tags ?? []).some((v) => f.vibeTags.includes(v as never))
  )
    return false;
  if (f.when && !matchesWhen(sale, f.when)) return false;
  return true;
}
