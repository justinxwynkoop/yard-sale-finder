import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOnboarding } from '../../hooks/useOnboarding';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDES: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
}[] = [
  {
    icon: 'map-outline',
    title: 'Sales on a live map',
    body: 'See yard sales, estate sales, and moving sales happening around you — right now.',
  },
  {
    icon: 'pricetag-outline',
    title: 'Buy & sell the easy way',
    body: 'Browse one-off finds nearby, or post your own sale or item in a couple of minutes.',
  },
  {
    icon: 'heart-outline',
    title: 'Never miss a good one',
    body: 'Save the sales you love and search any area to see what’s on this weekend.',
  },
];

/**
 * One-time post-signup onboarding (after Complete Profile + Terms). Three
 * value slides; "Get started" marks it seen via useOnboarding().complete,
 * which flips MainGate to the real app.
 */
export default function OnboardingScreen() {
  const { complete } = useOnboarding();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (p !== page) setPage(p);
  };

  const isLast = page === SLIDES.length - 1;

  const next = () => {
    if (isLast) {
      complete();
    } else {
      scrollRef.current?.scrollTo({ x: (page + 1) * SCREEN_W, animated: true });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }}>
      {/* Skip */}
      <View style={{ alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable onPress={complete} hitSlop={10} accessibilityRole="button">
          <Text style={{ fontSize: 14, fontWeight: '600', color: INK_MUTED }}>
            Skip
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s) => (
          <View
            key={s.title}
            style={{
              width: SCREEN_W,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 36,
            }}
          >
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 28,
                backgroundColor: BRAND_SOFT,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 28,
              }}
            >
              <Ionicons name={s.icon} size={44} color={BRAND} />
            </View>
            <Text
              style={{
                fontSize: 24,
                fontWeight: '800',
                color: INK,
                letterSpacing: -0.5,
                textAlign: 'center',
              }}
            >
              {s.title}
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: INK_SOFT,
                textAlign: 'center',
                marginTop: 12,
                lineHeight: 22,
              }}
            >
              {s.body}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 7,
          marginBottom: 20,
        }}
      >
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === page ? 22 : 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: i === page ? BRAND : HAIRLINE,
            }}
          />
        ))}
      </View>

      {/* CTA */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <Pressable
          onPress={next}
          style={{
            paddingVertical: 15,
            borderRadius: 14,
            alignItems: 'center',
            backgroundColor: BRAND,
          }}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get started' : 'Next'}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
            {isLast ? 'Get started' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
