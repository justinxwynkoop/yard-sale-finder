import React, { useState } from 'react';
import {
  View,
  Text,
  Alert,
  Pressable,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { RootStackParamList } from '../../types';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const CREAM = '#EFE8D6';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CheckEmail'>;
type Route = RouteProp<RootStackParamList, 'CheckEmail'>;

/**
 * Post-signup confirmation. Open House reskin; preserves the resend
 * logic. "Open email app" launches the device mail client best-effort.
 */
export default function CheckEmailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { email } = route.params;
  const [resending, setResending] = useState(false);

  const resend = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      Alert.alert('Sent', `We sent another link to ${email}.`);
    } catch (e: any) {
      Alert.alert('Could not resend', e.message);
    } finally {
      setResending(false);
    }
  };

  const openMail = async () => {
    // iOS: message:// opens Mail's inbox. Android: mailto: launches the
    // default mail client. Best-effort — swallow if no handler.
    try {
      await Linking.openURL(Platform.OS === 'ios' ? 'message://' : 'mailto:');
    } catch {
      /* no mail app */
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: HAIRLINE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chevron-back" size={18} color={INK} />
        </Pressable>
      </View>

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
            width: 88,
            height: 88,
            borderRadius: 26,
            backgroundColor: BRAND_SOFT,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
          <Ionicons name="mail-outline" size={40} color={BRAND} />
        </View>
        <Text
          style={{
            fontSize: 23,
            fontWeight: '800',
            color: INK,
            letterSpacing: -0.4,
          }}
        >
          Check your email
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: INK_SOFT,
            marginTop: 10,
            lineHeight: 22,
            textAlign: 'center',
          }}
        >
          We sent a confirmation link to{'\n'}
          <Text style={{ fontWeight: '700', color: INK }}>{email}</Text>. Tap it
          to finish setting up your account.
        </Text>

        <Pressable
          onPress={openMail}
          style={{
            marginTop: 28,
            alignSelf: 'stretch',
            paddingVertical: 15,
            borderRadius: 14,
            alignItems: 'center',
            backgroundColor: BRAND,
          }}
          accessibilityRole="button"
          accessibilityLabel="Open email app"
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
            Open email app
          </Text>
        </Pressable>

        <View
          style={{
            marginTop: 16,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 13, color: INK_SOFT }}>Didn&rsquo;t get it? </Text>
          <Pressable onPress={resend} disabled={resending} hitSlop={6}>
            {resending ? (
              <ActivityIndicator size="small" color={BRAND} />
            ) : (
              <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>
                Resend link
              </Text>
            )}
          </Pressable>
        </View>

        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={6}
          style={{ marginTop: 12 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: INK_MUTED }}>
            Wrong email? Go back
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
