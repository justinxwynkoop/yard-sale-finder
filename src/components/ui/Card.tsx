import { View, ViewProps } from 'react-native';

export type CardProps = ViewProps & {
  className?: string;
  elevation?: 'none' | 'sm' | 'md' | 'lg';
};

const elevations = {
  none: '',
  sm: 'shadow-sm',
  md: 'shadow',
  lg: 'shadow-lg',
};

export function Card({
  className = '',
  elevation = 'sm',
  children,
  ...rest
}: CardProps) {
  return (
    <View
      className={[
        'rounded-2xl border border-zinc-100 bg-white',
        elevations[elevation],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </View>
  );
}
