import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type Provider = 'google' | 'apple' | 'facebook';

export default function AuthScreen() {
  const [loading, setLoading] = useState<Provider | null>(null);

  const signInWithProvider = async (provider: Provider) => {
    setLoading(provider);
    try {
      const redirectTo = Linking.createURL('auth-callback');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
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
      setLoading(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-between px-6 py-12">
        {/* Hero */}
        <View className="mt-12 items-center">
          <View className="mb-6 h-20 w-20 items-center justify-center rounded-3xl bg-brand">
            <Ionicons name="pricetag" size={40} color="#fff" />
          </View>
          <Text className="text-center text-4xl font-extrabold text-zinc-900">
            Yard Sale Finder
          </Text>
          <Text className="mt-3 text-center text-base text-zinc-500">
            Discover local sales. Host your own.
          </Text>
        </View>

        {/* Sign-in buttons */}
        <View style={{ gap: 12 }}>
          <SocialButton
            label="Continue with Google"
            iconName="logo-google"
            iconColor="#4285F4"
            onPress={() => signInWithProvider('google')}
            loading={loading === 'google'}
          />
          <SocialButton
            label="Continue with Apple"
            iconName="logo-apple"
            iconColor="#000"
            onPress={() => signInWithProvider('apple')}
            loading={loading === 'apple'}
          />
          <SocialButton
            label="Continue with Facebook"
            iconName="logo-facebook"
            iconColor="#1877F2"
            onPress={() => signInWithProvider('facebook')}
            loading={loading === 'facebook'}
          />
        </View>

        <Text className="text-center text-xs leading-5 text-zinc-400">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function SocialButton({
  label,
  iconName,
  iconColor,
  onPress,
  loading,
}: {
  label: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className="h-14 flex-row items-center rounded-2xl border border-zinc-200 bg-white px-4 active:bg-zinc-50"
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
