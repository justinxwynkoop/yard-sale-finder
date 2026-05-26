import React, { useState } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useProfile, invalidateProfile } from '../../hooks/useProfile';
import { supabase } from '../../lib/supabase';
import { Avatar, Button, Input } from '../../components/ui';

export default function CompleteProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile, refetch } = useProfile();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const name = displayName.trim();
    if (!name) {
      Alert.alert('Name required', 'Please tell us what to call you.');
      return;
    }
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in again.');
      return;
    }
    setSaving(true);
    try {
      // Use upsert so this works even if the profile row was never
      // auto-created (which can happen with Apple Sign In when the
      // user chose 'Hide My Email' / private relay).
      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          email: user.email ?? '',
          display_name: name,
        },
        { onConflict: 'id' },
      );
      if (error) {
        console.warn('Profile upsert failed:', error);
        Alert.alert('Could not save', error.message);
        return;
      }
      // Refetch this screen's own useProfile state plus every other
      // mounted instance (notably MainGate in the navigator) so the
      // gate flips to MainTabs without an app relaunch.
      await refetch();
      invalidateProfile();
    } catch (e: any) {
      console.warn('Profile save threw:', e);
      Alert.alert('Could not save', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View className="mb-8 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-brand">
              <Ionicons name="hand-right" size={32} color="#fff" />
            </View>
            <Text className="text-center text-2xl font-extrabold text-zinc-900">
              Welcome!
            </Text>
            <Text className="mt-2 text-center text-sm text-zinc-500">
              What should buyers call you when they show up?
            </Text>
          </View>

          <View className="items-center" style={{ marginBottom: 24 }}>
            <Avatar
              uri={profile?.avatar_url}
              name={displayName || user?.email}
              size="xl"
            />
          </View>

          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Sarah from Maple St"
            maxLength={50}
            autoCapitalize="words"
          />
          <Text className="mt-1 text-xs text-zinc-500">
            You can change this any time from your Profile tab.
          </Text>

          <View style={{ marginTop: 32, gap: 12 }}>
            <Button
              size="lg"
              onPress={save}
              loading={saving}
              disabled={!displayName.trim() || saving}
            >
              Continue
            </Button>
            <Button variant="ghost" onPress={() => signOut()}>
              Sign out
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
