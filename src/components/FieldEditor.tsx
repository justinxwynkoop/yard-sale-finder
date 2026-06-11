import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePhoneVerification } from '../hooks/usePhoneVerification';

const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_SOFT = '#54504A';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';
const AMBER = '#B8772C';

/**
 * Discriminated config for the reusable Account field editor. The
 * Account screen builds one of these and hands it to <FieldEditor/>;
 * on save we get back (key, value) and commit to the profile.
 */
export type FieldEditorConfig =
  | {
      type: 'text';
      key: string;
      title: string;
      value: string;
      placeholder?: string;
      hint?: string;
      keyboard?: 'default' | 'email-address';
    }
  | {
      type: 'textarea';
      key: string;
      title: string;
      value: string;
      max: number;
      placeholder?: string;
      hint?: string;
    }
  | {
      type: 'chips';
      key: string;
      title: string;
      value: string[];
      options: readonly string[];
      hint?: string;
    }
  | { type: 'verifyPhone'; key: string; title: string; value: string }
  | { type: 'password'; key: string; title: string }
  | { type: 'delete'; key: string; title: string; summary?: string };

type Props = {
  editor: FieldEditorConfig | null;
  onClose: () => void;
  /** Commit a value for `key`. Only fired by text/textarea/chips/verifyPhone. */
  onSave: (key: string, value: string | string[]) => void;
  /** Fired when the delete-confirmation completes (typed DELETE). */
  onDelete?: () => void;
  /** Fired when the password form is submitted. */
  onPassword?: (current: string, next: string) => void;
};

const inputBase = {
  width: '100%' as const,
  borderWidth: 1.5,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 13,
  fontSize: 15,
  color: INK,
  backgroundColor: '#fff',
};

export function FieldEditor({
  editor,
  onClose,
  onSave,
  onDelete,
  onPassword,
}: Props) {
  return (
    <Modal
      visible={!!editor}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {editor ? (
        <EditorBody
          editor={editor}
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
          onPassword={onPassword}
        />
      ) : null}
    </Modal>
  );
}

function EditorBody({
  editor,
  onClose,
  onSave,
  onDelete,
  onPassword,
}: {
  editor: FieldEditorConfig;
  onClose: () => void;
  onSave: (key: string, value: string | string[]) => void;
  onDelete?: () => void;
  onPassword?: (current: string, next: string) => void;
}) {
  const insets = useSafeAreaInsets();

  // Local editing state, seeded from the config. Keyed by editor identity
  // so reopening a different field resets cleanly.
  const [text, setText] = useState(
    editor.type === 'chips' ? '' : (editor as any).value ?? '',
  );
  const [chips, setChips] = useState<string[]>(
    editor.type === 'chips' ? [...editor.value] : [],
  );
  const [confirm, setConfirm] = useState('');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');

  // Phone-verification (OTP) state.
  const { sendCode, verifyCode } = usePhoneVerification();
  const [phStep, setPhStep] = useState<'enter' | 'code'>('enter');
  const [phE164, setPhE164] = useState('');
  const [phCode, setPhCode] = useState('');
  const [phBusy, setPhBusy] = useState(false);
  const [phErr, setPhErr] = useState<string | null>(null);

  const onSendCode = async () => {
    setPhBusy(true);
    setPhErr(null);
    const { phone, error } = await sendCode(text);
    setPhBusy(false);
    if (error) {
      const m = (error.message ?? '').toLowerCase();
      setPhErr(
        /provider|sms|unsupported|not enabled|disabled/.test(m)
          ? 'Phone verification isn’t available yet — please try again later.'
          : error.message ?? 'Could not send a code.',
      );
      return;
    }
    setPhE164(phone);
    setPhStep('code');
  };

  const onVerifyCode = async () => {
    setPhBusy(true);
    setPhErr(null);
    const { error } = await verifyCode(phE164, phCode);
    setPhBusy(false);
    if (error) {
      setPhErr('That code didn’t work. Double-check it and try again.');
      return;
    }
    onClose(); // hook already updated the profile + invalidated it
  };

  return (
    // KeyboardAvoidingView must own the full modal height (flex: 1) so
    // its `padding` behavior lifts the whole sheet above the keyboard.
    // The scrim is a flex: 1 child that pushes the sheet to the bottom.
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Scrim */}
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(20,18,15,0.42)' }}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        style={{
          backgroundColor: '#fff',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: insets.bottom + 16,
          maxHeight: '85%',
        }}
      >
          <View
            style={{
              width: 38,
              height: 4,
              borderRadius: 99,
              backgroundColor: HAIRLINE,
              alignSelf: 'center',
              marginBottom: 14,
            }}
          />
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: INK,
              letterSpacing: -0.3,
              marginBottom: editorHint(editor) ? 4 : 14,
            }}
          >
            {editor.title}
          </Text>
          {editorHint(editor) ? (
            <Text
              style={{
                fontSize: 12,
                color: INK_MUTED,
                marginBottom: 14,
                lineHeight: 17,
              }}
            >
              {editorHint(editor)}
            </Text>
          ) : null}

          {/* flexShrink lets the list shrink within the sheet's maxHeight
              and become scrollable when the content is taller than the
              space above the keyboard (e.g. the 3-field password form). */}
          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingBottom: 4 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {editor.type === 'text' ? (
              <>
                <TextInput
                  autoFocus
                  value={text}
                  onChangeText={setText}
                  placeholder={editor.placeholder}
                  placeholderTextColor={INK_MUTED}
                  keyboardType={
                    editor.keyboard === 'email-address'
                      ? 'email-address'
                      : 'default'
                  }
                  autoCapitalize={
                    editor.keyboard === 'email-address' ? 'none' : 'sentences'
                  }
                  style={{ ...inputBase, borderColor: BRAND }}
                />
                <PrimaryButton
                  label="Save"
                  onPress={() => onSave(editor.key, text)}
                />
              </>
            ) : null}

            {editor.type === 'textarea' ? (
              <TextAreaBody
                editor={editor}
                value={text}
                onChangeText={setText}
                onSave={() => onSave(editor.key, text)}
              />
            ) : null}

            {editor.type === 'chips' ? (
              <>
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
                >
                  {editor.options.map((o) => {
                    const on = chips.includes(o);
                    return (
                      <Pressable
                        key={o}
                        onPress={() =>
                          setChips((c) =>
                            c.includes(o)
                              ? c.filter((x) => x !== o)
                              : [...c, o],
                          )
                        }
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                          paddingHorizontal: 14,
                          paddingVertical: 9,
                          borderRadius: 99,
                          backgroundColor: on ? BRAND : '#fff',
                          borderWidth: 1.5,
                          borderColor: on ? BRAND : HAIRLINE,
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                      >
                        {on ? (
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        ) : null}
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: on ? '#fff' : INK,
                          }}
                        >
                          {o}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <PrimaryButton
                  label="Save"
                  onPress={() => onSave(editor.key, chips)}
                />
              </>
            ) : null}

            {editor.type === 'verifyPhone' ? (
              <>
                {phStep === 'enter' ? (
                  <>
                    <TextInput
                      autoFocus
                      value={text}
                      onChangeText={setText}
                      placeholder="+1 (___) ___-____"
                      placeholderTextColor={INK_MUTED}
                      keyboardType="phone-pad"
                      editable={!phBusy}
                      style={{ ...inputBase, borderColor: BRAND }}
                    />
                    <Text
                      style={{
                        marginTop: 12,
                        fontSize: 12.5,
                        color: INK_SOFT,
                        lineHeight: 18,
                      }}
                    >
                      We’ll text a 6-digit code to confirm it’s you. Verified
                      numbers get a trust badge; your number is never shown
                      publicly.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={{
                        marginBottom: 10,
                        fontSize: 13,
                        color: INK_SOFT,
                        lineHeight: 18,
                      }}
                    >
                      Enter the code we texted to{' '}
                      <Text style={{ fontWeight: '700', color: INK }}>
                        {phE164}
                      </Text>
                      .
                    </Text>
                    <TextInput
                      autoFocus
                      value={phCode}
                      onChangeText={setPhCode}
                      placeholder="123456"
                      placeholderTextColor={INK_MUTED}
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!phBusy}
                      style={{
                        ...inputBase,
                        borderColor: BRAND,
                        letterSpacing: 6,
                        fontSize: 20,
                        textAlign: 'center',
                      }}
                    />
                    <Pressable
                      onPress={() => {
                        setPhStep('enter');
                        setPhCode('');
                        setPhErr(null);
                      }}
                      hitSlop={6}
                      style={{ marginTop: 12, alignSelf: 'flex-start' }}
                    >
                      <Text
                        style={{ fontSize: 12.5, fontWeight: '700', color: BRAND }}
                      >
                        Use a different number
                      </Text>
                    </Pressable>
                  </>
                )}

                {phErr ? (
                  <Text
                    style={{
                      marginTop: 10,
                      fontSize: 12.5,
                      color: ROSE,
                      lineHeight: 17,
                    }}
                  >
                    {phErr}
                  </Text>
                ) : null}

                <Pressable
                  onPress={phStep === 'enter' ? onSendCode : onVerifyCode}
                  disabled={
                    phBusy ||
                    (phStep === 'enter' ? !text.trim() : phCode.length < 6)
                  }
                  style={{
                    marginTop: 18,
                    paddingVertical: 14,
                    borderRadius: 14,
                    alignItems: 'center',
                    backgroundColor:
                      phBusy ||
                      (phStep === 'enter' ? !text.trim() : phCode.length < 6)
                        ? '#C7C1B0'
                        : BRAND,
                  }}
                  accessibilityRole="button"
                >
                  {phBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text
                      style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}
                    >
                      {phStep === 'enter' ? 'Send code' : 'Verify'}
                    </Text>
                  )}
                </Pressable>
              </>
            ) : null}

            {editor.type === 'password' ? (
              <>
                <TextInput
                  secureTextEntry
                  value={pwCurrent}
                  onChangeText={setPwCurrent}
                  placeholder="Current password"
                  placeholderTextColor={INK_MUTED}
                  style={{ ...inputBase, borderColor: HAIRLINE, marginBottom: 8 }}
                />
                <TextInput
                  secureTextEntry
                  value={pwNext}
                  onChangeText={setPwNext}
                  placeholder="New password"
                  placeholderTextColor={INK_MUTED}
                  style={{ ...inputBase, borderColor: HAIRLINE, marginBottom: 8 }}
                />
                <TextInput
                  secureTextEntry
                  value={pwConfirm}
                  onChangeText={setPwConfirm}
                  placeholder="Confirm new password"
                  placeholderTextColor={INK_MUTED}
                  style={{ ...inputBase, borderColor: HAIRLINE }}
                />
                <PrimaryButton
                  label="Update password"
                  disabled={
                    !pwNext || pwNext !== pwConfirm || pwNext.length < 8
                  }
                  onPress={() => {
                    onPassword?.(pwCurrent, pwNext);
                    onClose();
                  }}
                />
              </>
            ) : null}

            {editor.type === 'delete' ? (
              <>
                <Text
                  style={{ fontSize: 13.5, color: INK, lineHeight: 21 }}
                >
                  {editor.summary ??
                    'This permanently removes your account, your sales, listings, saved routes, and message history. This can’t be undone.'}
                </Text>
                <Text
                  style={{
                    marginTop: 14,
                    fontSize: 12,
                    fontWeight: '700',
                    color: INK_MUTED,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                  }}
                >
                  Type DELETE to confirm
                </Text>
                <TextInput
                  autoFocus
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="DELETE"
                  placeholderTextColor={INK_MUTED}
                  autoCapitalize="characters"
                  style={{
                    ...inputBase,
                    marginTop: 8,
                    borderColor: confirm === 'DELETE' ? ROSE : HAIRLINE,
                  }}
                />
                <Pressable
                  disabled={confirm !== 'DELETE'}
                  onPress={() => {
                    onDelete?.();
                    onClose();
                  }}
                  style={{
                    marginTop: 14,
                    paddingVertical: 14,
                    borderRadius: 14,
                    alignItems: 'center',
                    backgroundColor: confirm === 'DELETE' ? ROSE : HAIRLINE,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Delete my account"
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: confirm === 'DELETE' ? '#fff' : INK_MUTED,
                    }}
                  >
                    Delete my account
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onClose}
                  style={{ marginTop: 8, paddingVertical: 12, alignItems: 'center' }}
                  accessibilityRole="button"
                  accessibilityLabel="Keep my account"
                >
                  <Text
                    style={{ fontSize: 13.5, fontWeight: '600', color: INK }}
                  >
                    Keep my account
                  </Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
  );
}

function TextAreaBody({
  editor,
  value,
  onChangeText,
  onSave,
}: {
  editor: Extract<FieldEditorConfig, { type: 'textarea' }>;
  value: string;
  onChangeText: (s: string) => void;
  onSave: () => void;
}) {
  const remaining = editor.max - (value?.length ?? 0);
  return (
    <>
      <TextInput
        autoFocus
        multiline
        value={value}
        onChangeText={onChangeText}
        maxLength={editor.max}
        placeholder={editor.placeholder}
        placeholderTextColor={INK_MUTED}
        style={{
          ...inputBase,
          borderColor: BRAND,
          minHeight: 96,
          textAlignVertical: 'top',
          lineHeight: 21,
        }}
      />
      <Text
        style={{
          textAlign: 'right',
          fontSize: 11,
          marginTop: 6,
          color: remaining < 20 ? AMBER : INK_MUTED,
          fontVariant: ['tabular-nums'],
        }}
      >
        {remaining}
      </Text>
      <PrimaryButton label="Save" onPress={onSave} />
    </>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        marginTop: 16,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        backgroundColor: disabled ? HAIRLINE : danger ? ROSE : BRAND,
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: '700',
          color: disabled ? INK_MUTED : '#fff',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function editorHint(editor: FieldEditorConfig): string | undefined {
  return 'hint' in editor ? editor.hint : undefined;
}
