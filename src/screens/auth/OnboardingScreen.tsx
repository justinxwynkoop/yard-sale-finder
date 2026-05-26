import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui';
import { useOnboarding } from '../../hooks/useOnboarding';

const { width: SCREEN_W } = Dimensions.get('window');

type Slide = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: 'map',
    title: 'Find sales near you',
    body: "Open the map to see live yard sales happening now. Tap any pin for photos, time, and directions.",
  },
  {
    icon: 'pricetag',
    title: 'Post your own',
    body: "Got stuff to sell? Drop a pin, snap a few photos, and you're on the map in under two minutes.",
  },
  {
    icon: 'heart',
    title: 'Save the good ones',
    body: 'Heart any sale to save it for your weekend route. Find them all back in your Profile tab.',
  },
];

export default function OnboardingScreen() {
  const { complete } = useOnboarding();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const goNext = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({
        x: (index + 1) * SCREEN_W,
        animated: true,
      });
    } else {
      complete();
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.skipRow}>
        <Pressable onPress={complete} hitSlop={8}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
        }
        style={{ flex: 1 }}
      >
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width: SCREEN_W }]}>
            <View style={styles.iconBubble}>
              <Ionicons name={s.icon} size={56} color="#2D5F3E" />
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Page dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === index ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      <View style={styles.cta}>
        <Button size="lg" onPress={goNext}>
          {index === SLIDES.length - 1 ? 'Get started' : 'Next'}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  skip: { fontSize: 14, color: '#71717A', fontWeight: '600' },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconBubble: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#18181B',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    color: '#52525B',
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  dotActive: { width: 24, backgroundColor: '#2D5F3E' },
  dotInactive: { width: 8, backgroundColor: '#E4E4E7' },
  cta: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },
});
