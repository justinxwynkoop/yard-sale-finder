import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { toast } from '../../lib/toast';

const BRAND = '#F97316';
const SURFACE = '#FAFAF9';
const SIZE = 120;
const BADGE = 40;

export type AvatarEditorProps = {
  uri: string | null | undefined;
  name?: string | null;
  uploading?: boolean;
  /**
   * Called with a local file URI when the user picks/takes a new
   * photo, or `null` when they choose Remove. Caller is responsible
   * for actually uploading and clearing state.
   */
  onChange: (uri: string | null) => void;
};

type Action = 'camera' | 'library' | 'remove';

/**
 * Tap-to-edit avatar for the Edit Profile screen.
 *
 * Renders its own image / initials fallback with plain RN styles
 * instead of going through the shared Avatar component + NativeWind --
 * a previous version did and the brand-colored fallback circle was
 * disappearing, almost certainly due to layout/class application
 * interacting poorly with the explicit Pressable dimensions needed
 * to anchor the camera badge.
 *
 * Picker / permission flows use plain Alert.alert on both platforms
 * for reliability (ActionSheetIOS was eating callbacks in the preview
 * build) and are wrapped in try/catch with toast.error so any failure
 * surfaces visibly.
 */
export function AvatarEditor({
  uri,
  name,
  uploading = false,
  onChange,
}: AvatarEditorProps) {
  const open = () => {
    const buttons: Array<{
      text: string;
      style?: 'destructive' | 'cancel';
      onPress?: () => void;
    }> = [
      { text: 'Take Photo', onPress: () => void handle('camera') },
      { text: 'Choose from Library', onPress: () => void handle('library') },
    ];
    if (uri) {
      buttons.push({
        text: 'Remove Photo',
        style: 'destructive',
        onPress: () => void handle('remove'),
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Change profile photo', undefined, buttons);
  };

  const handle = async (action: Action) => {
    try {
      if (action === 'remove') {
        onChange(null);
        return;
      }

      if (action === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          showPermissionAlert('camera');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.9,
        });
        const picked = !result.canceled ? result.assets?.[0]?.uri : null;
        if (picked) onChange(picked);
        return;
      }

      // library
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showPermissionAlert('library');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      const picked = !result.canceled ? result.assets?.[0]?.uri : null;
      if (picked) onChange(picked);
    } catch (e: any) {
      toast.error(
        'Could not change photo',
        e?.message ?? 'Something went wrong opening the picker.',
      );
    }
  };

  const initial =
    (name?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <Pressable
      onPress={open}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel={`${name ?? 'Profile'} photo, tap to change`}
      accessibilityHint="Opens a menu to take a photo, pick from library, or remove the current photo"
      hitSlop={8}
      style={({ pressed }) => ({
        width: SIZE,
        height: SIZE,
        opacity: pressed && !uploading ? 0.85 : 1,
      })}
    >
      {/* Avatar surface: either the picked/saved image or a
          brand-colored circle with the initial. Sized explicitly via
          inline styles so it's never at the mercy of NativeWind
          resolution timing. */}
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            backgroundColor: '#F4F4F5',
          }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            backgroundColor: BRAND,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 44, fontWeight: '700' }}>
            {initial}
          </Text>
        </View>
      )}

      {/* Camera badge: white circle, brand camera. Surface-colored
          ring punches it cleanly off the avatar so it stays visible
          against any avatar content -- including the brand-orange
          initials fallback, where a brand-orange badge disappeared. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: BADGE,
          height: BADGE,
          borderRadius: BADGE / 2,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 3,
          borderColor: SURFACE,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.15,
          shadowRadius: 3,
          elevation: 3,
        }}
      >
        <Ionicons name="camera" size={20} color={BRAND} />
      </View>

      {uploading ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.40)',
            borderRadius: SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text
            style={{
              marginTop: 6,
              fontSize: 11,
              fontWeight: '600',
              color: '#FFFFFF',
            }}
          >
            Uploading…
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function showPermissionAlert(kind: 'camera' | 'library') {
  const what = kind === 'camera' ? 'camera' : 'photo library';
  Alert.alert(
    'Permission needed',
    `Enable ${what} access in Settings to change your profile photo.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ],
  );
}
