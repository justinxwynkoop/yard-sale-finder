import React, { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

type Mode = 'date' | 'time';

export type DateTimeFieldProps = {
  label: string;
  mode: Mode;
  /** ISO date 'YYYY-MM-DD' for date, 'HH:MM' for time */
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  placeholder?: string;
  min?: Date;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function fromString(value: string, mode: Mode): Date {
  if (!value) return new Date();
  if (mode === 'date') {
    const [y, m, d] = value.split('-').map((s) => parseInt(s, 10));
    if (!y) return new Date();
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }
  const [h, mm] = value.split(':').map((s) => parseInt(s, 10));
  const d = new Date();
  d.setHours(h ?? 0, mm ?? 0, 0, 0);
  return d;
}

function toString(date: Date, mode: Mode) {
  if (mode === 'date') {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )}`;
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function format(value: string, mode: Mode) {
  if (!value) return '';
  if (mode === 'date') {
    const d = fromString(value, mode);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
  // time
  const d = fromString(value, mode);
  return d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DateTimeField({
  label,
  mode,
  value,
  onChange,
  hint,
  placeholder,
  min,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(fromString(value, mode));

  const handleAndroidChange = (event: DateTimePickerEvent, date?: Date) => {
    setOpen(false);
    if (event.type === 'set' && date) {
      onChange(toString(date, mode));
    }
  };

  const handleIOSDone = () => {
    setOpen(false);
    onChange(toString(tempDate, mode));
  };

  const display = value ? format(value, mode) : placeholder ?? 'Select…';
  const isPlaceholder = !value;
  const iconName = mode === 'date' ? 'calendar-outline' : 'time-outline';

  return (
    <View className="w-full">
      <Text className="mb-1.5 text-sm font-medium text-zinc-700">{label}</Text>
      <Pressable
        onPress={() => {
          setTempDate(fromString(value, mode));
          setOpen(true);
        }}
        className="h-11 flex-row items-center rounded-xl border border-zinc-300 bg-white px-3 active:bg-zinc-50"
      >
        <Ionicons name={iconName} size={18} color="#71717A" />
        <Text
          className={[
            'ml-2 flex-1 text-base',
            isPlaceholder ? 'text-zinc-400' : 'text-zinc-900',
          ].join(' ')}
        >
          {display}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#A1A1AA" />
      </Pressable>
      {hint ? (
        <Text className="mt-1 text-xs text-zinc-500">{hint}</Text>
      ) : null}

      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={tempDate}
          mode={mode}
          minimumDate={min}
          onChange={handleAndroidChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable
            className="flex-1 justify-end bg-black/40"
            onPress={() => setOpen(false)}
          >
            <Pressable
              onPress={() => undefined}
              className="rounded-t-3xl bg-white pb-8 pt-4"
            >
              <View className="mb-2 flex-row items-center justify-between px-5">
                <Pressable onPress={() => setOpen(false)}>
                  <Text className="text-base text-zinc-500">Cancel</Text>
                </Pressable>
                <Text className="text-base font-semibold text-zinc-900">
                  {label}
                </Text>
                <Pressable onPress={handleIOSDone}>
                  <Text className="text-base font-semibold text-brand">
                    Done
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempDate}
                mode={mode}
                display="spinner"
                minimumDate={min}
                onChange={(_, d) => d && setTempDate(d)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
