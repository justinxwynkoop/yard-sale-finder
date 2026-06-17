import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Animated } from 'react-native';
import { SubHeader } from '../../components/SubHeader';
import { useProfile, invalidateProfile } from '../../hooks/useProfile';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

const BONE = '#F7F2E8';
const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

// Only toggles backed by a real push path are shown. Saved reminders, offers,
// weekly digest and tips have no sender yet, so they'd be misleading switches —
// hidden until those features exist.
const RADII = [5, 10, 25, 50];

/**
 * Notification preferences. Each flip persists to the profiles row
 * immediately (optimistic, rolled back on failure). The "Nearby sales"
 * toggle + radius drive the notify-new-sale edge function's proximity push;
 * Messages gates notify-new-message.
 */
export default function NotificationsScreen() {
  const { profile } = useProfile();
  const [nearby, setNearby] = useState(true);
  const [messages, setMessages] = useState(true);
  const [radius, setRadius] = useState(5);

  // Hydrate from the profile once loaded.
  useEffect(() => {
    if (!profile) return;
    setNearby(profile.notify_sales_nearby ?? true);
    setMessages(profile.notify_messages ?? true);
    setRadius(profile.nearby_radius_miles ?? 5);
  }, [profile]);

  const persist = async (patch: Record<string, unknown>, rollback: () => void) => {
    if (!profile) return;
    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', profile.id);
    if (error) {
      rollback();
      toast.error("Couldn't save preference");
      return;
    }
    invalidateProfile();
  };

  const toggleNearby = () => {
    const next = !nearby;
    setNearby(next);
    persist({ notify_sales_nearby: next }, () => setNearby(!next));
  };

  const toggleMessages = () => {
    const next = !messages;
    setMessages(next);
    persist({ notify_messages: next }, () => setMessages(!next));
  };

  const pickRadius = (mi: number) => {
    if (mi === radius) return;
    const prev = radius;
    setRadius(mi);
    persist({ nearby_radius_miles: mi }, () => setRadius(prev));
  };

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <SubHeader title="Notifications" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Sales near you */}
        <SectionLabel>Sales near you</SectionLabel>
        <Card>
          <Row
            label={`New sales within ${radius} mi`}
            sub="Ping me when a sale is posted nearby"
            on={nearby}
            onPress={toggleNearby}
            last={!nearby}
          />
          {nearby ? (
            <View
              style={{
                paddingHorizontal: 14,
                paddingBottom: 14,
                paddingTop: 4,
              }}
            >
              <Text style={{ fontSize: 11, color: INK_MUTED, marginBottom: 8 }}>
                Radius
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {RADII.map((mi) => {
                  const active = mi === radius;
                  return (
                    <Pressable
                      key={mi}
                      onPress={() => pickRadius(mi)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={{
                        flex: 1,
                        paddingVertical: 9,
                        borderRadius: 10,
                        alignItems: 'center',
                        backgroundColor: active ? BRAND : BRAND_SOFT,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '700',
                          color: active ? '#fff' : BRAND,
                        }}
                      >
                        {mi} mi
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </Card>

        {/* Activity */}
        <SectionLabel>Activity</SectionLabel>
        <Card>
          <Row label="Messages" on={messages} onPress={toggleMessages} last />
        </Card>
      </ScrollView>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function Row({
  label,
  sub,
  on,
  onPress,
  last,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: HAIRLINE,
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: INK }}>
          {label}
        </Text>
        {sub ? (
          <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 1 }}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Toggle on={on} />
    </Pressable>
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
    outputRange: [2, 18],
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
