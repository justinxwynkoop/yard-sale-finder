import React from 'react';
import { ScrollView } from 'react-native';
import { Chip } from './Chip';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toDateString(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, days: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Returns the next Saturday from today (or today, if today is Saturday). */
function nextSaturday(): Date {
  const now = new Date();
  const dow = now.getDay(); // 0 = Sunday
  const delta = (6 - dow + 7) % 7;
  return addDays(now, delta);
}

export type DateRangePresetsProps = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  onApply: (next: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  }) => void;
};

type Preset = {
  key: string;
  label: string;
  build: () => {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  };
};

const PRESETS: Preset[] = [
  {
    key: 'today',
    label: 'Today',
    build: () => {
      const d = toDateString(new Date());
      return { startDate: d, endDate: d, startTime: '08:00', endTime: '14:00' };
    },
  },
  {
    key: 'tomorrow',
    label: 'Tomorrow',
    build: () => {
      const d = toDateString(addDays(new Date(), 1));
      return { startDate: d, endDate: d, startTime: '08:00', endTime: '14:00' };
    },
  },
  {
    key: 'saturday',
    label: 'This Sat',
    build: () => {
      const d = toDateString(nextSaturday());
      return { startDate: d, endDate: d, startTime: '08:00', endTime: '14:00' };
    },
  },
  {
    key: 'weekend',
    label: 'This weekend',
    build: () => {
      const sat = nextSaturday();
      const sun = addDays(sat, 1);
      return {
        startDate: toDateString(sat),
        endDate: toDateString(sun),
        startTime: '08:00',
        endTime: '14:00',
      };
    },
  },
];

export function DateRangePresets({
  startDate,
  endDate,
  startTime,
  endTime,
  onApply,
}: DateRangePresetsProps) {
  const isActive = (p: Preset) => {
    const next = p.build();
    return (
      next.startDate === startDate &&
      next.endDate === endDate &&
      next.startTime === startTime &&
      next.endTime === endTime
    );
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6 }}
    >
      {PRESETS.map((p) => (
        <Chip
          key={p.key}
          label={p.label}
          size="sm"
          active={isActive(p)}
          onPress={() => onApply(p.build())}
        />
      ))}
    </ScrollView>
  );
}
