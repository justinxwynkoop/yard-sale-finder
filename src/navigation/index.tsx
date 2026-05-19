import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../hooks/useAuth';
import {
  RootStackParamList,
  MainTabParamList,
  MapStackParamList,
  SaleStackParamList,
} from '../types';

import AuthScreen from '../screens/auth/AuthScreen';
import MapHomeScreen from '../screens/map/MapHomeScreen';
import SaleDetailScreen from '../screens/map/SaleDetailScreen';
import MySalesScreen from '../screens/sale/MySalesScreen';
import CreateSaleScreen from '../screens/sale/CreateSaleScreen';
import EditSaleScreen from '../screens/sale/EditSaleScreen';
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

export default function Navigation() {
  const { session, loading } = useAuth();

  if (loading) return null;

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <RootStack.Screen name="Main" component={MainTabs} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
