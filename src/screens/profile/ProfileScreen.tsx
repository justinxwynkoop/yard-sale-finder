import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../types';
import { Button, Input } from '../../components/ui';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
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
    if (!user) return;
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
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="border-b border-zinc-100 px-4 py-4">
        <Text className="text-2xl font-extrabold text-zinc-900">Profile</Text>
      </View>

      <View className="items-center py-8">
        {profile?.avatar_url ? (
          <Image
            source={{ uri: profile.avatar_url }}
            className="mb-3 h-24 w-24 rounded-full"
          />
        ) : (
          <View className="mb-3 h-24 w-24 items-center justify-center rounded-full bg-brand">
            <Text className="text-4xl font-bold text-white">
              {displayName ? displayName[0].toUpperCase() : '?'}
            </Text>
          </View>
        )}
        <Text className="text-sm text-zinc-500">{profile?.email}</Text>
      </View>

      <View className="px-6">
        <Input
          label="Display Name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          maxLength={50}
          containerClassName="mb-4"
        />

        <Button onPress={save} loading={saving}>
          Save Changes
        </Button>
      </View>

      <View className="absolute bottom-10 left-6 right-6">
        <Button variant="outline" onPress={handleSignOut} textClassName="text-red-600">
          Sign Out
        </Button>
      </View>
    </SafeAreaView>
  );
}
