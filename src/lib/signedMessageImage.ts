import { supabase } from './supabase';

/**
 * message-media is a PRIVATE bucket — message images are stored as a
 * storage path in messages.image_url and must be fetched via a signed
 * URL, which only a conversation participant can mint (storage RLS).
 *
 * We cache signed URLs per path (they're valid for a week, so a thread
 * never re-signs the same image twice in a session) and tolerate legacy
 * rows that stored a full public URL from the brief public-bucket window.
 */

const WEEK_SECONDS = 60 * 60 * 24 * 7;
const cache = new Map<string, { url: string; expiresAt: number }>();

/** Normalize a stored image_url value to a bucket-relative path. */
function toPath(stored: string): string {
  const marker = '/message-media/';
  const i = stored.indexOf(marker);
  if (i >= 0) {
    // Legacy full URL → strip everything up to and including the bucket
    // segment (and any ?query) to recover the object path.
    return stored.slice(i + marker.length).split('?')[0];
  }
  return stored;
}

export async function getSignedMessageImage(
  stored: string,
): Promise<string | null> {
  const path = toPath(stored);
  const hit = cache.get(path);
  // Re-sign a little before expiry so an open thread never shows a broken
  // image at the boundary.
  if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.url;

  const { data, error } = await supabase.storage
    .from('message-media')
    .createSignedUrl(path, WEEK_SECONDS);
  if (error || !data?.signedUrl) return null;

  cache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + WEEK_SECONDS * 1000,
  });
  return data.signedUrl;
}
