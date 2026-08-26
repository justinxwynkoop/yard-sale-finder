import React, { useState , useEffect } from 'react';
import { View, ActivityIndicator, Image, Pressable, Text } from 'react-native';
import {
  NavigationContainer,
  LinkingOptions,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { Ionicons } from '@expo/vector-icons';

import * as Notifications from 'expo-notifications';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useOnboarding } from '../hooks/useOnboarding';
import { gateStep } from './gate';
import { useInbox } from '../hooks/useInbox';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useNearbyLocationSync } from '../hooks/useNearbyLocationSync';
import {
  navigationRef,
  navigateToConversation,
  navigateToSale,
  navigateToListing,
  navigateToEvent,
} from '../lib/navigationRef';
import { LINKING_CONFIG, contentRouteFromUrl } from './deepLinks';
import { track } from '../lib/analytics';
import { promptSignIn } from '../lib/guestGate';
import { GuestWelcomeSheet } from '../components/GuestWelcomeSheet';
import {
  RootStackParamList,
  MainTabParamList,
  MapStackParamList,
  ListingsStackParamList,
  ProfileStackParamList,
  MessagesStackParamList,
  PostStackParamList,
} from '../types';

import WelcomeScreen from '../screens/auth/WelcomeScreen';
import AuthScreen from '../screens/auth/AuthScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen';
import ResetPasswordCodeScreen from '../screens/auth/ResetPasswordCodeScreen';
import CheckEmailScreen from '../screens/auth/CheckEmailScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import CompleteProfileScreen from '../screens/auth/CompleteProfileScreen';
import TermsScreen from '../screens/auth/TermsScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import MapHomeScreen from '../screens/map/MapHomeScreen';
import SaleDetailScreen from '../screens/map/SaleDetailScreen';
import FilterSheet from '../screens/map/FilterSheet';
import RoutePlannerScreen from '../screens/route/RoutePlannerScreen';
import ActiveRouteScreen from '../screens/route/ActiveRouteScreen';
import ListingsFilterSheet from '../screens/listings/ListingsFilterSheet';
import MySalesScreen from '../screens/sale/MySalesScreen';
import CreateSaleScreen from '../screens/sale/CreateSaleScreen';
import EditSaleScreen from '../screens/sale/EditSaleScreen';
import CaptureSaleScreen from '../screens/sale/CaptureSaleScreen';
import CreateListingScreen from '../screens/listings/CreateListingScreen';
import EditListingScreen from '../screens/listings/EditListingScreen';
import ListingsScreen from '../screens/listings/ListingsScreen';
import ListingDetailScreen from '../screens/listings/ListingDetailScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import DeleteAccountScreen from '../screens/profile/DeleteAccountScreen';
import BlockedScreen from '../screens/profile/BlockedScreen';
import NotificationsScreen from '../screens/profile/NotificationsScreen';
import AccountScreen from '../screens/profile/AccountScreen';
import SavedScreen from '../screens/profile/SavedScreen';
import MySalesScreenV3 from '../screens/profile/MySalesScreen';
import MyListingsScreen from '../screens/profile/MyListingsScreen';
import MyEventsScreen from '../screens/profile/MyEventsScreen';
import PublicProfileScreen from '../screens/profile/PublicProfileScreen';
import FollowingScreen from '../screens/profile/FollowingScreen';
import SavedListingsScreen from '../screens/listings/SavedListingsScreen';
import InboxScreen from '../screens/messages/InboxScreen';
import ConversationScreen from '../screens/messages/ConversationScreen';
import CreateEventScreen from '../screens/events/CreateEventScreen';
import EventDetailScreen from '../screens/events/EventDetailScreen';
import { PostMenu } from '../components/PostMenu';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const MapStack = createNativeStackNavigator<MapStackParamList>();
const ListingsStack = createNativeStackNavigator<ListingsStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const MessagesStack = createNativeStackNavigator<MessagesStackParamList>();
const PostStack = createNativeStackNavigator<PostStackParamList>();

const BRAND = '#1F4D3A';
const INACTIVE = '#A1A1AA';

// Default tab bar style. Defined once so the per-tab `screenOptions`
// can return EXACTLY this object when not hiding the bar -- toggling
// to / from `undefined` causes a visible bounce as RN swaps the
// custom height for its smaller default.
const DEFAULT_TAB_BAR_STYLE = {
  borderTopColor: '#F4F4F5',
  height: 64,
  paddingTop: 6,
  paddingBottom: 10,
} as const;

// Stack routes that should hide the tab bar while focused (full-screen
// experiences -- conversations, capture, etc.). Keep in one place so
// the dynamic option below stays cheap.
const FULL_SCREEN_ROUTES = new Set(['Conversation', 'Capture']);

function hideTabBarOnFullScreen(route: any) {
  const focused = getFocusedRouteNameFromRoute(route) ?? '';
  if (FULL_SCREEN_ROUTES.has(focused)) {
    return { display: 'none' as const };
  }
  return DEFAULT_TAB_BAR_STYLE;
}

function MapNavigator() {
  return (
    <MapStack.Navigator screenOptions={{ headerShown: false }}>
      <MapStack.Screen name="MapHome" component={MapHomeScreen} />
      <MapStack.Screen
        name="SaleDetail"
        component={SaleDetailScreen}
        options={{ headerShown: false }}
      />
      <MapStack.Screen name="EventDetail" component={EventDetailScreen}
        options={{ headerShown: false }} />
      <MapStack.Screen
        name="FilterSheet"
        component={FilterSheet}
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <MapStack.Screen
        name="RoutePlanner"
        component={RoutePlannerScreen}
        options={{ headerShown: false }}
      />
      <MapStack.Screen
        name="ActiveRoute"
        component={ActiveRouteScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
      {/* Map search is now the inline area-search box on MapHome, so the
          old full-screen Search route is no longer registered here. The
          keyword Search lives on the Listings stack. */}
      <MapStack.Screen
        name="PublicProfile"
        component={PublicProfileScreen as any}
        options={{ headerShown: false }}
      />
    </MapStack.Navigator>
  );
}


function ListingsNavigator() {
  return (
    <ListingsStack.Navigator screenOptions={{ headerShown: false }}>
      <ListingsStack.Screen name="ListingsHome" component={ListingsScreen} />
      <ListingsStack.Screen name="ListingDetail" component={ListingDetailScreen} />
      {/* Create / Edit are also registered in ProfileStack so MySales can
          push them directly. Duplicating the registration here lets
          taps from the Listings tab open them within this stack --
          keeping the user in Listings instead of yanking them across
          tabs. Same screen components either way. */}
      <ListingsStack.Screen
        name="CreateListing"
        component={CreateListingScreen as any}
      />
      <ListingsStack.Screen
        name="EditListing"
        component={EditListingScreen as any}
      />
      <ListingsStack.Screen
        name="SavedListings"
        component={SavedListingsScreen}
        options={{ headerShown: false }}
      />
      <ListingsStack.Screen
        name="SaleDetail"
        component={SaleDetailScreen as any}
        options={{ headerShown: false }}
      />
      <ListingsStack.Screen name="EventDetail" component={EventDetailScreen}
        options={{ headerShown: false }} />
      <ListingsStack.Screen
        name="ListingsFilter"
        component={ListingsFilterSheet}
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <ListingsStack.Screen
        name="PublicProfile"
        component={PublicProfileScreen as any}
        options={{ headerShown: false }}
      />
    </ListingsStack.Navigator>
  );
}

function MessagesNavigator() {
  return (
    <MessagesStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        headerTintColor: '#18181B',
      }}
    >
      <MessagesStack.Screen
        name="InboxHome"
        component={InboxScreen}
        options={{ headerShown: false }}
      />
      <MessagesStack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={{ headerShown: false }}
      />
      <MessagesStack.Screen
        name="PublicProfile"
        component={PublicProfileScreen as any}
        options={{ headerShown: false }}
      />
    </MessagesStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        headerTintColor: '#18181B',
      }}
    >
      <ProfileStack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: false }}
      />
      {/* 'BlockedUsers' (legacy native-header screen) was removed — the
          live route is 'Blocked' (BlockedScreen, SubHeader). */}
      <ProfileStack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="MySalesHome"
        component={MySalesScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="CreateSale"
        component={CreateSaleScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="EditSale"
        component={EditSaleScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Capture"
        component={CaptureSaleScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
      <ProfileStack.Screen
        name="CreateListing"
        component={CreateListingScreen as any}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="EditListing"
        component={EditListingScreen as any}
        options={{ headerShown: false }}
      />
      {/* v3 Profile expansion — all push screens hide the default
          header because they ship their own SubHeader component. */}
      <ProfileStack.Screen
        name="MySales"
        component={MySalesScreenV3}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="MyListings"
        component={MyListingsScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="MyEvents"
        component={MyEventsScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Following"
        component={FollowingScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Saved"
        component={SavedScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Account"
        component={AccountScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Blocked"
        component={BlockedScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="PublicProfile"
        component={PublicProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="SaleDetail"
        component={SaleDetailScreen as any}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen as any}
        options={{ headerShown: false }}
      />
    </ProfileStack.Navigator>
  );
}

// Posting flow — presented modally OVER the tabs (see RootStack below).
// Routing Create through here (instead of into the Profile tab) avoids the
// tab-switch flash AND the "Create lingers in the Profile stack" bug.
// Capture lives inside so CreateSale's multi-shot camera still works.
function PostFlowNavigator() {
  return (
    <PostStack.Navigator screenOptions={{ headerShown: false }}>
      <PostStack.Screen name="CreateSale" component={CreateSaleScreen} />
      <PostStack.Screen
        name="CreateListing"
        component={CreateListingScreen as any}
      />
      <PostStack.Screen name="CreateEvent" component={CreateEventScreen} />
      <PostStack.Screen
        name="Capture"
        component={CaptureSaleScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
    </PostStack.Navigator>
  );
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Tab.Screen requires a component reference even when we never render it
// (the Post tab intercepts the press and shows a sheet instead).
function PostPlaceholder() {
  return <View />;
}

// Cold-start launch URLs must be replayed at most once per JS process:
// MainTabs remounts when a guest signs in (the RootStack swaps branches),
// and getInitialURL keeps returning the launch intent's URL for the life
// of the process — without this flag that remount would yank the user
// back into the deep-linked screen.
let coldStartUrlHandled = false;

function MainTabs() {
  const { user } = useAuth();
  const { profile } = useProfile();

  // One session-open event per MainTabs mount (guests included — their
  // user_id is null). Drives the Active-users tiles on the ops page.
  useEffect(() => {
    track('app_open');
  }, []);

  // Lifted to the navigator level so any tab can open the Post sheet.
  const [postMenuOpen, setPostMenuOpen] = useState(false);

  // Open Create in the PostFlow modal (over the tabs) — no tab switch, no
  // ProfileHome flash, and it can't linger in a tab stack.
  const handlePickSale = () => {
    navigationRef.navigate('PostFlow' as any, { screen: 'CreateSale' } as any);
  };

  const handlePickListing = () => {
    navigationRef.navigate('PostFlow' as any, {
      screen: 'CreateListing',
    } as any);
  };

  const handlePickEvent = () => {
    navigationRef.navigate('PostFlow' as any, { screen: 'CreateEvent' } as any);
  };

  // Unread count drives the red badge on the Inbox tab icon.
  const { unreadCount } = useInbox();

  // Register device for push notifications and persist the token to
  // the user's profile. Runs once per sign-in, bails on simulators.
  usePushNotifications();
  // Persist coarse location for "new sale near you" pushes (only while the
  // notify_sales_nearby toggle is on).
  useNearbyLocationSync();

  // Handle notification taps → open the relevant conversation.
  // Two cases:
  //   Cold-start: app launched by tapping a notification while closed.
  //   Warm:       user taps a notification while app is backgrounded/active.
  useEffect(() => {
    // Cold-start: getLastNotificationResponseAsync returns the notification
    // that launched the app (or null if the user opened it normally).
    const route = (data: any) => {
      if (data?.conversationId) navigateToConversation(data.conversationId as string);
      else if (data?.saleId) navigateToSale(data.saleId as string);
      else if (data?.listingId) navigateToListing(data.listingId as string);
    };
    Notifications.getLastNotificationResponseAsync().then((response) => {
      route(response?.notification.request.content.data);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      route(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);

  // Cold-start deep links (trove://sale/<id> etc. tapped while the app was
  // killed). React Navigation reads Linking.getInitialURL() the moment
  // NavigationContainer mounts — while auth is still resolving and the
  // RootStack registers ONLY the Loading screen — so the parsed state
  // pointed at unmounted routes and was dropped: the link opened the app to
  // MapHome. `linking.getInitialURL` (below) returns null to hand cold-start
  // URLs to this effect instead, which replays the URL once MainTabs — and
  // any profile/terms gate before it — has actually mounted. Warm links
  // still flow through React Navigation's own `url` event subscription.
  // Same replay pattern as the notification handler above.
  useEffect(() => {
    if (coldStartUrlHandled) return;
    coldStartUrlHandled = true;
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const target = contentRouteFromUrl(url);
      if (!target) return;
      if (target.name === 'SaleDetail') {
        navigateToSale(target.params?.saleId as string);
      } else if (target.name === 'EventDetail') {
        navigateToEvent({ slug: target.params?.slug as string });
      } else if (target.name === 'ListingDetail') {
        navigateToListing(target.params?.listingId as string);
      }
    });
  }, []);

  return (
    <>
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: INACTIVE,
        // Per-tab tabBarStyle: hide the bar when the focused nested
        // route is full-screen (e.g. Conversation), otherwise return
        // the same default object so React Navigation never sees a
        // structural style change and the tab bar doesn't bounce.
        tabBarStyle: hideTabBarOnFullScreen(route),
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, focused, size }) => {
          if (route.name === 'Profile') {
            if (profile?.avatar_url) {
              return (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={{
                    width: size ?? 24,
                    height: size ?? 24,
                    borderRadius: (size ?? 24) / 2,
                    borderWidth: focused ? 2 : 0,
                    borderColor: '#1F4D3A',
                  }}
                />
              );
            }
            const iconName: IoniconName = focused ? 'person-circle' : 'person-circle-outline';
            return <Ionicons name={iconName} size={size ?? 24} color={color} />;
          }

          if (route.name === 'Inbox') {
            const msgIcon: IoniconName = focused
              ? 'chatbubble-ellipses'
              : 'chatbubble-ellipses-outline';
            return (
              <View>
                <Ionicons name={msgIcon} size={size ?? 24} color={color} />
                {unreadCount > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -1,
                      right: -3,
                      width: 9,
                      height: 9,
                      borderRadius: 4.5,
                      backgroundColor: '#EF4444',
                      borderWidth: 1.5,
                      borderColor: '#FFFFFF',
                    }}
                  />
                )}
              </View>
            );
          }

          // Post tab handled below via tabBarButton — this branch is unreachable
          // for that route, but TypeScript prefers it covered.
          if (route.name === 'Post') return null;

          let iconName: IoniconName = 'ellipse-outline';
          if (route.name === 'Map') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'Listings') {
            iconName = focused ? 'storefront' : 'storefront-outline';
          }
          return <Ionicons name={iconName} size={size ?? 24} color={color} />;
        },
      })}
    >
      {/* popToTopOnBlur: leaving a tab resets its nested stack to the
          root, so returning to a tab shows its home (the list/map) rather
          than a stale detail screen you'd pushed earlier. */}
      <Tab.Screen
        name="Map"
        component={MapNavigator}
        options={{ tabBarLabel: 'Discover', popToTopOnBlur: true }}
      />
      <Tab.Screen
        name="Listings"
        component={ListingsNavigator}
        options={{ tabBarLabel: 'Listings', popToTopOnBlur: true }}
      />
      <Tab.Screen
        name="Post"
        component={PostPlaceholder}
        options={{
          tabBarLabel: 'Post',
          tabBarButton: (props) => (
            <PostTabButton
              accessibilityState={props.accessibilityState}
              onPress={() =>
                user
                  ? setPostMenuOpen(true)
                  : promptSignIn('post a yard sale or list an item')
              }
            />
          ),
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={MessagesNavigator}
        options={{ tabBarLabel: 'Inbox', popToTopOnBlur: true }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{ tabBarLabel: 'Profile', popToTopOnBlur: true }}
      />
    </Tab.Navigator>

    <PostMenu
      visible={postMenuOpen}
      onClose={() => setPostMenuOpen(false)}
      onPickSale={handlePickSale}
      onPickListing={handlePickListing}
      onPickEvent={handlePickEvent}
    />

    {/* First-launch orientation for guests: browse freely or create an
        account. One-time (AsyncStorage), fully dismissible — the guest
        path stays a tap away, as App Review requires. */}
    {!user && <GuestWelcomeSheet />}
    </>
  );
}

/**
 * Custom Tab.Screen button for the center "Post" tab — renders a raised
 * brand-bg rounded-rect with a white "+" instead of a normal tab icon.
 * On press, opens the PostMenu sheet rather than navigating.
 */
function PostTabButton({
  onPress,
  accessibilityState,
}: {
  onPress: () => void;
  accessibilityState?: { selected?: boolean };
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Post"
      accessibilityState={accessibilityState}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 4,
      }}
    >
      <View
        style={{
          width: 46,
          height: 36,
          borderRadius: 12,
          backgroundColor: BRAND,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: -2,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 5,
        }}
      >
        <Ionicons name="add" size={22} color="#fff" />
      </View>
      <Text
        style={{
          marginTop: 4,
          fontSize: 11,
          fontWeight: '600',
          color: INACTIVE,
        }}
      >
        Post
      </Text>
    </Pressable>
  );
}

/**
 * Once the user is signed in, we still need to make sure they have a
 * profile row with a display name. If not, force them through
 * CompleteProfile before they can touch the app. The check waits until
 * the profile fetch settles so we don't flicker between screens.
 */
function MainGate() {
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { completed: onboardingDone, loading: onboardingLoading } =
    useOnboarding();

  // Only block on profileLoading before we have ANY profile (first load).
  // Once a profile exists, a background refetch must never swap MainTabs
  // for the spinner — that remount resets the tab navigator to Discover
  // and bounces the user out of whatever tab/stack they were in. Also wait
  // for the onboarding flag to load so we don't flash MainTabs then jump
  // to the onboarding slides.
  // Guests skip every profile gate — browsing must work without an account
  // (App Review 5.1.1(v)). Account-based actions are gated at their call
  // sites via promptSignIn (src/lib/guestGate.ts).
  const isGuest = !user;

  // Decision logic is pure and unit-tested in ./gate — keep ordering
  // changes there, not inline here.
  const step = gateStep({
    isGuest,
    profile,
    profileLoading,
    onboardingDone,
    onboardingLoading,
  });
  const booting = step === 'booting';

  // Which screen this gate will render once boot settles. The native splash
  // stays up through the whole decision: gate screens hide it here the moment
  // they render, but the MainTabs path (signed-in OR guest) delegates hiding
  // to MapHomeScreen, which drops it only once the map is actually presentable
  // (region resolved + native map initialized). Otherwise cold start flashes
  // the map screen's loading placeholder: splash → spinner → map. hideAsync is
  // idempotent with Navigation's recovery-path hide and App's safety timeout.
  const destination = booting ? null : step === 'tabs' ? 'tabs' : 'gate';

  useEffect(() => {
    if (destination === 'gate') SplashScreen.hideAsync().catch(() => {});
  }, [destination]);

  if (isGuest) {
    return <MainTabs />;
  }

  if (booting) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
        }}
      >
        <ActivityIndicator size="large" color="#1F4D3A" />
      </View>
    );
  }

  // Order of gates after sign-in (decided by gateStep, tested in gate.ts):
  //   1) profile fields missing -> CompleteProfileScreen
  //   2) terms not accepted     -> TermsScreen
  //   3) onboarding not seen     -> OnboardingScreen (one-time slides)
  //   4) otherwise              -> MainTabs
  // Gate 1 — collect name, birthdate (18+), and location
  if (step === 'complete_profile') {
    return <CompleteProfileScreen />;
  }

  // Gate 2 — must accept Terms of Service before entering the app
  if (step === 'terms') {
    return <TermsScreen />;
  }

  // Gate 3 — one-time welcome slides, right after they finish setup
  if (step === 'onboarding') {
    return <OnboardingScreen />;
  }

  return <MainTabs />;
}

function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
      }}
    >
      <ActivityIndicator size="large" color="#1F4D3A" />
    </View>
  );
}

// Deep-link config: maps incoming URLs (trove://sale/<id>,
// https://trove.sale/sale/<id>) to the right screen + params. Share links
// (src/lib/share.ts) are https://trove.sale/... — recipients without the app
// land on the trove.sale "open in Trove" page, whose button fires the
// trove:// scheme handled here. The route table lives in ./deepLinks so the
// cold-start replay (MainTabs effect) matches against the same config.
//
// getInitialURL returns null ON PURPOSE: at container-mount time auth is
// still resolving, the RootStack only registers the Loading screen, and
// React Navigation would parse the launch URL into state for routes that
// don't exist yet — then silently drop it. Cold-start URLs are instead
// replayed by the MainTabs effect once the real tree is up; warm links keep
// using React Navigation's default `url` event subscription.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'https://trove.sale'],
  getInitialURL: () => null,
  config: LINKING_CONFIG,
};

export default function Navigation() {
  const { session, loading, inRecovery } = useAuth();

  // Hide the native splash once the recovery screen is up — it's ready the
  // moment auth settles. Every other path (signed-in AND guest) now flows
  // through MainGate → MainTabs, where MapHomeScreen drops the splash once
  // the map is actually presentable, so the splash covers the whole
  // cold-start chain with no spinner flashes. While `loading` is true the
  // splash stays up over the Loading screen.
  useEffect(() => {
    if (!loading && inRecovery) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading, inRecovery]);

  // NavigationContainer is mounted unconditionally. While auth is
  // still resolving we render a Loading screen INSIDE the navigator
  // instead of returning null — that way useNavigation / useRoute
  // hooks anywhere in the tree never see an empty context.
  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {loading ? (
          <RootStack.Screen name="Loading" component={LoadingScreen} />
        ) : inRecovery ? (
          <RootStack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
          />
        ) : session ? (
          <>
            <RootStack.Screen name="Main" component={MainGate} />
            <RootStack.Screen
              name="PostFlow"
              component={PostFlowNavigator}
              options={{ presentation: 'modal' }}
            />
          </>
        ) : (
          <>
            {/* Guests land straight in the app and browse freely (App Review
                5.1.1(v) forbids a login wall for non-account features).
                MainGate renders MainTabs in guest mode; the auth screens stay
                registered below so account-gated actions can open the sign-in
                flow (guestGate.promptSignIn → navigateToAuth). */}
            <RootStack.Screen name="Main" component={MainGate} />
            <RootStack.Screen name="Welcome" component={WelcomeScreen} />
            <RootStack.Screen
              name="Auth"
              component={AuthScreen}
              options={{ presentation: 'modal' }}
            />
            <RootStack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
            />
            <RootStack.Screen
              name="ResetPasswordCode"
              component={ResetPasswordCodeScreen}
            />
            <RootStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
            <RootStack.Screen name="CheckEmail" component={CheckEmailScreen} />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
