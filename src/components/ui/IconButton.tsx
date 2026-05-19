import { Pressable, PressableProps, View } from 'react-native';

type Variant = 'solid' | 'glass' | 'ghost' | 'brand';
type Size = 'sm' | 'md' | 'lg';

export type IconButtonProps = Omit<PressableProps, 'children'> & {
  icon: React.ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
};

const sizes: Record<Size, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
};

const variants: Record<Variant, string> = {
  solid: 'bg-white border border-zinc-200 active:bg-zinc-50 shadow',
  glass: 'bg-white/90 active:bg-white shadow',
  ghost: 'bg-transparent active:bg-zinc-100',
  brand: 'bg-brand active:bg-brand-600 shadow-lg',
};

export function IconButton({
  icon,
  variant = 'solid',
  size = 'md',
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <Pressable
      className={[
        'items-center justify-center rounded-full',
        sizes[size],
        variants[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <View pointerEvents="none">{icon}</View>
    </Pressable>
  );
}
