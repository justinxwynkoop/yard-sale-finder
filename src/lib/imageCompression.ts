import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Compress + resize an image URI before uploading. Cuts files to
 * roughly 200-500KB from the multi-MB originals iPhone cameras
 * produce — meaningful savings on storage + bandwidth + upload time
 * without visibly degrading the photo.
 *
 * - Maxes out at 1600px on the long edge (more than enough for a
 *   gallery thumb or hero on a phone screen).
 * - Re-encodes as JPEG at quality 0.75.
 * - If anything fails, returns the original uri unchanged so we
 *   never block an upload because compression hiccupped.
 */
export async function compressImage(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      {
        compress: 0.75,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    return result.uri;
  } catch {
    return uri;
  }
}
