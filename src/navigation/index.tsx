import React, { useState } from 'react';
import { View, ActivityIndicator, Image, Pressable, Text } from 'react-native';
import {
  NavigationContainer,
  LinkingOptions,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';

import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../hooks/useAuth';
import { useProfile, isProfileComplete, hasAcceptedTerms } from '../hooks/useProfile';
import { useOnboarding } from '../hooks/useOnboarding';
import { useInbox } from '../hooks/useInbox';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { navigationRef, navigateToConversation } from '../lib/navigationRef';
import {
  RootStackParamList,
  MainTabParamList,
  MapStackParamList,
  ListingsStackParamList,
  ProfileStackParamList,
  MessagesStackParamList,
} from '../types';

import WelcomeScreen from '../screens/auth/WelcomeScreen';
import AuthScreen from '../screens/auth/AuthScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
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
import SearchScreen from '../screens/search/SearchScreen';
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
import PublicProfileScreen from '../screens/profile/PublicProfileScreen';
import SavedListingsScreen from '../screens/listings/SavedListingsScreen';
import InboxScreen from '../screens/messages/InboxScreen';
import ConversationScreen from '../screens/messages/ConversationScreen';
import { PostMenu } from '../components/PostMenu';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const MapStack = createNativeStackNavigator<MapStackParamList>();
const ListingsStack = createNativeStackNavigator<ListingsStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const MessagesStack = createNativeStackNavigator<MessagesStackParamList>();

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
      <MapStack.Screen
        name="Search"
        component={SearchScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
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
      <ListingsStack.Screen
        name="Search"
        component={SearchScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
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
      <MessagesStack.Screen name="Conversation" component={ConversationScreen} />
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

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Tab.Screen requires a component reference even when we never render it
// (the Post tab intercepts the press and shows a sheet instead).
function PostPlaceholder() {
  return <View />;
}

function MainTabs() {
  const { profile } = useProfile();

  // Lifted to the navigator level so any tab can open the Post sheet.
  const [postMenuOpen, setPostMenuOpen] = useState(false);

  const handlePickSale = () => {
    // Jump to the Profile stack's CreateSale screen — it's registered there
    // so the user lands inside the same flow Profile→MySales pushes them into.
    navigationRef.navigate('Main' as any, {
      screen: 'Profile',
      params: { screen: 'CreateSale' },
    } as any);
  };

  const handlePickListing = () => {
    navigationRef.navigate('Main' as any, {
      screen: 'Profile',
      params: { screen: 'CreateListing' },
    } as any);
  };

  // Unread count drives the red badge on the Inbox tab icon.
  const { unreadCount } = useInbox();

  // Register device for push notifications and persist the token to
  // the user's profile. Runs once per sign-in, bails on simulators.
  usePushNotifications();

  // Handle notification taps → open the relevant conversation.
  // Two cases:
  //   Cold-start: app launched by tapping a notification while closed.
  //   Warm:       user taps a notification while app is backgrounded/active.
  useEffect(() => {
    // Cold-start: getLastNotificationResponseAsync returns the notification
    // that launched the app (or null if the user opened it normally).
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const id = response?.notification.request.content.data?.conversationId;
      if (id) navigateToConversation(id as string);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const id = response.notification.request.content.data?.conversationId;
      if (id) navigateToConversation(id as string);
    });
    return () => sub.remove();
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
      <Tab.Screen
        name="Map"
        component={MapNavigator}
        options={{ tabBarLabel: 'Discover' }}
      />
      <Tab.Screen
        name="Listings"
        component={ListingsNavigator}
        options={{ tabBarLabel: 'Listings' }}
      />
      <Tab.Screen
        name="Post"
        component={PostPlaceholder}
        options={{
          tabBarLabel: 'Post',
          tabBarButton: (props) => (
            <PostTabButton
              accessibilityState={props.accessibilityState}
              onPress={() => setPostMenuOpen(true)}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={MessagesNavigator}
        options={{ tabBarLabel: 'Inbox' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>

    <PostMenu
      visible={postMenuOpen}
      onClose={() => setPostMenuOpen(false)}
      onPickSale={handlePickSale}
      onPickListing={handlePickListing}
    />
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
  const { profile, loading: profileLoading } = useProfile();
  const { loading: onboardingLoading, completed: onboardingCompleted } =
    useOnboarding();

  // Only block on profileLoading before we have ANY profile (first load).
  // Once a profile exists, a background refetch must never swap MainTabs
  // for the spinner — that remount resets the tab navigator to Discover
  // and bounces the user out of whatever tab/stack they were in.
  if ((profileLoading && !profile) || onboardingLoading) {
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

  // Order of gates after sign-in:
  //   1) profile fields missing        -> CompleteProfileScreen
  //   2) terms not accepted            -> TermsScreen
  //   3) onboarding not yet seen       -> OnboardingScreen
  //   4) otherwise                     -> MainTabs
  // Gate 1 — collect name, birthdate (18+), and location
  if (!isProfileComplete(profile)) {
    return <CompleteProfileScreen />;
  }

  // Gate 2 — must accept Terms of Service before entering the app
  if (!hasAcceptedTerms(profile)) {
    return <TermsScreen />;
  }

  // Gate 3 — one-time welcome / onboarding slides
  if (!onboardingCompleted) {
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
// https://trove.app/sale/<id>) to the right screen + params. Used
// by the Share button on SaleDetail to generate URLs friends can tap
// to jump straight to that sale in-app.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'https://trove.app'],
  config: {
    screens: {
      Main: {
        screens: {
          Map: {
            screens: {
              MapHome: 'map',
              SaleDetail: 'sale/:saleId',
            },
          },
        },
      },
    },
  },
};

export default function Navigation() {
  const { session, loading, inRecovery } = useAuth();

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
          <RootStack.Screen name="Main" component={MainGate} />
        ) : (
          <>
            {/* Welcome is the signed-out landing; its CTAs push Auth in
                the matching mode. */}
            <RootStack.Screen name="Welcome" component={WelcomeScreen} />
            <RootStack.Screen name="Auth" component={AuthScreen} />
            <RootStack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
            />
            <RootStack.Screen name="CheckEmail" component={CheckEmailScreen} />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
