import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { RootStackParamList } from '../../types';
import { HeaderButton } from '../../components/ui';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>;

/**
 * Open House reskin. Preserves resetPasswordForEmail logic. Success
 * state uses non-enumeration copy ("If an account exists …").
 */
export default function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Email required', 'Enter the email on your account.');
      return;
    }
    setSending(true);
    try {
      // Keep redirectTo so the email's link still works on a phone, but the
      // primary path is the 6-digit code entered on the next screen (deep
      // links are unreliable in RN). Non-enumerating: we navigate to the
      // code screen regardless of whether the account exists.
      const redirectTo = Linking.createURL('reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });
      if (error) throw error;
      navigation.navigate('ResetPasswordCode', { email: cleanEmail });
    } catch (e: any) {
      Alert.alert('Could not send reset link', e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingVertical: 8,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: HAIRLINE,
        }}
      >
        <HeaderButton onPress={() => navigation.goBack()} accessibilityLabel="Back" />
        <Text
          style={{
            flex: 1,
            marginLeft: 6,
            fontSize: 17,
            fontWeight: '700',
            color: INK,
            letterSpacing: -0.3,
          }}
        >
          Reset password
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <>
              <Text
                style={{
                  fontSize: 14,
                  color: INK_SOFT,
                  lineHeight: 22,
                  marginBottom: 20,
                }}
              >
                Enter the email on your account and we&rsquo;ll email you a
                6-digit code to reset your password.
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: INK_SOFT,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 7,
                }}
              >
                Email
              </Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  placeholderTextColor={INK_MUTED}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  style={{
                    width: '100%',
                    borderWidth: 1,
                    borderColor: HAIRLINE,
                    borderRadius: 13,
                    paddingVertical: 13,
                    paddingLeft: 40,
                    paddingRight: 14,
                    fontSize: 15,
                    color: INK,
                    backgroundColor: '#fff',
                  }}
                />
                {/* After the input so it paints on top of the white field. */}
                <Ionicons
                  name="mail-outline"
                  size={16}
                  color={INK_MUTED}
                  style={{ position: 'absolute', left: 13, top: 15, pointerEvents: 'none' }}
                />
              </View>
              <Pressable
                onPress={submit}
                disabled={sending}
                style={{
                  marginTop: 18,
                  paddingVertical: 15,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: BRAND,
                }}
                accessibilityRole="button"
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                    Send reset code
                  </Text>
                )}
              </Pressable>
          </>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
