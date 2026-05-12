import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { RootStackParamList, MainTabParamList, MapStackParamList, SaleStackParamList } from '../types';

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

function MapNavigator() {
  return (
    <MapStack.Navigator screenOptions={{ headerShown: false }}>
      <MapStack.Screen name="MapHome" component={MapHomeScreen} />
      <MapStack.Screen
        name="SaleDetail"
        component={SaleDetailScreen}
        options={{ headerShown: true, title: 'Sale Details', headerBackTitle: 'Map' }}
      />
    </MapStack.Navigator>
  );
}

function SaleNavigator() {
  return (
    <SaleStack.Navigator>
      <SaleStack.Screen name="MySalesHome" component={MySalesScreen} options={{ headerShown: false }} />
      <SaleStack.Screen name="CreateSale" component={CreateSaleScreen} options={{ title: 'Post a Sale', headerBackTitle: 'My Sales' }} />
      <SaleStack.Screen name="EditSale" component={EditSaleScreen} options={{ title: 'Edit Sale', headerBackTitle: 'My Sales' }} />
    </SaleStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { borderTopColor: '#F3F4F6' },
      }}
    >
      <Tab.Screen
        name="Map"
        component={MapNavigator}
        options={{ tabBarLabel: 'Discover', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🗺️</Text> }}
      />
      <Tab.Screen
        name="MySales"
        component={SaleNavigator}
        options={{ tabBarLabel: 'My Sales', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏷️</Text> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text> }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { session, loading } = useAuth();

  if (loading) return null;

  // TODO: remove this bypass when OAuth is working
  const DEV_BYPASS_AUTH = true;

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {(session || DEV_BYPASS_AUTH) ? (
          <RootStack.Screen name="Main" component={MainTabs} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
