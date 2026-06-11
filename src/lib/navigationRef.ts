import {
  CommonActions,
  createNavigationContainerRef,
} from '@react-navigation/native';
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
 * Two dispatches, deliberately:
 * 1. Focus the Inbox tab (mounts InboxHome as the stack root, so the
 *    thread always has a back destination).
 * 2. A BARE navigate to Conversation, which the root can't handle and
 *    passes down to the now-focused Messages stack.
 *
 * We must NOT use the nested-screen form
 * `navigate('Main', { screen: 'Inbox', params: { screen: 'Conversation' }})`
 * — that stores `screen: 'Conversation'` as a persistent param on the
 * Inbox TAB route, and every later press of the Messages tab re-applies
 * it, bouncing the user back into the thread they already left (even
 * with popToTopOnBlur resetting the stack).
 */
export function navigateToConversation(
  conversationId: string,
  opts?: { initialDraft?: string },
) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main' as any, { screen: 'Inbox' } as any);
  navigationRef.dispatch(
    CommonActions.navigate({
      name: 'Conversation',
      params: { conversationId, initialDraft: opts?.initialDraft },
    }),
  );
}
