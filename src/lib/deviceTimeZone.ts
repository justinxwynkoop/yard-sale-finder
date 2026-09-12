/**
 * The device's IANA time zone ("America/Indiana/Indianapolis"), or null.
 *
 * Recorded on a sale so the server can tell when "2 PM" has passed -- sale
 * times are wall-clock values with no zone, and end_past_sales() has no device
 * to ask. Read from Intl rather than expo-localization: that would be a new
 * native module, which means a dev-client rebuild and a runtimeVersion bump
 * for one string.
 *
 * Null rather than a guess on any doubt. The server judges a null zone on the
 * latest US zone, so an unknown zone makes a sale end LATE; a wrong zone could
 * end one EARLY, while people are still shopping. The server also nulls any
 * value Postgres cannot resolve.
 */
export function deviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // UTC is refused on purpose: the Android emulator ships set to it, and a
    // US sale recorded as UTC would end four to ten hours early.
    if (typeof tz !== 'string' || !tz.includes('/') || tz.startsWith('Etc/')) {
      return null;
    }
    return tz;
  } catch {
    return null;
  }
}
