import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../types';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const HAIRLINE = '#E5DECC';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;

const BULLETS: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}[] = [
  { icon: 'map-outline', label: 'Sales near you on a live map' },
  { icon: 'pricetag-outline', label: 'Buy and sell individual items' },
  { icon: 'add', label: 'Post your own sale in minutes' },
];

/**
 * Signed-out landing / first run. The Trove wordmark + illustration over
 * warm bone, a value headline, three benefit rows, and the two entry
 * CTAs. "Create account" / "I already have an account" push the Auth
 * screen in the matching mode.
 *
 * The wordmark uses FIXED pixel dimensions (not aspectRatio/%) so it can't
 * balloon and push the headline/bullets off-screen.
 */
export default function WelcomeScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }}>
      {/* Brand + value props */}
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        <Image
          source={require('../../../assets/trove-wordmark-transparent.png')}
          style={{ width: 224, height: 150 }}
          resizeMode="contain"
        />
        <Text
          style={{
            fontSize: 22,
            fontWeight: '800',
            color: INK,
            letterSpacing: -0.5,
            textAlign: 'center',
            marginTop: 12,
            lineHeight: 26,
          }}
        >
          The good stuff is{'\n'}right around the corner.
        </Text>
        <Text
          style={{
            fontSize: 13.5,
            color: INK_SOFT,
            textAlign: 'center',
            marginTop: 8,
            lineHeight: 20,
          }}
        >
          Yard sales, estate sales, and individual items — mapped across your
          neighborhood.
        </Text>

        {/* Value bullets */}
        <View style={{ marginTop: 28, alignSelf: 'stretch', gap: 14 }}>
          {BULLETS.map((b) => (
            <View
              key={b.label}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  backgroundColor: BRAND_SOFT,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={b.icon} size={18} color={BRAND} />
              </View>
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: INK }}>
                {b.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* CTAs — pinned at the bottom */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 36 }}>
        <Pressable
          onPress={() => navigation.navigate('Auth', { mode: 'signup' })}
          style={{
            paddingVertical: 15,
            borderRadius: 14,
            alignItems: 'center',
            backgroundColor: BRAND,
          }}
          accessibilityRole="button"
          accessibilityLabel="Create account"
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
            Create account
          </Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Auth', { mode: 'signin' })}
          style={{
            marginTop: 10,
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: 'center',
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: HAIRLINE,
          }}
          accessibilityRole="button"
          accessibilityLabel="I already have an account"
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: INK }}>
            I already have an account
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
