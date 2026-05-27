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
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Button, Input } from '../../components/ui';
import { RootStackParamList } from '../../types';

WebBrowser.maybeCompleteAuthSession();

type Provider = 'google' | 'apple' | 'facebook';
type Mode = 'signin' | 'signup';
type Nav = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

export default function AuthScreen() {
  const navigation = useNavigation<Nav>();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'email' | Provider>(null);
  const [showSocial, setShowSocial] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Detect whether Sign in with Apple is available on this device.
  // Returns false in Expo Go (no native module), on Android, or on
  // iOS versions older than 13.
  React.useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const signInWithApple = async () => {
    setBusy('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
    } catch (e: any) {
      // User cancelled — silent.
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Sign in failed', e.message ?? 'Could not sign in with Apple.');
    } finally {
      setBusy(null);
    }
  };

  const submitEmail = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    setBusy('email');
    try {
      if (mode === 'signup') {
        const redirectTo = Linking.createURL('auth-callback');
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;

        // Detect 'user_repeated_signup': Supabase doesn't return an
        // error when the email is already registered (security: avoids
        // user-enumeration) but the returned user has an empty
        // identities array. We DO want to tell the user, so they're
        // not stuck waiting for an email that won't come.
        const alreadyExists =
          data.user && Array.isArray(data.user.identities) &&
          data.user.identities.length === 0;
        if (alreadyExists) {
          // Silently try signing in with the same credentials — the user
          // may have started signup before but never finished. If it
          // works they land back at the gates to complete their profile.
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
          if (!signInError) return; // session listener takes over

          // Wrong password — show options
          Alert.alert(
            'Account already exists',
            `An account with ${cleanEmail} already exists. Sign in to continue, or reset your password.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign in', onPress: () => setMode('signin') },
              { text: 'Reset password', onPress: () => navigation.navigate('ForgotPassword') },
            ],
          );
          return;
        }

        // If email confirmation is enabled, session will be null until
        // the user clicks the link — route to a dedicated CheckEmail
        // screen with a resend option.
        if (!data.session) {
          navigation.navigate('CheckEmail', { email: cleanEmail });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          // Common case: user hasn't signed up yet
          if (/invalid login credentials/i.test(error.message)) {
            Alert.alert(
              'Account not found',
              "We couldn't sign you in with those credentials. Would you like to create an account instead?",
              [
                { text: 'Try again', style: 'cancel' },
                {
                  text: 'Create account',
                  onPress: () => setMode('signup'),
                },
              ],
            );
            return;
          }
          throw error;
        }
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

  const isSignIn = mode === 'signin';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero (compact) */}
          <View className="mb-6 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-brand">
              <Ionicons name="pricetag" size={32} color="#fff" />
            </View>
            <Text className="text-center text-2xl font-extrabold text-zinc-900">
              {isSignIn ? 'Welcome back' : 'Create your account'}
            </Text>
            <Text className="mt-1 text-center text-sm text-zinc-500">
              {isSignIn
                ? 'Sign in to host or save sales.'
                : 'Sign up to start posting sales.'}
            </Text>
          </View>

          {/* Mode switcher — explicit inline styles so it can't be invisible */}
          <View
            style={{
              flexDirection: 'row',
              alignSelf: 'center',
              backgroundColor: '#F4F4F5',
              padding: 4,
              borderRadius: 999,
              marginBottom: 20,
            }}
          >
            <Pressable
              onPress={() => setMode('signin')}
              style={{
                paddingHorizontal: 24,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: isSignIn ? '#FFFFFF' : 'transparent',
                shadowColor: '#000',
                shadowOpacity: isSignIn ? 0.08 : 0,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: isSignIn ? 2 : 0,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: isSignIn ? '#18181B' : '#71717A',
                }}
              >
                Sign in
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('signup')}
              style={{
                paddingHorizontal: 24,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: !isSignIn ? '#FFFFFF' : 'transparent',
                shadowColor: '#000',
                shadowOpacity: !isSignIn ? 0.08 : 0,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: !isSignIn ? 2 : 0,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: !isSignIn ? '#18181B' : '#71717A',
                }}
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
              autoCorrect={false}
              autoComplete="email"
              leftIcon={
                <Ionicons name="mail-outline" size={18} color="#71717A" />
              }
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              leftIcon={
                <Ionicons name="lock-closed-outline" size={18} color="#71717A" />
              }
            />
            {isSignIn && (
              <Pressable
                onPress={() => navigation.navigate('ForgotPassword')}
                hitSlop={8}
              >
                <Text className="text-right text-sm font-semibold text-brand">
                  Forgot password?
                </Text>
              </Pressable>
            )}
            <Button
              size="lg"
              onPress={submitEmail}
              loading={busy === 'email'}
              disabled={busy !== null}
            >
              {isSignIn ? 'Sign in' : 'Create account'}
            </Button>

            {/* Helpful inline link to opposite mode */}
            <Pressable onPress={() => setMode(isSignIn ? 'signup' : 'signin')}>
              <Text className="text-center text-sm text-zinc-500">
                {isSignIn ? "Don't have an account? " : 'Already have one? '}
                <Text className="font-semibold text-brand">
                  {isSignIn ? 'Sign up' : 'Sign in'}
                </Text>
              </Text>
            </Pressable>
          </View>

          {/* Divider */}
          <View className="my-6 flex-row items-center">
            <View className="h-px flex-1 bg-zinc-200" />
            <Text className="mx-3 text-xs uppercase tracking-wider text-zinc-400">
              or
            </Text>
            <View className="h-px flex-1 bg-zinc-200" />
          </View>

          {/* Apple Sign In — iOS only, requires a dev build (not Expo Go) */}
          {appleAvailable && (
            <View style={{ marginBottom: 10 }}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                buttonStyle={
                  AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={16}
                style={{ width: '100%', height: 56 }}
                onPress={signInWithApple}
              />
            </View>
          )}

          {/* Other providers (Google / Facebook) — collapsed by default */}
          {!showSocial ? (
            <Pressable
              onPress={() => setShowSocial(true)}
              className="items-center py-2"
            >
              <Text className="text-sm font-semibold text-brand">
                Continue with Google or Facebook
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
    </SafeAreaView>
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
