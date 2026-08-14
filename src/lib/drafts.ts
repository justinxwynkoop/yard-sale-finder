import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device-local drafts for the Create Sale / Create Listing forms.
 * ONE slot per form type; saving again overwrites. Drafts never leave
 * the device (spec: docs/superpowers/specs/2026-08-13-drafts-design.md),
 * which is why every surface that shows one says "on this device".
 */

export type DraftType = 'sale' | 'listing';

export interface Draft {
  v: 1;
  savedAt: string; // ISO timestamp
  fields: Record<string, unknown>;
  media: string[]; // local (or remote, for reposts-in-progress) URIs
}

const keyFor = (type: DraftType) => `trove:draft:${type}`;

// Serialize writes so a clearDraft issued after a saveDraft can never lose
// to the save's still-in-flight setItem (which would resurrect a draft the
// user just posted). Reads stay direct — screens load before they write.
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueueWrite<T>(op: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(op, op);
  writeQueue = next.catch(() => {});
  return next;
}

export async function saveDraft(
  type: DraftType,
  fields: Record<string, unknown>,
  media: string[],
): Promise<void> {
  const draft: Draft = { v: 1, savedAt: new Date().toISOString(), fields, media };
  await enqueueWrite(() =>
    AsyncStorage.setItem(keyFor(type), JSON.stringify(draft)),
  ).catch(() => {});
}

export async function loadDraft(type: DraftType): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(type));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 1 || typeof parsed.savedAt !== 'string') return null;
    return {
      v: 1,
      savedAt: parsed.savedAt,
      fields: parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {},
      media: Array.isArray(parsed.media)
        ? parsed.media.filter((u: unknown): u is string => typeof u === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export async function clearDraft(type: DraftType): Promise<void> {
  await enqueueWrite(() => AsyncStorage.removeItem(keyFor(type))).catch(() => {});
}

/**
 * A draft is worth keeping once the form has a title, a description, or at
 * least one photo — an empty tapped-into form never nags (spec).
 */
export function isMeaningful(input: {
  title?: string;
  description?: string;
  mediaCount: number;
}): boolean {
  return !!(input.title?.trim() || input.description?.trim() || input.mediaCount > 0);
}

/**
 * Relative age for draft rows: "just now", "5 min ago", "1 hour ago",
 * "yesterday", "3 days ago". `nowMs` is injectable for tests.
 */
export function draftAge(savedAtIso: string, nowMs: number = Date.now()): string {
  const ms = Math.max(0, nowMs - Date.parse(savedAtIso));
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * Draft media is stored as bare URIs; recover image/video from the
 * extension on restore so a drafted video isn't re-uploaded as a jpg.
 */
export function mediaTypeForUri(uri: string): 'image' | 'video' {
  return /\.(mp4|mov)$/i.test(uri) ? 'video' : 'image';
}
