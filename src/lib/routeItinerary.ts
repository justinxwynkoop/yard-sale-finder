import { Sale } from '../types';
import { haversineMeters } from '../utils/distance';

/**
 * Route-planner itinerary math.
 *
 * Two timelines are computed per ordered list of stops:
 * - arrival = clock when you pull up to the stop
 * - depart  = arrival + browse time
 *
 * Each leg adds a drive estimate. The drive estimate is intentionally
 * approximate — until a Directions API is wired, we use straight-line
 * distance @ a flat average speed. The README labels this fact to the
 * user, so the constant is exposed for that copy.
 */

/** Average speed used for drive-time estimates, in mph. */
export const AVG_MPH = 30;
/** Default browse time per stop, in minutes. */
export const DEFAULT_BROWSE_MIN = 25;
/** Mininum estimated drive time so even an "across the street" hop is shown. */
const MIN_DRIVE_MIN = 3;

export type Stop = {
  sale: Sale;
  /** Minutes from midnight when you arrive. */
  arrival: number;
  /** Minutes from midnight when you leave. */
  depart: number;
  /** Sale's closing time in minutes from midnight (parsed from end_time). */
  closeMin: number;
  /** True if arrival > close. */
  missed: boolean;
  /** Minutes spent browsing at this stop. */
  browse: number;
  /** Estimated drive minutes from previous stop (or from start for i=0). */
  driveFromPrev: number;
};

/** Parse a "HH:MM:SS" time string to minutes-from-midnight. */
export function parseTimeToMinutes(time: string | undefined | null): number {
  if (!time) return 23 * 60 + 59; // unknown → end of day so nothing flags missed
  const parts = time.split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

/** Format minutes-from-midnight as 8:45a / 12:00p / 4:30p. */
export function fmtTime(min: number): string {
  let h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  const ap = h >= 12 ? 'p' : 'a';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')}${ap}`;
}

/** Now, expressed as minutes-from-midnight, rounded up to the next 5 min. */
export function nowMinutes(): number {
  const d = new Date();
  const raw = d.getHours() * 60 + d.getMinutes();
  return Math.ceil(raw / 5) * 5;
}

/**
 * Estimate drive time between two coordinates, in minutes.
 * Straight-line haversine × 1.3 detour factor, divided by AVG_MPH,
 * clamped to MIN_DRIVE_MIN.
 */
export function estimateDriveMinutes(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const meters = haversineMeters(fromLat, fromLng, toLat, toLng);
  const miles = (meters / 1609.34) * 1.3; // detour factor
  const minutes = (miles / AVG_MPH) * 60;
  return Math.max(MIN_DRIVE_MIN, Math.round(minutes));
}

export interface ItineraryOptions {
  /** Minute-from-midnight you start. Defaults to now. */
  startMin?: number;
  /** Where the route starts from. Defaults to the first stop's location. */
  startLat?: number;
  startLng?: number;
  /** Browse minutes per stop. Defaults to DEFAULT_BROWSE_MIN. */
  browseMin?: number;
}

/**
 * Compute the timeline for an ordered list of sales.
 * Each stop carries its arrival/depart/missed flag for the UI.
 */
export function computeItinerary(
  order: Sale[],
  opts: ItineraryOptions = {},
): Stop[] {
  const startMin = opts.startMin ?? nowMinutes();
  const browseMin = opts.browseMin ?? DEFAULT_BROWSE_MIN;
  let clock = startMin;
  let prevLat = opts.startLat ?? order[0]?.latitude ?? 0;
  let prevLng = opts.startLng ?? order[0]?.longitude ?? 0;

  return order.map((sale, i) => {
    const drive =
      i === 0 && opts.startLat == null
        ? 0
        : estimateDriveMinutes(prevLat, prevLng, sale.latitude, sale.longitude);
    clock += drive;
    const arrival = clock;
    const closeMin = parseTimeToMinutes(sale.end_time);
    const missed = arrival > closeMin;
    clock += browseMin;
    prevLat = sale.latitude;
    prevLng = sale.longitude;
    return {
      sale,
      arrival,
      depart: clock,
      closeMin,
      missed,
      browse: browseMin,
      driveFromPrev: drive,
    };
  });
}

/**
 * "Best loop" ordering — nearest-neighbour from the starting location.
 * Fast, deterministic, no API calls. Good enough until we wire a real
 * traveling-salesman solver via the Directions API.
 */
export function orderByBestLoop(
  sales: Sale[],
  startLat?: number,
  startLng?: number,
): Sale[] {
  if (sales.length <= 1) return [...sales];
  const remaining = [...sales];
  const result: Sale[] = [];
  let curLat = startLat ?? remaining[0].latitude;
  let curLng = startLng ?? remaining[0].longitude;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(
        curLat,
        curLng,
        remaining[i].latitude,
        remaining[i].longitude,
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const picked = remaining.splice(bestIdx, 1)[0];
    result.push(picked);
    curLat = picked.latitude;
    curLng = picked.longitude;
  }
  return result;
}

/**
 * "Closing soonest" ordering — visit the earliest-closing sales first,
 * regardless of geography. Drives up if you'd otherwise miss them.
 */
export function orderByClosingSoonest(sales: Sale[]): Sale[] {
  return [...sales].sort(
    (a, b) => parseTimeToMinutes(a.end_time) - parseTimeToMinutes(b.end_time),
  );
}

/**
 * Bounding region that fits a list of coordinates with a comfortable
 * padding. Use this to fit a MapView to the entire route polyline.
 */
export function regionForCoords(
  coords: { latitude: number; longitude: number }[],
  paddingFactor = 1.5,
): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} | null {
  if (coords.length === 0) return null;
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;
  for (const c of coords) {
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLng) minLng = c.longitude;
    if (c.longitude > maxLng) maxLng = c.longitude;
  }
  const latDelta = Math.max((maxLat - minLat) * paddingFactor, 0.01);
  const lngDelta = Math.max((maxLng - minLng) * paddingFactor, 0.01);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}
