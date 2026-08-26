import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';

/**
 * A ref to the root NavigationContainer. Attach it to the
 * NavigationContainer via ref={navigationRef} so it can be used
 * to navigate from outside the React tree (e.g. push notification
 * tap handlers, which fire before the component tree is ready).
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Navigate to the Inbox tab and open a specific conversation.
 * Safe to call at any time — no-ops silently if the nav tree isn't
 * ready yet (which can happen on cold-start from a notification).
 *
 * Two dispatches: focus the Inbox tab (so InboxHome sits below the
 * thread, giving it a back destination), then open Conversation via the
 * nested-screen form — the only way to reach a screen inside the
 * Messages stack from the root container ref.
 *
 * The nested form leaves `screen: 'Conversation'` as a sticky param on
 * the Inbox TAB route, which would otherwise bounce the user back into
 * the thread every time they re-tap the Messages tab. ConversationScreen
 * clears that param on mount (see its effect) once the thread is open.
 */
export function navigateToConversation(
  conversationId: string,
  opts?: { initialDraft?: string },
) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main' as any, { screen: 'Inbox' } as any);
  navigationRef.navigate('Main' as any, {
    screen: 'Inbox',
    params: {
      screen: 'Conversation',
      // If the Messages stack hasn't mounted yet (cold start), the target
      // would otherwise BECOME the initial screen and back would exit the
      // app; initial: false puts InboxHome underneath instead.
      initial: false,
      params: { conversationId, initialDraft: opts?.initialDraft },
    },
  } as any);
}

/**
 * Open the Messages tab filtered to conversations with one person — the
 * "Message <name>" button on a public profile. Two-step navigation like
 * navigateToConversation: focus the tab, then deliver the filter params to
 * InboxHome. InboxScreen clears the params when the screen blurs, so the
 * filter doesn't stick to the tab.
 */
export function navigateToInboxWithPerson(userId: string, displayName: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main' as any, { screen: 'Inbox' } as any);
  navigationRef.navigate('Main' as any, {
    screen: 'Inbox',
    params: {
      screen: 'InboxHome',
      params: { filterUserId: userId, filterName: displayName },
    },
  } as any);
}

/**
 * Jump to the sign-in / sign-up screen from anywhere — used by guest-mode
 * gates when a browsing-only user taps an account-based action (save,
 * message, post, follow). Guests browse freely (App Review 5.1.1(v));
 * this is the door back into the account flow.
 */
export function navigateToAuth(mode: 'signin' | 'signup' = 'signup') {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Auth' as any, { mode } as any);
}

/**
 * Open a sale's detail on the Map tab — used by the "new sale from a host
 * you follow" push-notification tap. Focus the Map tab first so SaleDetail
 * has the map below it, then push the detail via the nested-screen form.
 */
export function navigateToSale(saleId: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main' as any, { screen: 'Map' } as any);
  navigationRef.navigate('Main' as any, {
    screen: 'Map',
    params: { screen: 'SaleDetail', initial: false, params: { saleId } },
  } as any);
}

/**
 * Open a neighborhood sale event on the Map tab — used by deep links
 * (trove://event/<slug>) and post-create navigation.
 */
export function navigateToEvent(params: { eventId?: string; slug?: string }) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main' as any, { screen: 'Map' } as any);
  navigationRef.navigate('Main' as any, {
    screen: 'Map',
    params: { screen: 'EventDetail', initial: false, params },
  } as any);
}

/**
 * Open an item listing's detail on the Listings tab — used by the "new item
 * from someone you follow" push-notification tap. Focus the Listings tab
 * first, then push the detail via the nested-screen form.
 */
export function navigateToListing(listingId: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main' as any, { screen: 'Listings' } as any);
  navigationRef.navigate('Main' as any, {
    screen: 'Listings',
    params: { screen: 'ListingDetail', initial: false, params: { listingId } },
  } as any);
}
