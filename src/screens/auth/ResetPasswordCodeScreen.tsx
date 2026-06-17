import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import { HeaderButton } from '../../components/ui';
import { OtpInput, OtpInputHandle } from '../../components/OtpInput';
import { toast } from '../../lib/toast';
import { triggerRecovery } from '../../lib/recoveryBus';
import { RootStackParamList } from '../../types';

const BONE = '#F7F2E8';
const CREAM = '#EFE8D6';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';

const CODE_LEN = 6;
const RESEND_SECONDS = 38;

type Nav = NativeStackNavigationProp<RootStackParamList, 'ResetPasswordCode'>;
type Route = RouteProp<RootStackParamList, 'ResetPasswordCode'>;
type Status = 'idle' | 'verifying' | 'error' | 'success';

/**
 * Password reset, step 2: the user enters the 6-digit recovery code we
 * emailed (template includes {{ .Token }}). Verifying it establishes a
 * recovery session; we then signal recoveryBus so the navigator swaps to
 * ResetPasswordScreen where they set a new password.
 *
 * This replaces the magic-link reset path — deep links are unreliable in
 * RN (desktop clicks can't open the app; in-app browsers block custom
 * schemes), so an OTP keeps the whole flow in-app.
 */
export default function ResetPasswordCodeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { email } = route.params;

  const otpRef = useRef<OtpInputHandle>(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [secs, setSecs] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secs <= 0) return;
    const id = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secs]);

  const verify = async (value: string) => {
    setStatus('verifying');
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: value,
      type: 'recovery',
    });
    if (error) {
      setStatus('error');
      setCode('');
      setTimeout(() => otpRef.current?.focus(), 150);
      return;
    }
    // Recovery session is now active. Flip the navigator to the
    // set-new-password screen immediately — any delay would briefly show
    // the main app (the session lands before we switch).
    triggerRecovery();
    setStatus('success');
  };

  const onChange = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, CODE_LEN);
    setCode(next);
    if (status === 'error') setStatus('idle');
    if (next.length === CODE_LEN) verify(next);
  };

  const resend = async () => {
    if (secs > 0) return;
    setSecs(RESEND_SECONDS);
    setStatus('idle');
    setCode('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('reset-password'),
    });
    if (error) {
      toast.error('Could not resend', error.message);
    } else {
      toast.success('Code sent', `We emailed a new code to ${email}.`);
      otpRef.current?.focus();
    }
  };

  const isSuccess = status === 'success';
  const canVerify = code.length === CODE_LEN && status !== 'verifying';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <HeaderButton
          onPress={() => navigation.goBack()}
          variant="tile"
          accessibilityLabel="Back"
        />
      </View>

      <View
        style={{
          flex: 1,
          alignItems: 'center',
          paddingHorizontal: 28,
          paddingTop: 24,
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            backgroundColor: isSuccess ? BRAND : BRAND_SOFT,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <Ionicons
            name={isSuccess ? 'checkmark' : 'lock-closed-outline'}
            size={isSuccess ? 40 : 34}
            color={isSuccess ? '#fff' : BRAND}
          />
        </View>

        <Text
          style={{
            fontSize: 23,
            fontWeight: '800',
            color: INK,
            letterSpacing: -0.4,
            textAlign: 'center',
          }}
        >
          {isSuccess ? 'Code verified' : 'Reset your password'}
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
          {isSuccess ? (
            'Setting up your reset…'
          ) : (
            <>
              Enter the 6-digit code we sent to{'\n'}
              <Text style={{ fontWeight: '700', color: INK }}>{email}</Text>
            </>
          )}
        </Text>

        {!isSuccess && (
          <>
            <View style={{ marginTop: 26, alignSelf: 'stretch' }}>
              <OtpInput
                ref={otpRef}
                value={code}
                onChangeText={onChange}
                status={status}
                editable={status !== 'verifying'}
              />
            </View>

            <View style={{ height: 20, marginTop: 12 }}>
              {status === 'error' && (
                <Text style={{ fontSize: 13, color: '#A23E2D', fontWeight: '600' }}>
                  That code didn&rsquo;t match. Try again.
                </Text>
              )}
              {status === 'verifying' && (
                <Text
                  style={{ fontSize: 13, color: INK_MUTED, fontWeight: '600' }}
                >
                  Verifying…
                </Text>
              )}
            </View>

            <Pressable
              onPress={() => canVerify && verify(code)}
              disabled={!canVerify}
              style={{
                marginTop: 8,
                alignSelf: 'stretch',
                paddingVertical: 15,
                borderRadius: 14,
                alignItems: 'center',
                backgroundColor: canVerify ? BRAND : CREAM,
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canVerify }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: canVerify ? '#fff' : INK_MUTED,
                }}
              >
                {status === 'verifying' ? 'Verifying…' : 'Continue'}
              </Text>
            </Pressable>

            <Text style={{ marginTop: 18, fontSize: 13, color: INK_SOFT }}>
              Didn&rsquo;t get it?{' '}
              {secs > 0 ? (
                <Text>
                  Resend in{' '}
                  <Text style={{ fontWeight: '700', color: INK }}>
                    0:{String(secs).padStart(2, '0')}
                  </Text>
                </Text>
              ) : (
                <Text
                  onPress={resend}
                  style={{ fontWeight: '700', color: BRAND }}
                >
                  Resend code
                </Text>
              )}
            </Text>

            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={6}
              style={{ marginTop: 12 }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: '600', color: INK_MUTED }}
              >
                Wrong email? Go back
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
