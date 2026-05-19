import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  Text,
  View,
} from 'react-native';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
  textClassName?: string;
  fullWidth?: boolean;
};

const containerByVariant: Record<Variant, string> = {
  primary: 'bg-brand active:bg-brand-600',
  secondary: 'bg-zinc-100 active:bg-zinc-200',
  outline: 'bg-white border border-zinc-200 active:bg-zinc-50',
  ghost: 'bg-transparent active:bg-zinc-100',
  destructive: 'bg-red-600 active:bg-red-700',
};

const textByVariant: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-zinc-900',
  outline: 'text-zinc-900',
  ghost: 'text-zinc-900',
  destructive: 'text-white',
};

const containerBySize: Record<Size, string> = {
  sm: 'h-9 px-3 rounded-lg',
  md: 'h-12 px-4 rounded-xl',
  lg: 'h-14 px-6 rounded-2xl',
};

const textBySize: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-base',
};

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    leftIcon,
    rightIcon,
    className = '',
    textClassName = '',
    fullWidth = false,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      ref={ref}
      disabled={isDisabled}
      className={[
        'flex-row items-center justify-center',
        containerByVariant[variant],
        containerBySize[size],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-50' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === 'primary' || variant === 'destructive' ? '#fff' : '#18181b'
          }
        />
      ) : (
        <>
          {leftIcon ? <View className="mr-2">{leftIcon}</View> : null}
          <Text
            className={[
              'font-semibold',
              textByVariant[variant],
              textBySize[size],
              textClassName,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {children}
          </Text>
          {rightIcon ? <View className="ml-2">{rightIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
});
