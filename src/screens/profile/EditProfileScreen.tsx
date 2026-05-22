import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Avatar, Button, Input } from '../../components/ui';
import { toast } from '../../lib/toast';

/**
 * Standalone Edit Profile screen pushed from ProfileHome.
 *
 * Currently exposes display name. Future: avatar upload, contact
 * email visibility toggle, etc. Kept narrow on purpose so the form
 * fits the iOS one-purpose-per-screen pattern.
 */
export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [originalName, setOriginalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const name = data?.display_name ?? '';
        setOriginalName(name);
        setDisplayName(name);
        setAvatarUrl(data?.avatar_url ?? undefined);
        setLoading(false);
      });
  }, [user]);

  const dirty = displayName.trim() !== originalName.trim();
  const valid = displayName.trim().length > 0;

  const save = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'Sign in again to save your profile.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Could not save', error.message);
      return;
    }
    toast.success('Profile saved');
    navigation.goBack();
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
        }}
      >
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <Avatar uri={avatarUrl} name={displayName || user?.email} size="xl" />
            <Text className="mt-3 text-sm text-zinc-500">
              {user?.email ?? ''}
            </Text>
          </View>

          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="What buyers will see"
            maxLength={50}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Text
            className="mt-2 text-xs text-zinc-500"
            style={{ paddingHorizontal: 4 }}
          >
            Shown on every sale and listing you post. You can change this any
            time.
          </Text>

          <View style={{ marginTop: 24, gap: 12 }}>
            <Button
              size="lg"
              onPress={save}
              loading={saving}
              disabled={!dirty || !valid || saving}
            >
              Save changes
            </Button>
            <Button
              variant="ghost"
              onPress={() => navigation.goBack()}
              disabled={saving}
            >
              Cancel
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
