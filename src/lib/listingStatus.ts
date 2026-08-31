import { supabase } from './supabase';
import { ListingStatus } from '../types';

/**
 * The single write path for a listing's status. Sold and available go through
 * RPCs because they must also clear the hold row atomically; there is no
 * client-side path that can do both, and two screens used to update `status`
 * inline (one of them would inevitably have stranded a hold).
 *
 * 'pending' is intentionally NOT settable here — an item goes on hold only by
 * accepting an offer, which is respond_to_offer's job.
 */
export async function setListingStatus(
  listingId: string,
  next: Exclude<ListingStatus, 'pending'>,
): Promise<{ error: string | null }> {
  const rpc = next === 'sold' ? 'mark_listing_sold' : 'release_hold';
  const { error } = await supabase.rpc(rpc, { p_listing_id: listingId });
  return { error: error ? error.message : null };
}
