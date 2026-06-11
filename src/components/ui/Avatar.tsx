import { Text, View } from 'react-native';
import { Image } from 'expo-image';

type Size = 'sm' | 'md' | 'lg' | 'xl';

export type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  /** Token size. Ignored when `px` is set. */
  size?: Size;
  /** Explicit pixel size — wins over `size` if both are provided. */
  px?: number;
  className?: string;
};

const sizeMap: Record<Size, { box: string; text: string; px: number }> = {
  sm: { box: 'h-8 w-8', text: 'text-xs', px: 32 },
  md: { box: 'h-12 w-12', text: 'text-base', px: 48 },
  lg: { box: 'h-20 w-20', text: 'text-2xl', px: 80 },
  xl: { box: 'h-28 w-28', text: 'text-4xl', px: 112 },
};

export function Avatar({
  uri,
  name,
  size = 'md',
  px,
  className = '',
}: AvatarProps) {
  const s = sizeMap[size];
  // Allow the v3 redesign to use arbitrary pixel sizes (40, 56, 64,
  // 84) without adding new tokens. When px is supplied, we bypass the
  // NativeWind class entirely and drive everything off the explicit
  // dimension.
  const dim = px ?? s.px;
  // Two-letter initials (first letter of first + last name token), to
  // match the design's "WG" / "HR" style avatars. Falls back to a
  // single letter for mononyms and '?' when empty.
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (parts[0]?.[0] ?? '?').toUpperCase();

  if (uri) {
    return (
      <Image
        source={{ uri }}
        className={px ? '' : ['rounded-full bg-zinc-100', s.box, className]
          .filter(Boolean)
          .join(' ')}
        style={{ width: dim, height: dim, borderRadius: dim / 2 }}
      />
    );
  }

  return (
    <View
      style={
        px
          ? {
              width: dim,
              height: dim,
              borderRadius: dim / 2,
              backgroundColor: '#1F4D3A',
              alignItems: 'center',
              justifyContent: 'center',
            }
          : undefined
      }
      className={
        px
          ? undefined
          : [
              'items-center justify-center rounded-full bg-brand',
              s.box,
              className,
            ]
              .filter(Boolean)
              .join(' ')
      }
    >
      <Text
        style={
          px
            ? { color: '#fff', fontWeight: '700', fontSize: dim * 0.38 }
            : undefined
        }
        className={
          px ? undefined : ['font-bold text-white', s.text].join(' ')
        }
      >
        {initials}
      </Text>
    </View>
  );
}
