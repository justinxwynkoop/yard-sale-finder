import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView as SafeAreaViewRN } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { HeaderButton } from '../../components/ui';
import { RootStackParamList } from '../../types';

const BONE = '#F7F2E8';
const CREAM = '#EFE8D6';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

WebBrowser.maybeCompleteAuthSession();

type Provider = 'google' | 'apple' | 'facebook';
type Mode = 'signin' | 'signup';
type Nav = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

export default function AuthScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Auth'>>();
  const [mode, setMode] = useState<Mode>(route.params?.mode ?? 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<null | 'email' | Provider>(null);
  const [showSocial, setShowSocial] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [legalModal, setLegalModal] = useState<null | 'terms' | 'privacy'>(null);

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
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }} edges={['top']}>
      {/* Back to Welcome */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <HeaderButton
          onPress={() =>
            navigation.canGoBack()
              ? navigation.goBack()
              : navigation.navigate('Welcome')
          }
          variant="tile"
          accessibilityLabel="Back"
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
            paddingTop: 8,
            paddingBottom: 28,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand mark + title */}
          <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 20 }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                backgroundColor: BRAND,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: BRAND,
                shadowOpacity: 0.27,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
                elevation: 6,
              }}
            >
              <Ionicons name="pricetag" size={28} color="#fff" />
            </View>
            <Text
              style={{
                fontSize: 23,
                fontWeight: '800',
                color: INK,
                letterSpacing: -0.5,
                marginTop: 14,
              }}
            >
              {isSignIn ? 'Welcome back' : 'Create your account'}
            </Text>
            <Text
              style={{
                fontSize: 13.5,
                color: INK_SOFT,
                marginTop: 4,
                textAlign: 'center',
              }}
            >
              {isSignIn
                ? 'Sign in to host or save sales.'
                : 'Join your neighborhood marketplace.'}
            </Text>
          </View>

          {/* Mode toggle */}
          <View
            style={{
              flexDirection: 'row',
              alignSelf: 'stretch',
              backgroundColor: CREAM,
              padding: 4,
              borderRadius: 999,
              marginBottom: 20,
            }}
          >
            {(['signin', 'signup'] as Mode[]).map((m) => {
              const on = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: on ? '#fff' : 'transparent',
                    shadowColor: '#000',
                    shadowOpacity: on ? 0.1 : 0,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: on ? 2 : 0,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text
                    style={{
                      fontSize: 13.5,
                      fontWeight: '700',
                      color: on ? INK : INK_MUTED,
                    }}
                  >
                    {m === 'signin' ? 'Sign in' : 'Sign up'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Email */}
          <FieldLabel>Email</FieldLabel>
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
              style={authInput}
            />
          </View>

          <View style={{ height: 14 }} />

          {/* Password */}
          <FieldLabel>Password</FieldLabel>
          <View style={{ position: 'relative' }}>
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={INK_MUTED}
              style={{ position: 'absolute', left: 13, top: 15 }}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={isSignIn ? 'Your password' : 'At least 6 characters'}
              placeholderTextColor={INK_MUTED}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              style={{ ...authInput, paddingRight: 56 }}
            />
            <Pressable
              onPress={() => setShowPassword((s) => !s)}
              hitSlop={8}
              style={{ position: 'absolute', right: 13, top: 14 }}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND }}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>

          {isSignIn && (
            <Pressable
              onPress={() => navigation.navigate('ForgotPassword')}
              hitSlop={8}
              style={{ alignSelf: 'flex-end', marginTop: 10 }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: BRAND }}>
                Forgot password?
              </Text>
            </Pressable>
          )}

          {/* Primary CTA */}
          <Pressable
            onPress={submitEmail}
            disabled={busy !== null}
            style={{
              marginTop: isSignIn ? 14 : 18,
              paddingVertical: 15,
              borderRadius: 14,
              alignItems: 'center',
              backgroundColor: BRAND,
              opacity: busy !== null && busy !== 'email' ? 0.6 : 1,
            }}
            accessibilityRole="button"
          >
            {busy === 'email' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                {isSignIn ? 'Sign in' : 'Create account'}
              </Text>
            )}
          </Pressable>

          {/* Inline mode swap */}
          <Pressable
            onPress={() => setMode(isSignIn ? 'signup' : 'signin')}
            style={{ marginTop: 14 }}
          >
            <Text style={{ textAlign: 'center', fontSize: 13, color: INK_MUTED }}>
              {isSignIn ? "Don't have an account? " : 'Already have one? '}
              <Text style={{ fontWeight: '700', color: BRAND }}>
                {isSignIn ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </Pressable>

          {/* Divider */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 22,
              marginBottom: 16,
            }}
          >
            <View style={{ flex: 1, height: 1, backgroundColor: HAIRLINE }} />
            <Text
              style={{
                marginHorizontal: 12,
                fontSize: 11,
                color: INK_MUTED,
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: '600',
              }}
            >
              or
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: HAIRLINE }} />
          </View>

          {/* Apple — real native button on iOS where available */}
          {appleAvailable && (
            <View style={{ marginBottom: 10 }}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                buttonStyle={
                  AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={13}
                style={{ width: '100%', height: 52 }}
                onPress={signInWithApple}
              />
            </View>
          )}

          {/* Google — always shown */}
          <SocialButton
            label="Continue with Google"
            iconName="logo-google"
            iconColor="#4285F4"
            onPress={() => signInWithProvider('google')}
            loading={busy === 'google'}
            disabled={busy !== null}
          />

          {/* Facebook — revealed via "More ways to sign in" */}
          {!showSocial ? (
            <Pressable
              onPress={() => setShowSocial(true)}
              style={{ alignItems: 'center', paddingVertical: 10, marginTop: 4 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>
                More ways to sign in
              </Text>
            </Pressable>
          ) : (
            <View style={{ marginTop: 10 }}>
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

          {/* Legal */}
          <Text
            style={{
              marginTop: 22,
              textAlign: 'center',
              fontSize: 11.5,
              lineHeight: 18,
              color: INK_MUTED,
            }}
          >
            {'By continuing, you agree to our '}
            <Text
              style={{ fontWeight: '700', color: INK_SOFT }}
              onPress={() => setLegalModal('terms')}
            >
              Terms of Service
            </Text>
            {' and '}
            <Text
              style={{ fontWeight: '700', color: INK_SOFT }}
              onPress={() => setLegalModal('privacy')}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />
    </SafeAreaView>
  );
}

const authInput = {
  width: '100%' as const,
  borderWidth: 1,
  borderColor: HAIRLINE,
  borderRadius: 13,
  paddingVertical: 13,
  paddingLeft: 40,
  paddingRight: 14,
  fontSize: 15,
  color: INK,
  backgroundColor: '#fff',
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </Text>
  );
}

const SUPPORT_MAILTO = 'mailto:jasonwynkoop1@yahoo.com';

function TroveSupportLink() {
  return (
    <Text
      style={{ fontWeight: '600', color: '#1F4D3A' }}
      onPress={() => Linking.openURL(SUPPORT_MAILTO)}
    >
      TroveSupport
    </Text>
  );
}

// ─── Legal Modal ─────────────────────────────────────────────────────────────

function LegalModal({
  type,
  onClose,
}: {
  type: null | 'terms' | 'privacy';
  onClose: () => void;
}) {
  return (
    <Modal
      visible={type !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaViewRN style={{ flex: 1, backgroundColor: '#fff' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#F4F4F5',
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#18181B' }}>
            {type === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#71717A" />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator
        >
          {type === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </ScrollView>
      </SafeAreaViewRN>
    </Modal>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#18181B', marginBottom: 8 }}>
        {title}
      </Text>
      {typeof children === 'string' ? (
        <Text style={{ fontSize: 13, color: '#52525B', lineHeight: 20 }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function LegalBody({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 13, color: '#52525B', lineHeight: 20 }}>{children}</Text>
  );
}

function ProhibitedRow({ label, detail }: { label: string; detail: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 6,
      }}
    >
      <Text style={{ fontSize: 13, color: '#52525B', lineHeight: 20 }}>{'•'}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: '#52525B', lineHeight: 20 }}>
        <Text style={{ fontWeight: '700' }}>{label}</Text>
        {` — ${detail}`}
      </Text>
    </View>
  );
}

function TermsContent() {
  return (
    <>
      <LegalSection title="1. Eligibility — You Must Be 18 or Older">
        {`You must be at least 18 years of age to create an account or use this app. By registering, you confirm that you are 18 or older and have the legal capacity to enter into a binding agreement.\n\nWe do not knowingly collect personal information from users under 13 years of age (COPPA). If you believe a minor has created an account, please report it to us immediately.`}
      </LegalSection>

      <LegalSection title="2. Prohibited Content">
        <LegalBody>
          {'The following are strictly prohibited. Violations may result in immediate account termination and reporting to law enforcement:'}
        </LegalBody>
        <View style={{ marginTop: 8 }}>
          <ProhibitedRow label="Adult content" detail="Nudity, pornography, or sexually explicit material of any kind." />
          <ProhibitedRow label="Content involving minors" detail="Any content that sexualizes, exploits, or endangers children. We have zero tolerance for CSAM and will report such content to the NCMEC and law enforcement." />
          <ProhibitedRow label="Live animals or pets" detail="The sale, trade, or rehoming of live animals — including pets, livestock, or wildlife — is not permitted." />
          <ProhibitedRow label="Firearms and weapons" detail="Firearms, ammunition, explosives, tasers, switchblades, or any weapon primarily designed to cause harm, regardless of local laws." />
          <ProhibitedRow label="Illegal drugs and paraphernalia" detail="Illegal substances, controlled substances without a valid prescription, or items used primarily for consuming illegal drugs." />
          <ProhibitedRow label="Prescription medications" detail="Prescription drugs may not be sold or transferred between users." />
          <ProhibitedRow label="Stolen or counterfeit goods" detail="All items must be legally owned by the seller. Fraudulent, counterfeit, or stolen merchandise is prohibited." />
          <ProhibitedRow label="Hazardous materials" detail="Recalled products, unregistered pesticides, or items that pose an unreasonable safety risk to buyers." />
          <ProhibitedRow label="Harassment and hate speech" detail="Content targeting individuals or groups based on race, religion, gender, sexual orientation, national origin, disability, or other protected characteristics." />
        </View>
      </LegalSection>

      <LegalSection title="3. Your Responsibilities">
        {`By posting a listing, you confirm that:\n\n• You legally own the item and have the right to sell it.\n• All photos and descriptions are accurate and not misleading.\n• The item does not fall into any prohibited category above.\n• You will complete sales honestly and as described.\n\nYou are solely responsible for the content you post.`}
      </LegalSection>

      <LegalSection title="4. Content Moderation">
        {`We reserve the right to remove any content that violates these Terms at our sole discretion and without prior notice. Buyers and sellers may report violations using the in-app report feature. We aim to review all reports within 24 hours.\n\nRepeated violations will result in permanent account suspension.`}
      </LegalSection>

      <LegalSection title="5. Privacy">
        {'We collect your name, email address, birthdate, and general location (city, state, ZIP code) to operate the service and verify eligibility. We do not sell your personal information to third parties.'}
      </LegalSection>

      <LegalSection title="6. Transactions">
        {'Trove is a platform connecting buyers and sellers. We do not verify the accuracy of listings, process payments, guarantee transactions, or take responsibility for items sold or purchased through the app. All transactions are conducted directly between the buyer and seller.'}
      </LegalSection>

      <LegalSection title="7. Limitation of Liability">
        {'To the maximum extent permitted by applicable law, Trove shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the app, including but not limited to loss of goods, personal injury, or financial loss resulting from a transaction.'}
      </LegalSection>

      <LegalSection title="8. Changes to These Terms">
        {'We may update these Terms from time to time. We will notify you within the app when material changes are made. Continued use of the app after changes are posted constitutes acceptance of the updated Terms.'}
      </LegalSection>

      <LegalSection title="9. Contact Us">
        <Text style={{ fontSize: 13, color: '#52525B', lineHeight: 20 }}>
          {'Questions about these Terms? Contact us at: '}
          <TroveSupportLink />
        </Text>
      </LegalSection>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <LegalBody>
        {'This Privacy Policy explains how Trove collects, uses, and protects information when you use our mobile application.'}
      </LegalBody>
      <View style={{ height: 16 }} />

      <LegalSection title="1. Information We Collect">
        {`To make the app work, we collect the following:\n\n• Account information — your email address, or if you use Sign in with Apple, the Apple ID identifier and name you choose to share. We also store the display name you set in onboarding.\n\n• Location data — while you have the app open, we access your device's location to show yard sales near you and to let you pin your own sale on the map. We do not collect your location in the background.\n\n• Content you post — photos, text, address, dates, times, categories, and pricing notes so that other users can see them on the map.\n\n• Device information — basic crash and diagnostic data (device model, OS version, crash stack traces) to help us fix bugs.`}
      </LegalSection>

      <LegalSection title="2. How We Use Information">
        {`• To show you yard sales near your current location.\n• To display sales you post to other users browsing the map.\n• To authenticate you when you sign in.\n• To improve the app and fix problems.\n• To contact you about your account if necessary.\n\nWe do not sell your data, and we do not use it for advertising or tracking across other apps or websites.`}
      </LegalSection>

      <LegalSection title="3. What Other Users Can See">
        {'When you post a sale, the photos, description, address, dates and times, categories, pricing notes, and the display name on your profile are visible to anyone using the app. Your email address and precise location (apart from any sale address you choose to post) are not shared with other users.'}
      </LegalSection>

      <LegalSection title="4. Where Your Data Is Stored">
        {'We use Supabase as our backend. Your account and sale data live in a managed Postgres database, and photos are stored in Supabase Storage. Data is encrypted in transit (HTTPS) and at rest.'}
      </LegalSection>

      <LegalSection title="5. Third-Party Services">
        {`• Apple Sign in — if you choose to sign in with Apple, Apple shares an Apple ID identifier and optionally your name and email with us.\n\n• Supabase — provides authentication, database, and file storage.\n\n• Apple — the App Store and TestFlight handle app distribution.`}
      </LegalSection>

      <LegalSection title="6. Your Rights and Choices">
        <Text style={{ fontSize: 13, color: '#52525B', lineHeight: 20 }}>
          {"• Update or delete any sale you've posted from the My Sales tab.\n\n• Turn off location access in iOS Settings → Privacy & Security → Location Services → Trove. The app will still work but won't auto-center on your location.\n\n• Delete your account — email "}
          <TroveSupportLink />
          {" from the address associated with your account and we'll remove your account and all your sales within a few business days."}
        </Text>
      </LegalSection>

      <LegalSection title="7. Children's Privacy">
        {"Trove is not directed to children under 13, and we do not knowingly collect information from children under 13. If you believe a child has provided us information, contact us and we'll remove it."}
      </LegalSection>

      <LegalSection title="8. User-Generated Content and Moderation">
        {'Photos and text posted by users are public to other users of the app. We reserve the right to remove content that violates our terms or applicable law. Users can report content to us at the contact address below.'}
      </LegalSection>

      <LegalSection title="9. Changes to This Policy">
        {"We may update this policy as the app evolves. We'll update the \"Last updated\" date when we do, and significant changes will be highlighted in the app or via email."}
      </LegalSection>

      <LegalSection title="10. Contact">
        <Text style={{ fontSize: 13, color: '#52525B', lineHeight: 20 }}>
          {'Questions, deletion requests, or anything else: '}
          <TroveSupportLink />
        </Text>
      </LegalSection>
    </>
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
