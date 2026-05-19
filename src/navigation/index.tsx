import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../hooks/useAuth';
import { useProfile, isProfileComplete } from '../hooks/useProfile';
import {
  RootStackParamList,
  MainTabParamList,
  MapStackParamList,
  SaleStackParamList,
} from '../types';

import AuthScreen from '../screens/auth/AuthScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import CheckEmailScreen from '../screens/auth/CheckEmailScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import CompleteProfileScreen from '../screens/auth/CompleteProfileScreen';
import MapHomeScreen from '../screens/map/MapHomeScreen';
import SaleDetailScreen from '../screens/map/SaleDetailScreen';
import MySalesScreen from '../screens/sale/MySalesScreen';
import CreateSaleScreen from '../screens/sale/CreateSaleScreen';
import EditSaleScreen from '../screens/sale/EditSaleScreen';
import CaptureSaleScreen from '../screens/sale/CaptureSaleScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const MapStack = createNativeStackNavigator<MapStackParamList>();
const SaleStack = createNativeStackNavigator<SaleStackParamList>();

const BRAND = '#F97316';
const INACTIVE = '#A1A1AA';

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
    </SaleStack.Navigator>
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
        tabBarStyle: {
          borderTopColor: '#F4F4F5',
          height: 64,
          paddingTop: 6,
          paddingBottom: 10,
        },
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
        name="Profile"
        component={ProfileScreen}
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
  const { profile, loading } = useProfile();

  if (loading) {
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

  if (!isProfileComplete(profile)) {
    return <CompleteProfileScreen />;
  }

  return <MainTabs />;
}

export default function Navigation() {
  const { session, loading, inRecovery } = useAuth();

  if (loading) return null;

  // Three top-level routing decisions:
  // 1) Active password-recovery session  -> ResetPasswordScreen
  // 2) Signed in                         -> MainGate (profile check then tabs)
  // 3) Signed out                        -> Auth stack
  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {inRecovery ? (
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
