import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { compressImage } from './imageCompression';

/**
 * Compress + upload a picked image to the `message-media` bucket and
 * return its public URL. Mirrors the sale/listing upload path: RN's
 * `fetch(uri).blob()` yields a 0-byte blob, so we read the file as an
 * ArrayBuffer via expo-file-system's File API and upload that.
 *
 * Path is `${userId}/${conversationId}/${unique}.jpg` so the storage
 * insert/delete RLS (folder[1] === auth.uid()) is satisfied.
 *
 * Returns the storage PATH (not a URL) — message-media is a private
 * bucket, so the path is stored in messages.image_url and the renderer
 * mints a short-lived signed URL (see signedMessageImage.ts).
 */
export async function uploadMessageImage(
  uri: string,
  userId: string,
  conversationId: string,
  unique: string,
): Promise<string> {
  const compressed = await compressImage(uri);
  const path = `${userId}/${conversationId}/${unique}.jpg`;

  const file = new File(compressed);
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from('message-media')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;

  return path;
}
