import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

type Mode = 'date' | 'time';

export type DateTimeFieldProps = {
  label: string;
  mode: Mode;
  /** 'YYYY-MM-DD' for date, 'HH:MM' for time */
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
  const d = fromString(value, mode);
  if (mode === 'date') {
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

  const display = value ? format(value, mode) : placeholder ?? 'Select…';
  const isPlaceholder = !value;
  const iconName = mode === 'date' ? 'calendar-outline' : 'time-outline';

  const openPicker = () => {
    setTempDate(fromString(value, mode));
    setOpen(true);
  };

  // ---- Android: native dialog ----
  // The dialog mounts only while open and reports back via a single callback.
  const handleAndroidChange = (event: DateTimePickerEvent, date?: Date) => {
    setOpen(false);
    if (event.type === 'set' && date) {
      onChange(toString(date, mode));
    }
  };

  // ---- iOS: bottom-sheet Modal with spinner ----
  const handleIOSConfirm = () => {
    onChange(toString(tempDate, mode));
    setOpen(false);
  };

  return (
    <View style={{ width: '100%' }}>
      <Text className="mb-1.5 text-sm font-medium text-zinc-700">{label}</Text>

      <Pressable
        onPress={openPicker}
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

      {/* ANDROID: render the native dialog only while open */}
      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={tempDate}
          mode={mode}
          minimumDate={min}
          onChange={handleAndroidChange}
        />
      )}

      {/* iOS: bottom-sheet Modal. Backdrop and sheet are SIBLINGS — no
          Pressable wraps the picker, so the wheel gesture isn't eaten. */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <View style={styles.modalRoot}>
            {/* Backdrop — tap to dismiss */}
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setOpen(false)}
            />
            {/* Sheet — plain View so picker gestures work */}
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Pressable
                  onPress={() => setOpen(false)}
                  hitSlop={8}
                >
                  <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
                <Text style={styles.sheetTitle}>{label}</Text>
                <Pressable onPress={handleIOSConfirm} hitSlop={8}>
                  <Text style={styles.done}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempDate}
                mode={mode}
                display="spinner"
                minimumDate={min}
                themeVariant="light"
                onChange={(_, d) => {
                  if (d) setTempDate(d);
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    paddingTop: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#18181B',
  },
  cancel: {
    fontSize: 16,
    color: '#71717A',
  },
  done: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F97316',
  },
});
