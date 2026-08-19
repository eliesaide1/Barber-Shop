import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Field, Muted, Screen, Title } from '../components/ui';
import { DateOfBirthField } from '../components/DateOfBirthField';
import { useAuth } from '../store/AuthContext';
import { useColors } from '../store/ThemeContext';
import { useDialog } from '../store/DialogContext';
import { api, ApiError } from '../api/client';
import {
  VISIT_FREQUENCIES,
  dateOfBirthError,
  frequencyLabel,
  toIsoDate,
} from '../lib/clientDetails';
import { radius, space } from '../theme';

/**
 * The gap Google and Apple leave behind.
 *
 * Signing up with an email asks for a mobile number, a date of birth and how
 * often somebody cuts, and refuses to create the account without them. A
 * provider knows a name and an email and will never know the rest — so an
 * account made that way arrives with the shop's client card half empty.
 *
 * This is where it gets finished, and it stands in front of the app rather than
 * beside it: a client book that is only sometimes filled in is one no artist
 * will trust, and "I'll do it later" is how it stays half empty. There is no
 * skip, but there is a way out — signing out — because trapping somebody in a
 * form is not the same as asking them for something.
 */
export function CompleteProfileScreen() {
  const c = useColors();
  const { user, refreshUser, signOut } = useAuth();
  const { confirm, showError } = useDialog();

  const [form, setForm] = useState({ phone: user?.phone ?? '', dob: '' });
  const [frequency, setFrequency] = useState<number | null>(user?.visitFrequencyWeeks ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const next: Record<string, string> = {};
    if (form.phone.replace(/\D/g, '').length < 7) next.phone = 'Enter a valid phone number';
    const dobError = dateOfBirthError(form.dob);
    if (dobError) next.dateOfBirth = dobError;
    if (!frequency) next.visitFrequencyWeeks = 'Pick how often you usually get cut';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await api.patch('/auth/me', {
        phone: form.phone.trim(),
        dateOfBirth: toIsoDate(form.dob),
        visitFrequencyWeeks: frequency,
      });
      /* Re-reads `profileComplete` from the server rather than assuming it —
         the server owns that judgement, and this screen disappears on its word. */
      await refreshUser();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      showError(err instanceof ApiError ? err.message : 'Could not save that', {
        title: 'Couldn’t save your details',
        icon: '✂️',
      });
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'Your account stays as it is. You can pick this up next time you sign in.',
      icon: '👋',
      tone: 'danger',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay',
    });
    if (ok) signOut();
  };

  return (
    <Screen>
      <Title>Nearly there</Title>
      <Muted style={{ marginTop: 6 }}>
        Welcome, {user?.name?.split(' ')[0] ?? 'and thanks'}. Your artist keeps a card on every
        client — three more things and yours is done.
      </Muted>

      <Card style={{ marginTop: space.xl }}>
        <Field
          label="Mobile number"
          value={form.phone}
          onChangeText={(v: string) => setForm((f) => ({ ...f, phone: v }))}
          keyboardType="phone-pad"
          placeholder="+961 …"
          error={errors.phone}
          style={{ marginTop: 0 }}
        />
        <DateOfBirthField
          value={form.dob}
          onChange={(v: string) => setForm((f) => ({ ...f, dob: v }))}
          error={errors.dateOfBirth}
        />

        <Body style={{ fontWeight: '700', marginTop: space.lg }}>How often do you get cut?</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
          {VISIT_FREQUENCIES.map((w) => {
            const on = w === frequency;
            return (
              <Pressable
                key={w}
                onPress={() => setFrequency(w)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 13,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: on ? c.accent : errors.visitFrequencyWeeks ? c.danger : c.line,
                  backgroundColor: on ? c.accent : c.surface2,
                }}
              >
                <Text style={{ fontWeight: '700', fontSize: 12.5, color: on ? c.onAccent : c.text }}>
                  {frequencyLabel(w)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {!!errors.visitFrequencyWeeks && (
          <Text style={{ color: c.danger, fontSize: 12, marginTop: 5 }}>
            {errors.visitFrequencyWeeks}
          </Text>
        )}
      </Card>

      <Button title="Done" onPress={save} loading={busy} style={{ marginTop: space.xl }} />
      <Button title="Sign out" variant="ghost" onPress={leave} style={{ marginTop: space.md }} />
    </Screen>
  );
}
