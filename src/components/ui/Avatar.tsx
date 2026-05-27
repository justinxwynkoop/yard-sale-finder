import { Text, View } from 'react-native';
import { Image } from 'expo-image';

type Size = 'sm' | 'md' | 'lg' | 'xl';

export type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: Size;
  className?: string;
};

const sizeMap: Record<Size, { box: string; text: string; px: number }> = {
  sm: { box: 'h-8 w-8', text: 'text-xs', px: 32 },
  md: { box: 'h-12 w-12', text: 'text-base', px: 48 },
  lg: { box: 'h-20 w-20', text: 'text-2xl', px: 80 },
  xl: { box: 'h-28 w-28', text: 'text-4xl', px: 112 },
};

export function Avatar({ uri, name, size = 'md', className = '' }: AvatarProps) {
  const s = sizeMap[size];
  const initials = (name?.trim()?.[0] ?? '?').toUpperCase();

  if (uri) {
    return (
      <Image
        source={{ uri }}
        // expo-image doesn't pick up NativeWind className for dimensions, so
        // we supply explicit inline styles alongside the class for border-radius
        // and background. The sizeMap px value is the authoritative size.
        className={['rounded-full bg-zinc-100', s.box, className]
          .filter(Boolean)
          .join(' ')}
        style={{ width: s.px, height: s.px, borderRadius: s.px / 2 }}
      />
    );
  }

  return (
    <View
      className={[
        'items-center justify-center rounded-full bg-brand',
        s.box,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Text className={['font-bold text-white', s.text].join(' ')}>
        {initials}
      </Text>
    </View>
  );
}
