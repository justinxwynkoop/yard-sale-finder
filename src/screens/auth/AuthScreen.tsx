import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Button, Input } from '../../components/ui';

WebBrowser.maybeCompleteAuthSession();

type Provider = 'google' | 'apple' | 'facebook';
type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'email' | Provider>(null);
  const [showSocial, setShowSocial] = useState(false);

  const submitEmail = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert(
        'Password too short',
        'Use at least 6 characters.',
      );
      return;
    }
    setBusy('email');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // If email confirmation is enabled, session will be null until the user clicks the link
        if (!data.session) {
          Alert.alert(
            'Check your email',
            'We sent a confirmation link. (If you want to skip this for dev, disable "Confirm email" in your Supabase dashboard → Authentication → Sign In / Providers → Email.)',
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (e: any) {
      Alert.alert(
        mode === 'signup' ? 'Sign up failed' : 'Sign in failed',
        e.message,
      );
    } finally {
      setBusy(null);
    }
  };

  const signInWithProvider = async (provider: Provider) => {
    setBusy(provider);
    try {
      const redirectTo = Linking.createURL('auth-callback');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (error) throw error;
      if (!data.url) throw new Error('No auth URL returned');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === 'success' && result.url) {
        const returnedUrl = result.url;

        const codeMatch = returnedUrl.match(/[?&]code=([^&]+)/);
        if (codeMatch) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(codeMatch[1]);
          if (exchangeError) throw exchangeError;
          return;
        }

        const hashParams = new URLSearchParams(
          returnedUrl.split('#')[1] ?? '',
        );
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }
    } catch (e: any) {
      Alert.alert('Sign in failed', e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 64 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View className="mb-10 items-center">
          <View className="mb-6 h-20 w-20 items-center justify-center rounded-3xl bg-brand">
            <Ionicons name="pricetag" size={40} color="#fff" />
          </View>
          <Text className="text-center text-3xl font-extrabold text-zinc-900">
            Yard Sale Finder
          </Text>
          <Text className="mt-2 text-center text-sm text-zinc-500">
            {mode === 'signin'
              ? 'Welcome back. Sign in to host or save sales.'
              : 'Create an account to host your own sales.'}
          </Text>
        </View>

        {/* Mode switcher */}
        <View className="mb-4 flex-row self-center rounded-full bg-zinc-100 p-1">
          <Pressable
            onPress={() => setMode('signin')}
            className={[
              'rounded-full px-5 py-1.5',
              mode === 'signin' ? 'bg-white shadow' : '',
            ].join(' ')}
          >
            <Text
              className={[
                'text-sm font-semibold',
                mode === 'signin' ? 'text-zinc-900' : 'text-zinc-500',
              ].join(' ')}
            >
              Sign in
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('signup')}
            className={[
              'rounded-full px-5 py-1.5',
              mode === 'signup' ? 'bg-white shadow' : '',
            ].join(' ')}
          >
            <Text
              className={[
                'text-sm font-semibold',
                mode === 'signup' ? 'text-zinc-900' : 'text-zinc-500',
              ].join(' ')}
            >
              Sign up
            </Text>
          </Pressable>
        </View>

        {/* Email form */}
        <View style={{ gap: 12 }}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            leftIcon={<Ionicons name="mail-outline" size={18} color="#71717A" />}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            leftIcon={
              <Ionicons name="lock-closed-outline" size={18} color="#71717A" />
            }
          />
          <Button
            size="lg"
            onPress={submitEmail}
            loading={busy === 'email'}
            disabled={busy !== null}
          >
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </View>

        {/* Divider */}
        <View className="my-6 flex-row items-center">
          <View className="h-px flex-1 bg-zinc-200" />
          <Text className="mx-3 text-xs uppercase tracking-wider text-zinc-400">
            or
          </Text>
          <View className="h-px flex-1 bg-zinc-200" />
        </View>

        {/* Social trigger */}
        {!showSocial ? (
          <Pressable
            onPress={() => setShowSocial(true)}
            className="items-center py-2"
          >
            <Text className="text-sm font-semibold text-brand">
              Continue with Google, Apple, or Facebook
            </Text>
          </Pressable>
        ) : (
          <View style={{ gap: 10 }}>
            <SocialButton
              label="Continue with Google"
              iconName="logo-google"
              iconColor="#4285F4"
              onPress={() => signInWithProvider('google')}
              loading={busy === 'google'}
              disabled={busy !== null}
            />
            <SocialButton
              label="Continue with Apple"
              iconName="logo-apple"
              iconColor="#000"
              onPress={() => signInWithProvider('apple')}
              loading={busy === 'apple'}
              disabled={busy !== null}
            />
            <SocialButton
              label="Continue with Facebook"
              iconName="logo-facebook"
              iconColor="#1877F2"
              onPress={() => signInWithProvider('facebook')}
              loading={busy === 'facebook'}
              disabled={busy !== null}
            />
          </View>
        )}

        <Text className="mt-8 text-center text-xs leading-5 text-zinc-400">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SocialButton({
  label,
  iconName,
  iconColor,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={[
        'h-14 flex-row items-center rounded-2xl border border-zinc-200 bg-white px-4 active:bg-zinc-50',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-zinc-50">
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
      {loading ? (
        <ActivityIndicator color="#333" />
      ) : (
        <Text className="text-base font-semibold text-zinc-900">{label}</Text>
      )}
    </Pressable>
  );
}
