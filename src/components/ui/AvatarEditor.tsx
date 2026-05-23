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
 * Avatar with a tap-to-edit affordance for the Edit Profile screen.
 * Renders the current avatar (or initials fallback) with a small
 * brand-colored camera badge anchored bottom-right. Tapping opens a
 * native action sheet on iOS / Alert dialog on Android with options to
 * take a photo, pick from library, or remove the current avatar.
 *
 * Permission denials show an Alert with an "Open Settings" action
 * (deep-links to the app's settings page) so the user can recover
 * without restarting the app.
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
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...options.map((o) => o.label), 'Cancel'],
          cancelButtonIndex: options.length,
          destructiveButtonIndex: uri ? options.length - 1 : undefined,
        },
        (i) => {
          if (i < options.length) handle(options[i].action);
        },
      );
    } else {
      // Android: plain Alert with stacked buttons. ActionSheetIOS doesn't
      // exist; using Alert avoids pulling in @expo/react-native-action-sheet
      // for now.
      Alert.alert('Change photo', undefined, [
        ...options.map((o) => ({
          text: o.label,
          style: o.action === 'remove' ? ('destructive' as const) : undefined,
          onPress: () => handle(o.action),
        })),
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handle = async (action: Action) => {
    if (action === 'remove') {
      onChange(null);
      return;
    }
    if (action === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        return showPermissionAlert('camera');
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        onChange(result.assets[0].uri);
      }
      return;
    }
    // library
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return showPermissionAlert('library');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      onChange(result.assets[0].uri);
    }
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onPress={open}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel={`${name ?? 'Profile'} avatar, tap to change`}
        style={{ position: 'relative' }}
      >
        <Avatar uri={uri ?? undefined} name={name} size="xl" />

        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: BRAND,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: '#FAFAF9',
          }}
        >
          <Ionicons name="camera" size={16} color="#FFFFFF" />
        </View>

        {uploading ? (
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(255,255,255,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
            }}
          >
            <ActivityIndicator size="small" color={BRAND} />
          </View>
        ) : null}
      </Pressable>

      <Pressable onPress={open} disabled={uploading} style={{ marginTop: 12 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '600',
            color: BRAND,
            opacity: uploading ? 0.5 : 1,
          }}
        >
          Change photo
        </Text>
      </Pressable>
    </View>
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
