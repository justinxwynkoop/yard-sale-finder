import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';

const SUPPORT_MAILTO = 'mailto:jasonwynkoop1@yahoo.com';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Button, Input, Card } from '../../components/ui';

/**
 * Self-service account deletion. Required by Apple App Store
 * Guideline 5.1.1(v).
 *
 * Two-step confirm:
 *   1. Show the user what will be deleted.
 *   2. Require them to type "DELETE" literally, then tap the red button.
 *
 * On confirm we call the `delete_my_account` SQL function (see the
 * migration of the same name). The function uses auth.uid() so the
 * client cannot delete anyone else's account, and the FK cascades on
 * profiles, sales, sale_media, favorites, listings, and listing_media
 * clean up everything the user ever posted.
 */
export default function DeleteAccountScreen() {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const armed = confirmText.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'Sign in to delete your account.');
      return;
    }
    Alert.alert(
      'Delete account?',
      'This is permanent and cannot be undone. All of your sales, listings, photos, and saved items will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: () => performDelete(),
        },
      ],
    );
  };

  const performDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      // Sign-out clears AsyncStorage + flips navigation back to Auth.
      // The user row is already gone, so the local session is now a
      // dangling JWT -- signOut() drops it cleanly.
      await signOut();
      // No need to navigate -- useAuth flipping session=null causes
      // the root navigator to swap to AuthScreen automatically.
    } catch (e: any) {
      Alert.alert(
        'Could not delete account',
        e?.message ?? 'Something went wrong. Contact TroveSupport if this keeps happening.',
        [
          { text: 'OK' },
          { text: 'Email TroveSupport', onPress: () => Linking.openURL(SUPPORT_MAILTO) },
        ],
      );
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          className="mb-5 items-center"
          style={{ paddingHorizontal: 16, paddingTop: 8 }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              backgroundColor: '#FEE2E2',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Ionicons name="warning-outline" size={32} color="#DC2626" />
          </View>
          <Text className="text-center text-2xl font-extrabold text-zinc-900">
            Delete your account?
          </Text>
          <Text className="mt-2 text-center text-sm text-zinc-500">
            This is permanent. We can&rsquo;t recover it after you tap the
            button.
          </Text>
        </View>

        <Card className="p-5">
          <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
            What gets deleted
          </Text>
          <Row icon="person-outline" label="Your profile and display name" />
          <Row icon="pricetag-outline" label="Every yard sale you&rsquo;ve posted" />
          <Row icon="cube-outline" label="Every item listing you&rsquo;ve posted" />
          <Row icon="images-outline" label="All photos you&rsquo;ve uploaded" />
          <Row icon="heart-outline" label="Your saved sales" />
          <Row icon="mail-outline" label="Your sign-in credentials" />
        </Card>

        <Card className="mt-4 p-5">
          <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            Confirm
          </Text>
          <Text className="mb-3 text-sm text-zinc-600">
            Type <Text className="font-bold text-zinc-900">DELETE</Text> below
            to enable the delete button.
          </Text>
          <Input
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="DELETE"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            containerClassName="mb-0"
          />
        </Card>

        <View style={{ marginTop: 24, gap: 12 }}>
          <Button
            size="lg"
            onPress={handleDelete}
            disabled={!armed || deleting}
            style={{
              backgroundColor: armed && !deleting ? '#DC2626' : '#FCA5A5',
              opacity: deleting ? 0.7 : 1,
            }}
            textClassName="text-white"
            leftIcon={
              deleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="trash-outline" size={18} color="#fff" />
              )
            }
          >
            {deleting ? 'Deleting…' : 'Delete my account'}
          </Button>
          <Button
            variant="ghost"
            onPress={() => navigation.goBack()}
            disabled={deleting}
          >
            Cancel
          </Button>
        </View>

        <Text
          className="mt-6 text-center text-xs text-zinc-400"
          style={{ paddingHorizontal: 24 }}
        >
          Questions or concerns? Email{' '}
          <Text
            className="font-semibold"
            style={{ color: '#1F4D3A' }}
            onPress={() => Linking.openURL(SUPPORT_MAILTO)}
          >
            TroveSupport
          </Text>{' '}
          before deleting your account.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 12,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FEE2E2',
        }}
      >
        <Ionicons name={icon} size={16} color="#DC2626" />
      </View>
      <Text className="flex-1 text-sm text-zinc-700">{label}</Text>
    </View>
  );
}
