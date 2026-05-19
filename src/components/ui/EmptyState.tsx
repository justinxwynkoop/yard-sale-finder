import { Text, View } from 'react-native';

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <View
      className={['flex-1 items-center justify-center px-8 py-12', className]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ? (
        <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          {icon}
        </View>
      ) : null}
      <Text className="mb-2 text-xl font-bold text-zinc-900">{title}</Text>
      {description ? (
        <Text className="mb-6 text-center text-sm leading-5 text-zinc-500">
          {description}
        </Text>
      ) : null}
      {action ? <View className="w-full max-w-xs">{action}</View> : null}
    </View>
  );
}
