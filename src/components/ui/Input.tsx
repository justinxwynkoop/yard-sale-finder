import { forwardRef, useState } from 'react';
import {
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

export type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerClassName?: string;
  inputClassName?: string;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    hint,
    error,
    leftIcon,
    rightIcon,
    containerClassName = '',
    inputClassName = '',
    onFocus,
    onBlur,
    style,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View className={['w-full', containerClassName].filter(Boolean).join(' ')}>
      {label ? (
        <Text className="mb-1.5 text-sm font-medium text-zinc-700">{label}</Text>
      ) : null}
      <View
        className={[
          'flex-row rounded-xl border bg-white px-3',
          // Height lives on the CONTAINER (not the TextInput) so items-center
          // can vertically center an unsized input — otherwise single-line
          // text sits at the top of the field on iOS.
          rest.multiline ? 'items-start py-2.5' : 'h-11 items-center',
          error
            ? 'border-red-500'
            : focused
            ? 'border-brand'
            : 'border-zinc-300',
        ].join(' ')}
      >
        {leftIcon ? (
          <View className={rest.multiline ? 'mr-2 mt-0.5' : 'mr-2'}>
            {leftIcon}
          </View>
        ) : null}
        <TextInput
          ref={ref}
          // No `text-base` here: that class injects lineHeight:24, which on
          // iOS pushes single-line text toward the top of the box. Set the
          // font size via style with NO lineHeight so the line centers.
          className={['flex-1 text-zinc-900', inputClassName]
            .filter(Boolean)
            .join(' ')}
          style={[{ fontSize: 16, paddingVertical: 0 }, style]}
          placeholderTextColor="#a1a1aa"
          textAlignVertical={rest.multiline ? 'top' : 'center'}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {rightIcon ? <View className="ml-2">{rightIcon}</View> : null}
      </View>
      {error ? (
        <Text className="mt-1 text-xs text-red-600">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-zinc-500">{hint}</Text>
      ) : null}
    </View>
  );
});
