import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import DateTimePicker, { DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useColors } from '../store/ThemeContext';
import { useT } from '../store/CopyContext';
import { radius, space } from '../theme';
import { toIsoDate, toTypedDate } from '../lib/clientDetails';
import { Button } from './ui';

/**
 * A birthday, taken from the platform's own calendar rather than typed.
 *
 * It speaks the same `DD/MM/YYYY` string the masked text field did, in and out,
 * so every caller's validation and submit path is untouched — the change is in
 * how the date is chosen, not in what a screen holds or sends.
 *
 * Why the OS picker at all: a typed birthday can be `31/02/1994`, or the year
 * mistyped by a decade, and both only surface after `dateOfBirthError` runs. A
 * calendar cannot produce an impossible day, and the bounds below make an
 * impossible *birthday* unreachable too. The validator still runs — it is what
 * catches an empty field, and the server checks regardless.
 *
 * The two platforms are deliberately not made to match. iOS wants the picker
 * held in a sheet the user dismisses; Android's is already a dialog and stacking
 * it inside a modal gives you two layers of chrome. Each gets its own.
 */
export function DateOfBirthField({
  label = 'Date of birth',
  value,
  onChange,
  error,
  style,
}: {
  label?: string;
  /** `DD/MM/YYYY`, or empty when nothing has been picked yet. */
  value: string;
  onChange: (typed: string) => void;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const t = useT();
  const [open, setOpen] = useState(false);

  const iso = toIsoDate(value);
  /* Parsed from the parts rather than `new Date(iso)`, which reads a bare
     YYYY-MM-DD as UTC and lands on the previous day west of Greenwich. */
  const selected = iso
    ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
    : null;

  const today = new Date();
  /* Opening on today means scrolling back three decades to reach a plausible
     birthday. Nobody's default guess is right, but a young adult is a far
     shorter journey from most of them than this morning is. */
  const initial = selected ?? new Date(today.getFullYear() - 25, today.getMonth(), today.getDate());
  const earliest = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());

  /* v9 split the old single `onChange` into a selection and a dismissal, and
     still accepting the old one costs a deprecation warning on every render of
     the picker — which is once per opening of the calendar. */
  const onPick = (_event: DateTimePickerChangeEvent, picked: Date) => {
    /* Android's dialog dismisses itself once a date is chosen; iOS's inline
       calendar stays up and is committed by the sheet's own button. */
    if (Platform.OS === 'android') setOpen(false);
    onChange(toTypedDate(picked));
  };

  return (
    <View style={[{ marginTop: space.md }, style]}>
      <Text style={{ fontSize: 12.5, color: c.muted, fontWeight: '600', marginBottom: 7 }}>
        {label}
      </Text>

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        /* The value, not the placeholder — a screen reader landing on an unset
           field should hear that it is unset, not read out the format. */
        accessibilityValue={{ text: value || 'not set' }}
        style={{
          backgroundColor: c.surface2,
          borderColor: error ? c.danger : c.line,
          borderWidth: 1,
          borderRadius: radius.sm + 3,
          paddingHorizontal: 14,
          paddingVertical: 13,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 15, color: value ? c.text : c.muted }}>
          {value || 'Pick your date of birth'}
        </Text>
        <Text style={{ fontSize: 15 }}>🗓️</Text>
      </Pressable>

      {!!error && <Text style={{ color: c.danger, fontSize: 12, marginTop: 5 }}>{error}</Text>}

      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={initial}
          mode="date"
          /* Android's calendar dialog, with the year header that makes a
             birthday reachable without swiping through 300 months. */
          display="calendar"
          maximumDate={today}
          minimumDate={earliest}
          onValueChange={onPick}
          onDismiss={() => setOpen(false)}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable
            onPress={() => setOpen(false)}
            style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' }}
          >
            {/* Swallows the tap so pressing the sheet does not close it. */}
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: c.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                padding: space.lg,
                paddingBottom: space.xxl,
              }}
            >
              <Text
                style={{
                  fontSize: 12.5,
                  color: c.muted,
                  fontWeight: '600',
                  marginBottom: space.sm,
                }}
              >
                {label}
              </Text>
              <DateTimePicker
                value={initial}
                mode="date"
                /* The full calendar, whose header year opens a list — the
                   compact default would put a second sheet inside this one. */
                display="inline"
                maximumDate={today}
                minimumDate={earliest}
                onValueChange={onPick}
                themeVariant={c.name === 'dark' ? 'dark' : 'light'}
              />
              <Button
                title={t('dob.done', 'Done')}
                onPress={() => {
                  /* An untouched calendar fires nothing, so the date shown on
                     opening has to be committed here or a straight open-and-
                     Done would leave the field empty. */
                  if (!value) onChange(toTypedDate(initial));
                  setOpen(false);
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
