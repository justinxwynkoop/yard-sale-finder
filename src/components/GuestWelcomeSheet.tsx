import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './ui';
import { navigateToAuth } from '../lib/navigationRef';

const SEEN_KEY = 'trove:guest-welcome-seen';

const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';

/**
 * One-time welcome sheet for first-launch guests. Guest browsing must stay
 * freely accessible (App Review 5.1.1(v) — no login wall), but landing
 * silently on the map left new users with no idea an account exists or why
 * they'd want one. This orients them once: browse freely, or create an
 * account for posting/saving/messaging. Fully dismissible; never shown
 * again after any choice.
 */
export function GuestWelcomeSheet() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => {
        if (!seen) setVisible(true);
      })
      .catch(() => {});
  }, []);

  const dismiss = (then?: () => void) => {
    setVisible(false);
    AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
    // Let the modal finish closing before navigating so the transition
    // doesn't fight the sheet animation.
    if (then) setTimeout(then, 250);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => dismiss()}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(23,21,19,0.45)' }}
        onPress={() => dismiss()}
        accessibilityLabel="Dismiss welcome"
      />
      <View
        style={{
          backgroundColor: '#fff',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 24,
          paddingTop: 14,
          paddingBottom: 34,
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#E4E4E7',
            marginBottom: 18,
          }}
        />
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: '#E8EFE9',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <Ionicons name="map-outline" size={28} color={BRAND} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: INK, letterSpacing: -0.3 }}>
          Welcome to Trove
        </Text>
        <Text style={{ marginTop: 6, fontSize: 14.5, lineHeight: 21, color: INK_MUTED }}>
          Every pin on the map is a yard sale near you — browse them all without
          an account. When you want to post a sale, save favorites, or message
          sellers, a free account takes about a minute.
        </Text>
        <View style={{ marginTop: 20, gap: 10 }}>
          <Button size="lg" onPress={() => dismiss(() => navigateToAuth('signup'))}>
            Create a free account
          </Button>
          <Button variant="ghost" onPress={() => dismiss(() => navigateToAuth('signin'))}>
            I already have an account
          </Button>
          <Button variant="ghost" onPress={() => dismiss()}>
            Just browse for now
          </Button>
        </View>
      </View>
    </Modal>
  );
}
