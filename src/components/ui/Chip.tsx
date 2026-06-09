import { Pressable, PressableProps, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type ChipTone = 'default' | 'active' | 'tonal';

export type ChipProps = Omit<PressableProps, 'children'> & {
  label: string;
  tone?: ChipTone;
  /** Legacy `active` prop. When true, maps to `tone='active'`. */
  active?: boolean;
  size?: 'sm' | 'md';
  icon?: IoniconName;
  className?: string;
};

const TONE_BG: Record<ChipTone, string> = {
  default: 'bg-white border border-hairline',
  active: 'bg-brand border border-brand',
  tonal: 'bg-brand-soft border border-brand-soft',
};

const TONE_TEXT: Record<ChipTone, string> = {
  default: 'text-ink',
  active: 'text-white',
  tonal: 'text-brand',
};

const TONE_ICON: Record<ChipTone, string> = {
  default: '#171513',
  active: '#FFFFFF',
  tonal: '#1F4D3A',
};

export function Chip({
  label,
  tone,
  active,
  size = 'md',
  icon,
  className = '',
  ...rest
}: ChipProps) {
  const resolved: ChipTone = tone ?? (active ? 'active' : 'default');
  const padding = size === 'sm' ? 'px-3 py-1.5' : 'px-3 py-1.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-[12px]';

  return (
    <Pressable
      className={[
        'flex-row items-center rounded-full',
        padding,
        TONE_BG[resolved],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {icon ? (
        <View className="mr-1.5">
          <Ionicons name={icon} size={11} color={TONE_ICON[resolved]} />
        </View>
      ) : null}
      <Text
        className={[textSize, 'font-semibold', TONE_TEXT[resolved]].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
