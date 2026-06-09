import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SubHeader } from '../../components/SubHeader';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { useProfile, invalidateProfile } from '../../hooks/useProfile';
import { supabase } from '../../lib/supabase';
import {
  uploadAvatar,
  deleteAvatar,
} from '../../lib/avatarUpload';
import { AvatarEditor, Input } from '../../components/ui';
import { toast } from '../../lib/toast';

const BRAND = '#1F4D3A';

/**
 * Edit Profile screen. Lets the user change their display name and
 * avatar. Save lives in the header right per Apple HIG / Material 3
 * conventions and stays disabled until the form is dirty + valid.
 * Cancel/back with unsaved changes prompts for confirmation.
 *
 * Avatar handling:
 *   - Local preview shows immediately after pick.
 *   - Upload + DB save happen together on tap Save.
 *   - On replace, the previous avatar file is best-effort deleted so
 *     stale objects don't accumulate in the avatars bucket.
 */
export default function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { profile, loading, refetch } = useProfile();

  // Seed once the profile arrives.
  const [originalName, setOriginalName] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [originalAvatar, setOriginalAvatar] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!seeded && profile) {
      const name = profile.display_name ?? '';
      setOriginalName(name);
      setDisplayName(name);
      setOriginalAvatar(profile.avatar_url ?? null);
      setAvatarUri(profile.avatar_url ?? null);
      setSeeded(true);
    }
  }, [profile, seeded]);

  const nameChanged = displayName.trim() !== originalName.trim();
  const avatarChanged = avatarUri !== originalAvatar;
  const dirty = nameChanged || avatarChanged;
  const valid = displayName.trim().length > 0;
  const canSave = dirty && valid && !saving;

  const handleSave = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'Sign in again to save your profile.');
      return;
    }
    setSaving(true);
    try {
      let nextAvatarUrl: string | null = originalAvatar;

      if (avatarChanged) {
        if (avatarUri && avatarUri !== originalAvatar) {
          // Picked a new local file -> upload, then plan to delete old.
          nextAvatarUrl = await uploadAvatar(user.id, avatarUri);
        } else if (avatarUri === null) {
          // Explicit remove.
          nextAvatarUrl = null;
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          avatar_url: nextAvatarUrl,
        })
        .eq('id', user.id);
      if (error) throw error;

      // Old avatar cleanup is best-effort; don't block the success path.
      if (avatarChanged && originalAvatar && originalAvatar !== nextAvatarUrl) {
        deleteAvatar(originalAvatar);
      }

      await refetch();
      invalidateProfile();
      toast.success('Profile saved');
      navigation.goBack();
    } catch (e: any) {
      // On upload failure, revert the local preview so the user sees
      // the actual saved state rather than a misleading new image.
      setAvatarUri(originalAvatar);
      toast.error('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!dirty) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      'Discard changes?',
      'Your edits will be lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ],
    );
  };

  // Save/Cancel now live in this screen's own SubHeader (see render),
  // since the screen renders headerShown:false to match the rest of the
  // app's rounded-tile headers. The dirty-state guard below still runs.

  // Intercept hardware/swipe back to honor the dirty-state prompt.
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      if (!dirty || saving) return;
      e.preventDefault();
      Alert.alert(
        'Discard changes?',
        'Your edits will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return sub;
  }, [navigation, dirty, saving]);

  if (loading && !seeded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
        }}
      >
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['bottom']}>
      <SubHeader
        title="Edit profile"
        onBack={handleCancel}
        right={
          saving ? (
            <ActivityIndicator size="small" color={BRAND} />
          ) : (
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: canSave ? BRAND : '#A1A1AA',
                }}
              >
                Save
              </Text>
            </Pressable>
          )
        }
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 24 }}>
            <AvatarEditor
              uri={avatarUri}
              name={displayName || profile?.email}
              uploading={saving && avatarChanged}
              onChange={setAvatarUri}
            />
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
            style={{
              fontSize: 12,
              color: '#71717A',
              paddingHorizontal: 4,
              marginTop: 6,
            }}
          >
            Shown on every sale and listing you post.
          </Text>

          <View style={{ marginTop: 28 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: '#A1A1AA',
                paddingHorizontal: 4,
                paddingBottom: 8,
              }}
            >
              Email
            </Text>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#F4F4F5',
                paddingHorizontal: 14,
                paddingVertical: 14,
              }}
            >
              <Text style={{ fontSize: 16, color: '#18181B' }}>
                {profile?.email ?? user?.email ?? ''}
              </Text>
              <Text style={{ fontSize: 12, color: '#A1A1AA', marginTop: 2 }}>
                Can't be changed here.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
