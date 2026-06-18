import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import { Sale, Listing } from '../types';

/**
 * One place for all "share this" actions so every entry point shares the same
 * thing. Each builds a deep link via Linking.createURL — in a standalone build
 * that's `trove://sale/<id>` / `trove://listing/<id>`, which the navigation
 * `linking` config routes to the right detail screen. (A `https://trove.app`
 * link is NOT used: that domain isn't registered and there's no universal-link
 * config, so those links go nowhere. Truly universal share links — tappable
 * everywhere, with a preview + an install prompt for people who don't have the
 * app — need a real web domain; this is the best we can do app-to-app.)
 */

async function present(title: string, message: string): Promise<void> {
  try {
    // Link lives in `message` (not a separate `url`) so both platforms share
    // identical text — Android ignores the `url` field, which would otherwise
    // drop the link there.
    await Share.share({ title, message });
  } catch {
    /* user dismissed the sheet */
  }
}

export function shareSale(sale: Sale, opts?: { where?: string | null }): Promise<void> {
  const url = Linking.createURL(`sale/${sale.id}`);
  const lines = [sale.title, opts?.where, url].filter(Boolean) as string[];
  return present(sale.title, lines.join('\n'));
}

export function shareListing(listing: Listing): Promise<void> {
  const url = Linking.createURL(`listing/${listing.id}`);
  const price = `$${(listing.price ?? 0).toFixed(2)}`;
  const lines = [
    `${listing.title} — ${price}`,
    listing.pickup_display,
    url,
  ].filter(Boolean) as string[];
  return present(listing.title, lines.join('\n'));
}
