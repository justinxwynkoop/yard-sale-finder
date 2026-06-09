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

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const CREAM = '#EFE8D6';
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
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Email required', 'Enter the email on your account.');
      return;
    }
    setSending(true);
    try {
      const redirectTo = Linking.createURL('reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });
      if (error) throw error;
      setSent(true);
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
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: BONE,
            borderWidth: 1,
            borderColor: HAIRLINE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chevron-back" size={20} color={INK} />
        </Pressable>
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
          {!sent ? (
            <>
              <Text
                style={{
                  fontSize: 14,
                  color: INK_SOFT,
                  lineHeight: 22,
                  marginBottom: 20,
                }}
              >
                Enter the email on your account and we&rsquo;ll send a link to
                reset your password.
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
                <Ionicons
                  name="mail-outline"
                  size={16}
                  color={INK_MUTED}
                  style={{ position: 'absolute', left: 13, top: 15 }}
                />
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
                    Send reset link
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 30 }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 22,
                  backgroundColor: BRAND_SOFT,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 18,
                }}
              >
                <Ionicons name="checkmark" size={32} color={BRAND} />
              </View>
              <Text style={{ fontSize: 19, fontWeight: '800', color: INK }}>
                Check your inbox
              </Text>
              <Text
                style={{
                  fontSize: 13.5,
                  color: INK_SOFT,
                  marginTop: 8,
                  lineHeight: 20,
                  textAlign: 'center',
                }}
              >
                If an account exists for{' '}
                {email.trim().toLowerCase() || 'that email'}, a reset link is on
                its way.
              </Text>
              <Pressable
                onPress={() => navigation.goBack()}
                style={{
                  marginTop: 22,
                  alignSelf: 'stretch',
                  paddingVertical: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: BRAND,
                }}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                  Back to sign in
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
