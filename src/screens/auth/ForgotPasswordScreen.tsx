import React, { useState } from 'react';
import {
  View,
  Text,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { RootStackParamList } from '../../types';
import { Button, IconButton, Input } from '../../components/ui';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>;

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
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="px-4 py-2">
        <IconButton
          variant="ghost"
          size="md"
          onPress={() => navigation.goBack()}
          icon={<Ionicons name="chevron-back" size={22} color="#18181B" />}
        />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8 mt-4 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
              <Ionicons name="lock-open-outline" size={28} color="#1F4D3A" />
            </View>
            <Text className="text-center text-2xl font-extrabold text-zinc-900">
              {sent ? 'Check your email' : 'Reset your password'}
            </Text>
            <Text className="mt-2 text-center text-sm text-zinc-500">
              {sent
                ? `We sent a reset link to ${email.trim().toLowerCase()}. Tap it from this device to set a new password.`
                : "Enter your email and we'll send you a link to set a new password."}
            </Text>
          </View>

          {!sent && (
            <>
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                leftIcon={
                  <Ionicons name="mail-outline" size={18} color="#71717A" />
                }
              />
              <View style={{ marginTop: 16 }}>
                <Button size="lg" onPress={submit} loading={sending}>
                  Send reset link
                </Button>
              </View>
            </>
          )}

          {sent && (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Button
                size="lg"
                variant="outline"
                onPress={() => setSent(false)}
              >
                Send another link
              </Button>
              <Button size="lg" onPress={() => navigation.goBack()}>
                Back to sign in
              </Button>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
