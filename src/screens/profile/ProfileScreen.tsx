import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../types';
import { Avatar, Badge, Button, Card, Input } from '../../components/ui';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setProfile(data);
        setDisplayName(data?.display_name ?? '');
        setLoading(false);
      });
  }, [user]);

  const save = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'Sign in to save your profile.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Saved', 'Your profile has been updated.');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="bg-white px-5 py-4">
        <Text className="text-2xl font-extrabold text-zinc-900">Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Card className="items-center px-6 py-8">
          <Avatar uri={profile?.avatar_url} name={displayName} size="xl" />
          <Text className="mt-4 text-lg font-bold text-zinc-900">
            {displayName || 'Add your name'}
          </Text>
          <Text className="mt-1 text-sm text-zinc-500">
            {profile?.email ?? (user ? user.email : 'Not signed in')}
          </Text>
          {!user && (
            <View className="mt-3">
              <Badge tone="winding">Dev bypass — no user</Badge>
            </View>
          )}
        </Card>

        <Card className="p-5">
          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            maxLength={50}
            containerClassName="mb-4"
          />
          <Button onPress={save} loading={saving} size="md">
            Save changes
          </Button>
        </Card>

        <Card className="p-5">
          <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
            App
          </Text>
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
              <Ionicons name="information-circle-outline" size={20} color="#F97316" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-zinc-900">
                Yard Sale Finder
              </Text>
              <Text className="text-xs text-zinc-500">Version 1.0.0</Text>
            </View>
          </View>
        </Card>

        <View className="mt-2">
          <Button variant="outline" onPress={handleSignOut} textClassName="text-red-600"
            leftIcon={<Ionicons name="log-out-outline" size={18} color="#DC2626" />}>
            Sign out
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
