import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const INK_300 = '#C7C1B0';
const HAIRLINE = '#E5DECC';

export function PostSection({
  step,
  done,
  active,
  title,
  subtitle,
  children,
}: {
  step?: number;
  done?: boolean;
  active?: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        marginTop: 12,
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 18,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {typeof step === 'number' && (
          <StepCircle step={step} done={done} active={active} />
        )}
        <Text
          style={{
            fontSize: 17,
            fontWeight: '700',
            color: INK,
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Text>
      </View>
      {subtitle ? (
        <Text
          style={{
            marginTop: 4,
            marginLeft: typeof step === 'number' ? 30 : 0,
            marginBottom: 14,
            fontSize: 13,
            color: INK_MUTED,
          }}
        >
          {subtitle}
        </Text>
      ) : (
        <View style={{ height: 12 }} />
      )}
      <View
        style={{ marginLeft: typeof step === 'number' ? 30 : 0 }}
      >
        {children}
      </View>
    </View>
  );
}

function StepCircle({
  step,
  done,
  active,
}: {
  step: number;
  done?: boolean;
  active?: boolean;
}) {
  const bg = done ? BRAND : '#fff';
  const border = done ? BRAND : active ? BRAND : INK_300;
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        borderColor: border,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
      }}
    >
      {done ? (
        <Ionicons name="checkmark" size={12} color="#fff" />
      ) : (
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: active ? BRAND : INK_MUTED,
          }}
        >
          {step}
        </Text>
      )}
    </View>
  );
}

export function PostProgressBar({
  steps,
  activeIdx,
  dones,
}: {
  steps: number;
  activeIdx: number;
  dones: boolean[];
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 10,
      }}
    >
      {Array.from({ length: steps }).map((_, i) => {
        const isDone = dones[i];
        const isActive = i === activeIdx;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              marginRight: i === steps - 1 ? 0 : 4,
              borderRadius: 99,
              backgroundColor: isDone
                ? BRAND
                : isActive
                  ? 'rgba(31,77,58,0.55)'
                  : HAIRLINE,
            }}
          />
        );
      })}
    </View>
  );
}
