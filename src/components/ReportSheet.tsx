import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { REPORT_REASONS, useReports } from '../hooks/useReports';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import { ReportReason, ReportTargetType } from '../types';
import { Button } from './ui';
import { toast } from '../lib/toast';

export type ReportSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** What's being reported. */
  targetType: ReportTargetType;
  /** UUID of the sale / listing / profile row. */
  targetId: string;
  /** UUID of the user who owns the content (for the optional block). */
  ownerUserId: string;
  /**
   * Human label of the thing being reported, shown to the user so
   * they know what they're reporting. e.g. "Spring yard sale" or
   * "1990s Pyrex set".
   */
  ownerName?: string;
  /** Fired after a successful submit so the parent can navigate away
   *  (e.g. pop back to the previous screen). */
  onSubmitted?: () => void;
};

/**
 * Reusable bottom-sheet for reporting a piece of content. Same UI
 * for sales, listings, and (eventually) user profiles -- only the
 * `targetType` changes.
 *
 * Includes an opt-in "Also block this user" toggle so the reporter
 * stops seeing this person's content in the same step. Apple's
 * UGC guideline asks for both surfaces; one combined moment is
 * better UX than forcing two separate flows.
 */
export function ReportSheet({
  visible,
  onClose,
  targetType,
  targetId,
  ownerUserId,
  ownerName,
  onSubmitted,
}: ReportSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [notes, setNotes] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { submit } = useReports();
  const { block } = useBlockedUsers();

  const reset = () => {
    setReason(null);
    setNotes('');
    setAlsoBlock(false);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      const { error } = await submit({
        targetType,
        targetId,
        reason,
        notes: notes.trim() || undefined,
      });
      if (error) throw error;
      if (alsoBlock) {
        await block(ownerUserId);
      }
      toast.success(
        'Report submitted',
        "We'll review this within 24 hours.",
      );
      reset();
      onClose();
      onSubmitted?.();
    } catch (e: any) {
      Alert.alert(
        'Could not submit report',
        e?.message ?? 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          if (!submitting) {
            reset();
            onClose();
          }
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kbWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Report this {targetType}</Text>
            {ownerName ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {ownerName}
              </Text>
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>What&rsquo;s the problem?</Text>
            {REPORT_REASONS.map((r) => {
              const active = reason === r.value;
              return (
                <Pressable
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.optionLabel,
                        active && styles.optionLabelActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                    {r.hint ? (
                      <Text style={styles.optionHint}>{r.hint}</Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={
                      active
                        ? 'radio-button-on'
                        : 'radio-button-off'
                    }
                    size={20}
                    color={active ? '#1F4D3A' : '#A1A1AA'}
                  />
                </Pressable>
              );
            })}

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              Add details (optional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="What happened?"
              placeholderTextColor="#A1A1AA"
              multiline
              maxLength={500}
              style={styles.notes}
              textAlignVertical="top"
            />

            <View style={styles.blockRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.blockLabel}>
                  Also block this user
                </Text>
                <Text style={styles.blockHint}>
                  You won&rsquo;t see anything from them in the app.
                </Text>
              </View>
              <Switch
                value={alsoBlock}
                onValueChange={setAlsoBlock}
                trackColor={{ true: '#1F4D3A', false: '#E4E4E7' }}
                thumbColor="#fff"
              />
            </View>
          </ScrollView>

          <View style={{ gap: 10, marginTop: 8 }}>
            <Button
              size="lg"
              variant="destructive"
              disabled={!reason || submitting}
              loading={submitting}
              onPress={handleSubmit}
            >
              Submit report
            </Button>
            <Button
              variant="ghost"
              disabled={submitting}
              onPress={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  kbWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 36,
    paddingHorizontal: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -2 },
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E4E7',
    marginBottom: 12,
  },
  header: { marginBottom: 8 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#71717A',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A1A1AA',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F7F2E8',
    marginBottom: 6,
    gap: 12,
    borderWidth: 1,
    borderColor: '#F7F2E8',
  },
  optionActive: {
    backgroundColor: '#EFE8D6',
    borderColor: '#1F4D3A',
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#18181B',
  },
  optionLabelActive: {
    color: '#9A3412',
  },
  optionHint: {
    marginTop: 2,
    fontSize: 12,
    color: '#71717A',
    lineHeight: 16,
  },
  notes: {
    backgroundColor: '#F7F2E8',
    borderRadius: 12,
    padding: 12,
    minHeight: 88,
    fontSize: 14,
    color: '#18181B',
    borderWidth: 1,
    borderColor: '#F4F4F5',
  },
  blockRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F7F2E8',
  },
  blockLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#18181B',
  },
  blockHint: {
    marginTop: 2,
    fontSize: 12,
    color: '#71717A',
  },
});
