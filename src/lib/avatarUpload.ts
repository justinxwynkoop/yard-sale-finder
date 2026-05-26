import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';

const BUCKET = 'avatars';

/**
 * Uploads a user-chosen photo to the `avatars` storage bucket and
 * returns its public URL. Mirrors the sale-media upload pattern in
 * CreateSaleScreen — same bucket trust model, same ArrayBuffer-via-
 * expo-file-system trick (RN's fetch(uri).blob() returns 0-byte blobs).
 *
 * Resizes to a square-ish 512px target before upload so avatars stay
 * small (<100KB typical) regardless of the source photo.
 */
export async function uploadAvatar(
  userId: string,
  localUri: string,
): Promise<string> {
  const compressed = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 512 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );

  const file = new File(compressed.uri);
  const arrayBuffer = await file.arrayBuffer();

  // crypto.randomUUID isn't on RN's global; Math.random + timestamp is
  // good enough for a non-security-sensitive object name.
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const path = `${userId}/${filename}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return publicUrl;
}

/**
 * Best-effort delete of a previously uploaded avatar. Parses the path
 * out of the public URL (everything after `/avatars/`). Failures are
 * swallowed -- orphaned avatar files aren't user-visible and we don't
 * want a stale delete to block a successful replace/remove.
 */
export async function deleteAvatar(publicUrl: string): Promise<void> {
  try {
    const marker = `/${BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const path = publicUrl.slice(idx + marker.length);
    if (!path) return;
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}
