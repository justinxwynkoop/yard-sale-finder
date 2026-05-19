import { Text, View } from 'react-native';

type Tone = 'neutral' | 'brand' | 'live' | 'winding' | 'ended' | 'info';

const tones: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: 'bg-zinc-100', fg: 'text-zinc-700' },
  brand: { bg: 'bg-brand-100', fg: 'text-brand-700' },
  live: { bg: 'bg-live-bg', fg: 'text-live-fg' },
  winding: { bg: 'bg-winding-bg', fg: 'text-winding-fg' },
  ended: { bg: 'bg-ended-bg', fg: 'text-ended-fg' },
  info: { bg: 'bg-blue-50', fg: 'text-blue-700' },
};

export type BadgeProps = {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
};

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className = '',
}: BadgeProps) {
  const t = tones[tone];
  return (
    <View
      className={[
        'flex-row items-center self-start rounded-full px-2.5 py-1',
        t.bg,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot ? (
        <View
          className={[
            'mr-1.5 h-1.5 w-1.5 rounded-full',
            tone === 'live'
              ? 'bg-live'
              : tone === 'winding'
              ? 'bg-winding'
              : tone === 'brand'
              ? 'bg-brand'
              : 'bg-zinc-400',
          ].join(' ')}
        />
      ) : null}
      <Text className={['text-xs font-semibold', t.fg].join(' ')}>
        {children}
      </Text>
    </View>
  );
}
