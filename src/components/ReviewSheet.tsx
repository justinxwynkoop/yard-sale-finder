import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { submitReview } from '../hooks/useReviews';
import { toast } from '../lib/toast';

const BRAND = '#1F4D3A';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const AMBER = '#FBCB6B';

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

/**
 * Bottom-sheet star-rating composer. The write half of the reviews
 * loop: 1-5 stars + an optional note, submitted via submitReview.
 * Server-side the insert is gated by RLS (you must have a conversation
 * with the subject or have visited one of their sales), so this sheet
 * should only be opened when useCanReview says eligible — but a
 * rejected insert still fails safe with a readable message.
 */
export function ReviewSheet({
  visible,
  onClose,
  subjectUserId,
  subjectName,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  subjectUserId: string;
  subjectName: string;
  onSubmitted?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStars(0);
    setBody('');
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (stars < 1 || busy) return;
    setBusy(true);
    const { error } = await submitReview({
      subjectUserId,
      stars,
      body: body.trim() || null,
    });
    setBusy(false);
    if (error) {
      const msg = /duplicate|unique/i.test(error.message)
        ? `You've already reviewed ${subjectName}.`
        : /row-level security/i.test(error.message)
          ? `Reviews are limited to people you've actually dealt with.`
          : error.message;
      toast.error(msg);
      return;
    }
    toast.success('Review posted');
    onSubmitted?.();
    close();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          onPress={close}
          style={{ flex: 1, backgroundColor: 'rgba(20,18,15,0.4)' }}
          accessibilityLabel="Dismiss"
        />
        <View
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 14,
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 16,
          }}
        >
          {/* Grabber + title */}
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 99,
                backgroundColor: HAIRLINE,
                marginBottom: 12,
              }}
            />
            <Text
              style={{
                fontSize: 17,
                fontWeight: '800',
                color: INK,
                letterSpacing: -0.3,
              }}
            >
              Rate {subjectName}
            </Text>
            <Text style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 3 }}>
              How was your experience?
            </Text>
          </View>

          {/* Stars */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 8,
            }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setStars(n)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
                accessibilityState={{ selected: stars >= n }}
              >
                <Ionicons
                  name={stars >= n ? 'star' : 'star-outline'}
                  size={36}
                  color={stars >= n ? AMBER : INK_MUTED}
                />
              </Pressable>
            ))}
          </View>
          <Text
            style={{
              textAlign: 'center',
              fontSize: 12.5,
              fontWeight: '700',
              color: stars > 0 ? INK : INK_MUTED,
              minHeight: 16,
            }}
          >
            {stars > 0 ? STAR_LABELS[stars] : 'Tap a star'}
          </Text>

          {/* Optional note */}
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Add a note (optional) — what did you buy, how did it go?"
            placeholderTextColor={INK_MUTED}
            multiline
            maxLength={500}
            style={{
              marginTop: 14,
              minHeight: 84,
              maxHeight: 140,
              borderWidth: 1,
              borderColor: HAIRLINE,
              borderRadius: 13,
              backgroundColor: BONE,
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 12,
              fontSize: 14,
              color: INK,
              textAlignVertical: 'top',
            }}
          />

          {/* Submit */}
          <Pressable
            onPress={submit}
            disabled={stars < 1 || busy}
            accessibilityRole="button"
            accessibilityLabel="Post review"
            style={{
              marginTop: 14,
              paddingVertical: 15,
              borderRadius: 14,
              alignItems: 'center',
              backgroundColor: BRAND,
              opacity: stars < 1 || busy ? 0.5 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                Post review
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
