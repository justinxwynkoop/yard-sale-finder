import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './ui';
import { navigateToAuth } from '../lib/navigationRef';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';

/**
 * Full-screen sign-in invitation shown in place of account-only tabs
 * (Inbox, Profile) while browsing as a guest. Guests can use the rest of
 * the app freely — this is the friendly door into the account flow.
 */
export function GuestCta({
  icon,
  title,
  description,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            backgroundColor: '#E8EFE9',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
        >
          <Ionicons name={icon} size={32} color={BRAND} />
        </View>
        <Text
          style={{
            fontSize: 20,
            fontWeight: '800',
            color: INK,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            marginTop: 8,
            marginBottom: 24,
            fontSize: 14,
            lineHeight: 20,
            color: INK_MUTED,
            textAlign: 'center',
          }}
        >
          {description}
        </Text>
        <View style={{ alignSelf: 'stretch', gap: 10 }}>
          <Button size="lg" onPress={() => navigateToAuth('signup')}>
            Create a free account
          </Button>
          <Button variant="ghost" onPress={() => navigateToAuth('signin')}>
            I already have an account
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
