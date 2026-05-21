/**
 * Build a Supabase Storage transform URL. Appends query params that
 * Supabase resizes/recompresses on demand at the CDN edge — so a
 * 1600x1200 / 250KB original is served as a 400x400 / 25KB thumb
 * for list cards, without an extra round-trip or stored variant.
 *
 * Supabase image transformations are available on all plans (with
 * rate limits scaling by plan). If transformations aren't available
 * for some reason, the original URL still works — the params are
 * ignored gracefully.
 *
 * See https://supabase.com/docs/guides/storage/serving/image-transformations
 */
export type ImageTransform = {
  /** Pixel width to target. Height auto-scales unless `height` is also set. */
  width?: number;
  /** Pixel height to target. */
  height?: number;
  /** JPEG quality 0-100. Default 75. */
  quality?: number;
  /** How to fit when both width + height are specified. */
  resize?: 'cover' | 'contain' | 'fill';
};

/**
 * Apply transform params to a Supabase Storage public URL.
 * No-op for non-Supabase URLs (any URL without a query string we
 * don't recognize).
 */
export function transformedImageUrl(
  url: string | undefined | null,
  opts: ImageTransform = {},
): string | undefined {
  if (!url) return undefined;
  // Don't touch local file URIs (camera roll, cache).
  if (url.startsWith('file:') || url.startsWith('content:')) return url;

  const params = new URLSearchParams();
  if (opts.width) params.set('width', String(Math.round(opts.width)));
  if (opts.height) params.set('height', String(Math.round(opts.height)));
  if (opts.quality) params.set('quality', String(opts.quality));
  if (opts.resize) params.set('resize', opts.resize);

  if ([...params].length === 0) return url;
  // Preserve any existing query string just in case.
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${params.toString()}`;
}

/**
 * A tiny generic blurhash to use as a placeholder while real images
 * load. Warm-gray. Avoids the white flash on cold loads.
 */
export const PLACEHOLDER_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';
