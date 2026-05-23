import React from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from './Avatar';
import { toast } from '../../lib/toast';

const BRAND = '#F97316';

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
 * Tap-to-edit avatar for the Edit Profile screen. Single tap target
 * (the avatar itself) -- the camera badge is the visual affordance.
 *
 * Visual:
 *   - xl Avatar with the existing initials fallback.
 *   - White circular badge with a brand-colored camera in the lower
 *     right; subtle border + shadow so it stays visible against any
 *     avatar contents (including the brand-orange fallback, where the
 *     previous solid-orange badge disappeared).
 *   - Press feedback dims the whole thing slightly.
 *   - Upload-in-progress shows a dark dim + spinner overlay.
 *
 * Behavior:
 *   - iOS: native ActionSheetIOS.
 *   - Android: Alert.alert dialog with the same options.
 *   - All picker / permission flows are wrapped in try/catch with toast
 *     errors so failures are visible.
 */
export function AvatarEditor({
  uri,
  name,
  uploading = false,
  onChange,
}: AvatarEditorProps) {
  const open = () => {
    const options: Array<{ label: string; action: Action }> = [
      { label: 'Take Photo', action: 'camera' },
      { label: 'Choose from Library', action: 'library' },
    ];
    if (uri) options.push({ label: 'Remove Photo', action: 'remove' });

    if (Platform.OS === 'ios') {
      const labels = [...options.map((o) => o.label), 'Cancel'];
      const cancelIdx = options.length;
      const destructiveIdx = uri ? options.length - 1 : -1;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex: cancelIdx,
          ...(destructiveIdx >= 0 ? { destructiveButtonIndex: destructiveIdx } : {}),
        },
        (i) => {
          if (typeof i === 'number' && i >= 0 && i < options.length) {
            void handle(options[i].action);
          }
        },
      );
    } else {
      Alert.alert('Change photo', undefined, [
        ...options.map((o) => ({
          text: o.label,
          style: o.action === 'remove' ? ('destructive' as const) : undefined,
          onPress: () => void handle(o.action),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
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
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.9,
        });
        if (!result.canceled && result.assets?.[0]?.uri) {
          onChange(result.assets[0].uri);
        }
        return;
      }

      // library
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showPermissionAlert('library');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        onChange(result.assets[0].uri);
      }
    } catch (e: any) {
      toast.error(
        'Could not change photo',
        e?.message ?? 'Something went wrong opening the picker.',
      );
    }
  };

  const SIZE = 112; // matches Avatar size="xl"
  const BADGE = 38;

  return (
    <Pressable
      onPress={open}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel={`${name ?? 'Profile'} photo, tap to change`}
      accessibilityHint="Opens a menu to take a photo, pick from library, or remove the current photo"
      hitSlop={8}
      style={({ pressed }) => ({
        opacity: pressed && !uploading ? 0.85 : 1,
        width: SIZE,
        height: SIZE,
      })}
    >
      <Avatar uri={uri ?? undefined} name={name} size="xl" />

      {/* Camera badge: white circle, brand camera. Contrasts against
          any avatar content -- including the brand-orange initials
          fallback, where the old solid-orange badge disappeared. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -2,
          right: -2,
          width: BADGE,
          height: BADGE,
          borderRadius: BADGE / 2,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: '#E4E4E7',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.12,
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
