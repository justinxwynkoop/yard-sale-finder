import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View, Text, TextInput, Platform } from 'react-native';

const BRAND = '#1F4D3A';
const INK = '#171513';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';

export type OtpStatus = 'idle' | 'verifying' | 'error' | 'success';
export type OtpInputHandle = { focus: () => void; blur: () => void };

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  length?: number;
  status?: OtpStatus;
  editable?: boolean;
  autoFocus?: boolean;
};

/**
 * Six (or N) code boxes driven by one real TextInput layered on top.
 *
 * Two subtleties this gets right (both bit us with the naive version):
 *  - PASTE: the input is hidden via transparent text/selection colors, NOT
 *    `opacity: 0`. iOS won't show the long-press "Paste" menu on a fully
 *    transparent view, so opacity:0 silently breaks paste.
 *  - RE-FOCUS: the TextInput itself is the touch target (not a Pressable
 *    wrapper). Tapping a real TextInput always reopens the keyboard, even
 *    when RN still thinks it's focused after the user swiped the keyboard
 *    down — a Pressable calling focus() is a no-op in that state.
 */
export const OtpInput = forwardRef<OtpInputHandle, Props>(function OtpInput(
  { value, onChangeText, length = 6, status = 'idle', editable = true, autoFocus = true },
  ref,
) {
  const inputRef = useRef<TextInput>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    }),
    [],
  );

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [autoFocus]);

  const borderColor = (filled: boolean, active: boolean) => {
    if (status === 'error') return ROSE;
    if (status === 'success') return BRAND;
    if (active || filled) return BRAND;
    return HAIRLINE;
  };

  return (
    <View style={{ alignSelf: 'stretch' }}>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
        {Array.from({ length }).map((_, i) => {
          const ch = value[i];
          const active = i === value.length && status !== 'verifying';
          return (
            <View
              key={i}
              style={{
                width: 46,
                height: 56,
                borderRadius: 12,
                backgroundColor: '#fff',
                borderWidth: 2,
                borderColor: borderColor(!!ch, active),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {ch ? (
                <Text style={{ fontSize: 24, fontWeight: '700', color: INK }}>
                  {ch}
                </Text>
              ) : active ? (
                <View
                  style={{
                    width: 2,
                    height: 24,
                    borderRadius: 2,
                    backgroundColor: BRAND,
                  }}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Real input layered over the boxes. Transparent text/selection (not
          opacity:0) keeps the iOS paste menu and reliable tap-to-focus. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        maxLength={length}
        editable={editable}
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        caretHidden
        selectionColor="transparent"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          color: 'transparent',
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
});
