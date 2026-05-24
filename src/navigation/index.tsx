import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import {
  NavigationContainer,
  LinkingOptions,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../hooks/useAuth';
import { useProfile, isProfileComplete } from '../hooks/useProfile';
import { useOnboarding } from '../hooks/useOnboarding';
import {
  RootStackParamList,
  MainTabParamList,
  MapStackParamList,
  SaleStackParamList,
  ListingsStackParamList,
  ProfileStackParamList,
  MessagesStackParamList,
} from '../types';

import AuthScreen from '../screens/auth/AuthScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import CheckEmailScreen from '../screens/auth/CheckEmailScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import CompleteProfileScreen from '../screens/auth/CompleteProfileScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import MapHomeScreen from '../screens/map/MapHomeScreen';
import SaleDetailScreen from '../screens/map/SaleDetailScreen';
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
import BlockedUsersScreen from '../screens/profile/BlockedUsersScreen';
import SavedHomeScreen from '../screens/saved/SavedHomeScreen';
import InboxScreen from '../screens/messages/InboxScreen';
import ConversationScreen from '../screens/messages/ConversationScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const MapStack = createNativeStackNavigator<MapStackParamList>();
const SaleStack = createNativeStackNavigator<SaleStackParamList>();
const ListingsStack = createNativeStackNavigator<ListingsStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const MessagesStack = createNativeStackNavigator<MessagesStackParamList>();

const BRAND = '#F97316';
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
    </MapStack.Navigator>
  );
}

function SaleNavigator() {
  return (
    <SaleStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        headerTintColor: '#18181B',
      }}
    >
      <SaleStack.Screen
        name="MySalesHome"
        component={MySalesScreen}
        options={{ headerShown: false }}
      />
      <SaleStack.Screen
        name="CreateSale"
        component={CreateSaleScreen}
        options={{ headerShown: false }}
      />
      <SaleStack.Screen
        name="EditSale"
        component={EditSaleScreen}
        options={{ title: 'Edit Sale', headerBackTitle: 'Back' }}
      />
      <SaleStack.Screen
        name="Capture"
        component={CaptureSaleScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
      <SaleStack.Screen
        name="CreateListing"
        component={CreateListingScreen}
        options={{ headerShown: false }}
      />
      <SaleStack.Screen
        name="EditListing"
        component={EditListingScreen}
        options={{ title: 'Edit Listing', headerBackTitle: 'Back' }}
      />
    </SaleStack.Navigator>
  );
}

function ListingsNavigator() {
  return (
    <ListingsStack.Navigator screenOptions={{ headerShown: false }}>
      <ListingsStack.Screen name="ListingsHome" component={ListingsScreen} />
      <ListingsStack.Screen name="ListingDetail" component={ListingDetailScreen} />
      {/* Create / Edit are also registered in SaleStack so MySales can
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
      {/* Saved sales: previously a dedicated bottom tab. Now lives
          here as a pushed route, reached via the heart icon in the
          Listings header. SaleDetail registered alongside it so
          tapping a saved-sale card stays in the Listings tab. */}
      <ListingsStack.Screen
        name="SavedHome"
        component={SavedHomeScreen}
        options={{
          headerShown: true,
          title: 'Saved Sales',
          headerStyle: { backgroundColor: '#fff' },
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          headerShadowVisible: false,
          headerTintColor: '#18181B',
          headerBackTitle: 'Back',
        }}
      />
      <ListingsStack.Screen
        name="SaleDetail"
        component={SaleDetailScreen as any}
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
        headerBackTitle: 'Back',
      }}
    >
      <MessagesStack.Screen
        name="Inbox"
        component={InboxScreen}
        options={{ title: 'Messages' }}
      />
      <MessagesStack.Screen name="Conversation" component={ConversationScreen} />
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
        headerBackTitle: 'Back',
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
        options={{ title: 'Edit Profile' }}
      />
      <ProfileStack.Screen
        name="BlockedUsers"
        component={BlockedUsersScreen}
        options={{ title: 'Blocked Users' }}
      />
      <ProfileStack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: 'Delete Account' }}
      />
    </ProfileStack.Navigator>
  );
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function MainTabs() {
  return (
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
          let iconName: IoniconName = 'ellipse-outline';
          if (route.name === 'Map') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'MySales') {
            iconName = focused ? 'pricetag' : 'pricetag-outline';
          } else if (route.name === 'Listings') {
            iconName = focused ? 'storefront' : 'storefront-outline';
          } else if (route.name === 'Messages') {
            iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person-circle' : 'person-circle-outline';
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
        name="MySales"
        component={SaleNavigator}
        options={{ tabBarLabel: 'My Sales' }}
      />
      <Tab.Screen
        name="Listings"
        component={ListingsNavigator}
        options={{ tabBarLabel: 'Listings' }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesNavigator}
        options={{ tabBarLabel: 'Messages' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
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

  if (profileLoading || onboardingLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
        }}
      >
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  // Order of gates after sign-in:
  //   1) profile.display_name missing  -> CompleteProfileScreen
  //   2) onboarding not yet seen       -> OnboardingScreen
  //   3) otherwise                     -> MainTabs
  if (!isProfileComplete(profile)) {
    return <CompleteProfileScreen />;
  }

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
      <ActivityIndicator size="large" color="#F97316" />
    </View>
  );
}

// Deep-link config: maps incoming URLs (yardsalefinder://sale/<id>,
// https://locahauls.app/sale/<id>) to the right screen + params. Used
// by the Share button on SaleDetail to generate URLs friends can tap
// to jump straight to that sale in-app.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'https://localhauls.app'],
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
    <NavigationContainer linking={linking}>
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
