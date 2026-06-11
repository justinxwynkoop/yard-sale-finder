import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Animated } from 'react-native';
import { SubHeader } from '../../components/SubHeader';
import { useProfile, invalidateProfile } from '../../hooks/useProfile';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

type ToggleKey =
  | 'notify_sales_nearby'
  | 'notify_saved_reminders'
  | 'notify_messages'
  | 'notify_offers'
  | 'notify_weekly_digest'
  | 'notify_tips';

const ROWS: {
  key: ToggleKey;
  label: string;
  sub?: string;
  group: 'nearby' | 'activity' | 'trove';
}[] = [
  {
    key: 'notify_sales_nearby',
    label: 'New sales within 1 mi',
    sub: 'Ping me when a sale is posted nearby',
    group: 'nearby',
  },
  {
    key: 'notify_saved_reminders',
    label: 'Saved sale reminders',
    sub: 'Morning-of nudge for sales I saved',
    group: 'nearby',
  },
  { key: 'notify_messages', label: 'Messages', group: 'activity' },
  { key: 'notify_offers', label: 'Offers on my items', group: 'activity' },
  {
    key: 'notify_weekly_digest',
    label: 'Weekly weekend digest',
    sub: 'Friday roundup of nearby sales',
    group: 'trove',
  },
  { key: 'notify_tips', label: 'Tips & product news', group: 'trove' },
];

const GROUP_LABELS: Record<string, string> = {
  nearby: 'Sales near you',
  activity: 'Activity',
  trove: 'From Trove',
};

/**
 * Toggle screen for notification prefs. Persists each flip to the
 * profiles row immediately. Optimistic — the toggle moves before the
 * round-trip; rolled back if the mutation fails.
 */
export default function NotificationsScreen() {
  const { profile } = useProfile();
  const [state, setState] = useState<Record<ToggleKey, boolean>>({
    notify_sales_nearby: true,
    notify_saved_reminders: true,
    notify_messages: true,
    notify_offers: true,
    notify_weekly_digest: false,
    notify_tips: false,
  });

  // Hydrate from the profile once loaded.
  useEffect(() => {
    if (!profile) return;
    setState({
      notify_sales_nearby: profile.notify_sales_nearby ?? true,
      notify_saved_reminders: profile.notify_saved_reminders ?? true,
      notify_messages: profile.notify_messages ?? true,
      notify_offers: profile.notify_offers ?? true,
      notify_weekly_digest: profile.notify_weekly_digest ?? false,
      notify_tips: profile.notify_tips ?? false,
    });
  }, [profile]);

  const handleToggle = async (key: ToggleKey) => {
    if (!profile) return;
    const next = !state[key];
    setState((s) => ({ ...s, [key]: next }));
    const { error } = await supabase
      .from('profiles')
      .update({ [key]: next })
      .eq('id', profile.id);
    if (error) {
      setState((s) => ({ ...s, [key]: !next }));
      toast.error("Couldn't save preference");
      return;
    }
    invalidateProfile();
  };

  const renderGroup = (group: 'nearby' | 'activity' | 'trove') => {
    const rows = ROWS.filter((r) => r.group === group);
    return (
      <View key={group}>
        <SectionLabel>{GROUP_LABELS[group]}</SectionLabel>
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: HAIRLINE,
            overflow: 'hidden',
          }}
        >
          {rows.map((r, i) => (
            <Pressable
              key={r.key}
              onPress={() => handleToggle(r.key)}
              style={{
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                borderBottomColor: HAIRLINE,
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: state[r.key] }}
              accessibilityLabel={r.label}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 13.5, fontWeight: '600', color: INK }}
                >
                  {r.label}
                </Text>
                {r.sub ? (
                  <Text
                    style={{
                      fontSize: 11,
                      color: INK_MUTED,
                      marginTop: 1,
                    }}
                  >
                    {r.sub}
                  </Text>
                ) : null}
              </View>
              <Toggle on={state[r.key]} />
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader title="Notifications" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {(['nearby', 'activity', 'trove'] as const).map(renderGroup)}
      </ScrollView>
    </View>
  );
}

function Toggle({ on }: { on: boolean }) {
  // Manual animation — Animated.timing on a single shared value keeps
  // the knob position smooth without bringing in reanimated for one
  // tiny control.
  const anim = React.useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: on ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [on, anim]);
  const knobLeft = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 18], // 42 width - 21 knob - 2 padding right = 19, ~18
  });
  const bgColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [HAIRLINE, BRAND],
  });
  return (
    <Animated.View
      style={{
        width: 42,
        height: 25,
        borderRadius: 99,
        backgroundColor: bgColor,
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          width: 21,
          height: 21,
          borderRadius: 99,
          backgroundColor: '#fff',
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          left: knobLeft,
        }}
      />
    </Animated.View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: INK_MUTED,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        marginTop: 18,
        marginBottom: 8,
        marginLeft: 4,
      }}
    >
      {children}
    </Text>
  );
}
