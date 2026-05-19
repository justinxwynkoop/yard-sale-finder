import { Pressable, PressableProps, Text } from 'react-native';

export type ChipProps = Omit<PressableProps, 'children'> & {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
  className?: string;
};

export function Chip({
  label,
  active = false,
  size = 'md',
  className = '',
  ...rest
}: ChipProps) {
  const padding = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <Pressable
      className={[
        'rounded-full border',
        padding,
        active
          ? 'bg-zinc-900 border-zinc-900 active:bg-zinc-800'
          : 'bg-white border-zinc-200 active:bg-zinc-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <Text
        className={[
          textSize,
          'font-medium',
          active ? 'text-white' : 'text-zinc-700',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
