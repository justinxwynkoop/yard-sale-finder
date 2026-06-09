import React, { useState } from 'react';
import { View, Text, Alert, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { RootStackParamList } from '../../types';
import { Button, IconButton } from '../../components/ui';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CheckEmail'>;
type Route = RouteProp<RootStackParamList, 'CheckEmail'>;

export default function CheckEmailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { email } = route.params;
  const [resending, setResending] = useState(false);

  const resend = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (error) throw error;
      Alert.alert('Sent', `We sent another link to ${email}.`);
    } catch (e: any) {
      Alert.alert('Could not resend', e.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="px-4 py-2">
        <IconButton
          variant="ghost"
          size="md"
          onPress={() => navigation.goBack()}
          icon={<Ionicons name="chevron-back" size={22} color="#18181B" />}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingBottom: 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-8 mt-4 items-center">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-3xl bg-brand-50">
            <Ionicons name="mail-unread-outline" size={36} color="#1F4D3A" />
          </View>
          <Text className="text-center text-2xl font-extrabold text-zinc-900">
            Check your email
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-zinc-500">
            We sent a confirmation link to
          </Text>
          <Text className="mt-1 text-center text-base font-semibold text-zinc-900">
            {email}
          </Text>
          <Text className="mt-3 text-center text-sm leading-5 text-zinc-500">
            Tap the link in the email on this device to finish creating your
            account.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <Button size="lg" variant="outline" onPress={resend} loading={resending}>
            Resend email
          </Button>
          <Pressable
            onPress={() => navigation.goBack()}
            className="items-center py-3"
          >
            <Text className="text-sm font-semibold text-brand">
              Use a different email
            </Text>
          </Pressable>
        </View>

        <View className="mt-10 rounded-2xl bg-zinc-50 p-4">
          <View className="flex-row items-start">
            <Ionicons name="information-circle-outline" size={18} color="#71717A" />
            <Text className="ml-2 flex-1 text-xs leading-5 text-zinc-600">
              Can't find the email? Check your spam folder. If you're testing
              locally and want to skip confirmation, turn off "Confirm email" in
              your Supabase dashboard under Authentication → Providers → Email.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
