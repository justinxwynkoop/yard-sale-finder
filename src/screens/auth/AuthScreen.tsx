import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const [loading, setLoading] = useState<string | null>(null);

  const signInWithProvider = async (provider: 'google' | 'apple' | 'facebook') => {
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

        // PKCE flow: URL contains ?code=
        const codeMatch = returnedUrl.match(/[?&]code=([^&]+)/);
        if (codeMatch) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(codeMatch[1]);
          if (exchangeError) throw exchangeError;
          return;
        }

        // Implicit flow: tokens in hash fragment
        const hashParams = new URLSearchParams(returnedUrl.split('#')[1] ?? '');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
      }
    } catch (e: any) {
      Alert.alert('Sign in failed', e.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>🏷️</Text>
        <Text style={styles.title}>Yard Sale Finder</Text>
        <Text style={styles.subtitle}>Discover local sales. Host your own.</Text>
      </View>

      <View style={styles.buttons}>
        <SocialButton
          label="Continue with Google"
          icon="G"
          iconBg="#4285F4"
          onPress={() => signInWithProvider('google')}
          loading={loading === 'google'}
        />
        <SocialButton
          label="Continue with Apple"
          icon=""
          iconBg="#000"
          onPress={() => signInWithProvider('apple')}
          loading={loading === 'apple'}
        />
        <SocialButton
          label="Continue with Facebook"
          icon="f"
          iconBg="#1877F2"
          onPress={() => signInWithProvider('facebook')}
          loading={loading === 'facebook'}
        />
      </View>

      <Text style={styles.terms}>
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </Text>
    </SafeAreaView>
  );
}

function SocialButton({
  label,
  icon,
  iconBg,
  onPress,
  loading,
}: {
  label: string;
  icon: string;
  iconBg: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <TouchableOpacity style={styles.socialBtn} onPress={onPress} disabled={loading}>
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      {loading ? (
        <ActivityIndicator color="#333" style={styles.btnLabel} />
      ) : (
        <Text style={styles.btnLabel}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  hero: {
    alignItems: 'center',
    marginTop: 40,
  },
  logo: {
    fontSize: 72,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  buttons: {
    gap: 12,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fafafa',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  btnLabel: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  terms: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
  },
});
