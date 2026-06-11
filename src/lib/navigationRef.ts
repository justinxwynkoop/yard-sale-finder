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
      params: { conversationId, initialDraft: opts?.initialDraft },
    },
  } as any);
}
