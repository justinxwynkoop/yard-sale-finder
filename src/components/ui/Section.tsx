import { Text, View, ViewProps } from 'react-native';

export type SectionProps = ViewProps & {
  title?: string;
  className?: string;
};

export function Section({ title, children, className = '', ...rest }: SectionProps) {
  return (
    <View className={['mt-6', className].filter(Boolean).join(' ')} {...rest}>
      {title ? (
        <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
