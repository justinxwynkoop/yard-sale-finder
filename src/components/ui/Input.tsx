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
          'flex-row items-center rounded-xl border bg-white px-3',
          error
            ? 'border-red-500'
            : focused
            ? 'border-brand'
            : 'border-zinc-300',
        ].join(' ')}
      >
        {leftIcon ? <View className="mr-2">{leftIcon}</View> : null}
        <TextInput
          ref={ref}
          className={[
            'h-11 flex-1 text-base text-zinc-900',
            inputClassName,
          ]
            .filter(Boolean)
            .join(' ')}
          placeholderTextColor="#a1a1aa"
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
