import { Share } from 'react-native';
import { Sale, Listing } from '../types';

/**
 * One place for all "share this" actions so every entry point shares the same
 * thing. Links are `https://trove.sale/sale/<id>` / `/listing/<id>` — tappable
 * for EVERYONE: recipients without the app land on trove.sale's "open in
 * Trove" page (site/open.html, Vercel rewrites /sale/:id + /listing/:id),
 * which offers the trove:// deep link into the app. Recipients with the app
 * who tap that button get routed by the navigation `linking` config. (The old
 * scheme-only `trove://` links were dead ends for anyone without the app.
 * One-tap open-the-app-directly — universal links — additionally needs an
 * apple-app-site-association file + associatedDomains entitlement, which
 * requires a new native build; the web landing page works for build 21.)
 */

const WEB_ORIGIN = 'https://trove.sale';

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
  const url = `${WEB_ORIGIN}/sale/${sale.id}`;
  const lines = [sale.title, opts?.where, url].filter(Boolean) as string[];
  return present(sale.title, lines.join('\n'));
}

export function shareListing(listing: Listing): Promise<void> {
  const url = `${WEB_ORIGIN}/listing/${listing.id}`;
  const price = `$${(listing.price ?? 0).toFixed(2)}`;
  const lines = [
    `${listing.title} — ${price}`,
    listing.pickup_display,
    url,
  ].filter(Boolean) as string[];
  return present(listing.title, lines.join('\n'));
}
