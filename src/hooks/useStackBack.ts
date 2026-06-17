import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

/**
 * Stack-local back. Decides PURELY from the current native-stack's own
 * history — never a bare `navigation.goBack()` that bubbles UP to the Tab
 * navigator (whose default backBehavior 'firstRoute' would throw the user to
 * the Map/Discover tab when this screen is the LONE route of its stack).
 *
 * The lone-root state happens for real on deep-link / cold-start push
 * (e.g. a shared `trove://sale/<id>` builds the Map stack as just
 * [SaleDetail], with no MapHome beneath) and any other path that lands a
 * detail screen as a stack root.
 *
 * Behavior:
 * - A route sits beneath us in THIS stack  → goBack() (normal pop).
 * - We're the lone route                   → navigate to this stack's home
 *   (resolved WITHIN the current tab, so it never bubbles to the tabs).
 *
 * Pass the home route name of every stack this screen is registered in; the
 * first one present in the live `routeNames` wins, so the same screen works
 * in whichever stack hosts it.
 *
 * Also intercepts the ANDROID hardware back button (and is a no-op for the
 * normal case) so hardware back can't bubble to the tabs either — the
 * button-only fix would otherwise leave hardware back stranding on Android.
 */
export function useStackBack(...homeRouteNames: string[]) {
  const navigation = useNavigation<any>();

  const goBack = useCallback(() => {
    const state = navigation.getState?.();
    if (state && state.index > 0) {
      navigation.goBack();
      return;
    }
    const names: string[] = state?.routeNames ?? [];
    const home =
      homeRouteNames.find((n) => names.includes(n)) ?? homeRouteNames[0];
    if (home) navigation.navigate(home);
    else navigation.goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // Android hardware back: only intercept when we're the lone route (so the
  // event can't bubble to the Tab navigator). Otherwise let the native stack
  // pop normally.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        const state = navigation.getState?.();
        if (state && state.index > 0) return false; // normal pop
        goBack();
        return true; // consumed — don't bubble to the tabs
      });
      return () => sub.remove();
    }, [navigation, goBack]),
  );

  return goBack;
}
