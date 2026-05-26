import React, { useState } from 'react';
import {
  View,
  Text,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Button, Input } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';

export default function ResetPasswordScreen() {
  const { signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords differ', 'The two passwords must match.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert(
        'Password updated',
        "You're all set. Use your new password next time you sign in.",
      );
      // Sign out so the recovery session is cleared and they re-sign-in
      // with the new password.
      await signOut();
    } catch (e: any) {
      Alert.alert('Could not update', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
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
          <View className="mb-8 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
              <Ionicons name="key-outline" size={28} color="#2D5F3E" />
            </View>
            <Text className="text-center text-2xl font-extrabold text-zinc-900">
              Set a new password
            </Text>
            <Text className="mt-2 text-center text-sm text-zinc-500">
              Use at least 6 characters.
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            <Input
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              leftIcon={
                <Ionicons name="lock-closed-outline" size={18} color="#71717A" />
              }
            />
            <Input
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repeat password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              leftIcon={
                <Ionicons name="lock-closed-outline" size={18} color="#71717A" />
              }
            />
          </View>

          <View style={{ marginTop: 24 }}>
            <Button size="lg" onPress={submit} loading={saving}>
              Update password
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
