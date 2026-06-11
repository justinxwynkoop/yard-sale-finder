import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useProfile, invalidateProfile } from '../../hooks/useProfile';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui';

const SUPPORT_MAILTO = 'mailto:jasonwynkoop1@yahoo.com';

const TERMS_VERSION = 'v1';

export default function TermsScreen() {
  const { user, signOut } = useAuth();
  const { refetch } = useProfile();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    if (!user || !agreed) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          terms_accepted_at: new Date().toISOString(),
          terms_version: TERMS_VERSION,
        })
        .eq('id', user.id);
      if (error) { Alert.alert('Could not save', error.message); return; }
      await refetch();
      invalidateProfile();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="border-b border-zinc-100 px-5 py-4">
        <Text className="text-xl font-extrabold text-zinc-900">Terms of Service</Text>
        <Text className="mt-0.5 text-xs text-zinc-400">
          Please read carefully before using Trove.
        </Text>
      </View>

      {/* Scrollable T&C */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator
      >
        <Section title="1. Eligibility — You Must Be 18 or Older">
          {`You must be at least 18 years of age to create an account or use this app. By registering, you confirm that you are 18 or older and have the legal capacity to enter into a binding agreement.

We do not knowingly collect personal information from users under 13 years of age (COPPA). If you believe a minor has created an account, please report it to us immediately.`}
        </Section>

        <Section title="2. Prohibited Content">
          <Text style={{ fontSize: 13, color: '#52525B', lineHeight: 20, marginBottom: 8 }}>
            The following are strictly prohibited. Violations may result in immediate account termination and reporting to law enforcement:
          </Text>
          <ProhibitedItem icon="ban-outline" label="Adult content" detail="Nudity, pornography, or sexually explicit material of any kind." />
          <ProhibitedItem icon="warning-outline" label="Content involving minors" detail="Any content that sexualizes, exploits, or endangers children. We have zero tolerance for CSAM and will report such content to the NCMEC and law enforcement." />
          <ProhibitedItem icon="paw-outline" label="Live animals or pets" detail="The sale, trade, or rehoming of live animals — including pets, livestock, or wildlife — is not permitted." />
          <ProhibitedItem icon="alert-circle-outline" label="Firearms and weapons" detail="Firearms, ammunition, explosives, tasers, switchblades, or any weapon primarily designed to cause harm, regardless of local laws." />
          <ProhibitedItem icon="flask-outline" label="Illegal drugs and paraphernalia" detail="Illegal substances, controlled substances without a valid prescription, or items used primarily for consuming illegal drugs." />
          <ProhibitedItem icon="medkit-outline" label="Prescription medications" detail="Prescription drugs may not be sold or transferred between users." />
          <ProhibitedItem icon="close-circle-outline" label="Stolen or counterfeit goods" detail="All items must be legally owned by the seller. Fraudulent, counterfeit, or stolen merchandise is prohibited." />
          <ProhibitedItem icon="flame-outline" label="Hazardous materials" detail="Recalled products, unregistered pesticides, or items that pose an unreasonable safety risk to buyers." />
          <ProhibitedItem icon="chatbubble-ellipses-outline" label="Harassment and hate speech" detail="Content targeting individuals or groups based on race, religion, gender, sexual orientation, national origin, disability, or other protected characteristics." />
        </Section>

        <Section title="3. Your Responsibilities">
          {`By posting a listing, you confirm that:\n\n• You legally own the item and have the right to sell it.\n• All photos and descriptions are accurate and not misleading.\n• The item does not fall into any prohibited category above.\n• You will complete sales honestly and as described.\n\nYou are solely responsible for the content you post.`}
        </Section>

        <Section title="4. Content Moderation">
          {`We reserve the right to remove any content that violates these Terms at our sole discretion and without prior notice. Buyers and sellers may report violations using the in-app report feature. We aim to review all reports within 24 hours.\n\nRepeated violations will result in permanent account suspension.`}
        </Section>

        <Section title="5. Privacy">
          {`We collect your name, email address, birthdate, and general location (city, state, ZIP code) to operate the service and verify eligibility. We do not sell your personal information to third parties.`}
        </Section>

        <Section title="6. Transactions">
          {`Trove is a platform connecting buyers and sellers. We do not verify the accuracy of listings, process payments, guarantee transactions, or take responsibility for items sold or purchased through the app. All transactions are conducted directly between the buyer and seller.`}
        </Section>

        <Section title="7. Limitation of Liability">
          {`To the maximum extent permitted by applicable law, Trove shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the app, including but not limited to loss of goods, personal injury, or financial loss resulting from a transaction.`}
        </Section>

        <Section title="8. Changes to These Terms">
          {`We may update these Terms from time to time. We will notify you within the app when material changes are made. Continued use of the app after changes are posted constitutes acceptance of the updated Terms.`}
        </Section>

        <Section title="9. Contact Us">
          <Text style={{ fontSize: 13, color: '#52525B', lineHeight: 20 }}>
            {'Questions about these Terms? Contact us at: '}
            <Text
              style={{ fontWeight: '600', color: '#1F4D3A' }}
              onPress={() => Linking.openURL(SUPPORT_MAILTO)}
            >
              TroveSupport
            </Text>
          </Text>
        </Section>

        {/* Spacer so the checkbox doesn't hide behind the CTA */}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Sticky footer */}
      <View className="border-t border-zinc-100 bg-white px-5 pb-8 pt-4" style={{ gap: 14 }}>
        {/* Checkbox */}
        <Pressable
          onPress={() => setAgreed((v) => !v)}
          className="flex-row items-start active:opacity-70"
          style={{ gap: 12 }}
        >
          <View
            className="mt-0.5 h-5 w-5 items-center justify-center rounded"
            style={{
              borderWidth: 2,
              borderColor: agreed ? '#1F4D3A' : '#D4D4D8',
              backgroundColor: agreed ? '#1F4D3A' : 'transparent',
            }}
          >
            {agreed && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
          <Text className="flex-1 text-sm text-zinc-700 leading-5">
            I have read and agree to the{' '}
            <Text className="font-semibold text-zinc-900">Terms of Service</Text>,
            including the prohibited content rules and the 18+ age requirement.
          </Text>
        </Pressable>

        <Button
          size="lg"
          disabled={!agreed || saving}
          loading={saving}
          onPress={accept}
        >
          I Agree — Continue
        </Button>

        <Pressable onPress={() => signOut()} className="items-center py-1">
          <Text className="text-sm text-zinc-400">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function ProhibitedItem({
  icon, label, detail,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  detail: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 10,
        backgroundColor: '#FEF2F2',
        borderRadius: 10,
        padding: 10,
      }}
    >
      <Ionicons name={icon} size={16} color="#DC2626" style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#991B1B' }}>{label}</Text>
        <Text style={{ fontSize: 12, color: '#7F1D1D', marginTop: 2, lineHeight: 17 }}>{detail}</Text>
      </View>
    </View>
  );
}
