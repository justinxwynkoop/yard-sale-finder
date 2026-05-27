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
 * Navigate to the Messages tab and open a specific conversation.
 * Safe to call at any time — queued silently if the nav tree isn't
 * ready yet (which can happen on cold-start from a notification).
 */
export function navigateToConversation(conversationId: string) {
  if (!navigationRef.isReady()) return;
  // Navigate to the 'Main' screen (already rendered), then drill into
  // the Messages tab and the Conversation screen within it.
  navigationRef.navigate('Main' as any, {
    screen: 'Messages',
    params: {
      screen: 'Conversation',
      params: { conversationId },
    },
  } as any);
}
