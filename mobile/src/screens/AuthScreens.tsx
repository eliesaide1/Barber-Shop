import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Body, Button, Card, Field, Muted, Title } from '../components/ui';
import { useAuth } from '../store/AuthContext';
import { useColors } from '../store/ThemeContext';
import { ApiError } from '../api/client';
import type { Provider } from '../api/social';
import {
  VISIT_FREQUENCIES,
  dateOfBirthError,
  frequencyLabel,
  maskDate,
  toIsoDate,
} from '../lib/clientDetails';
import { radius, space } from '../theme';

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/**
 * Google and Apple, when this shop and this build both offer them.
 *
 * Shown above the form on both screens on purpose: it is the same button either
 * way — the server decides whether a provider account is a sign-in or a sign-up
 * — so making somebody first choose which of the two they are doing would be
 * asking a question the app can answer itself.
 */
function ProviderButtons({ onError }: { onError: (message: string) => void }) {
  const c = useColors();
  const { providers, signInWith } = useAuth();
  const [busy, setBusy] = useState<Provider | null>(null);

  const shown: { provider: Provider; label: string; glyph: string }[] = [
    ...(providers.google ? [{ provider: 'google' as const, label: 'Continue with Google', glyph: 'G' }] : []),
    ...(providers.apple ? [{ provider: 'apple' as const, label: 'Continue with Apple', glyph: '' }] : []),
  ];
  if (!shown.length) return null;

  const go = async (provider: Provider) => {
    setBusy(provider);
    try {
      await signInWith(provider);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'That sign-in did not finish. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ marginTop: space.xl }}>
      {shown.map((s) => (
        <Pressable
          key={s.provider}
          onPress={busy ? undefined : () => go(s.provider)}
          accessibilityRole="button"
          accessibilityLabel={s.label}
          accessibilityState={{ disabled: !!busy }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.md,
            paddingVertical: 14,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.surface,
            marginBottom: space.sm,
            opacity: busy && busy !== s.provider ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 17, color: c.text }}>{s.glyph}</Text>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>
            {busy === s.provider ? 'Just a moment…' : s.label}
          </Text>
        </Pressable>
      ))}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
        <Muted style={{ fontSize: 11.5 }}>or with an email</Muted>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
      </View>
    </View>
  );
}

function Brand() {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space.xl }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 22, color: c.onAccent }}>✂</Text>
      </View>
      <View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>FadeRoom</Text>
        <Muted>Sharp cuts. No waiting.</Muted>
      </View>
    </View>
  );
}

export function LoginScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('elie@faderoom.app');
  const [password, setPassword] = useState('password1');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!isEmail(email.trim())) next.email = 'Enter a valid email';
    if (password.length < 6) next.password = 'Password must be at least 6 characters';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Could not sign in' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1, padding: space.lg, justifyContent: 'center' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Brand />
        <Title>Welcome back</Title>
        <Muted style={{ marginTop: 6 }}>Sign in to book a chair and collect your stamps.</Muted>

        <ProviderButtons onError={(message) => setErrors({ form: message })} />

        <Card style={{ marginTop: space.xl }}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={errors.email}
            style={{ marginTop: 0 }}
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            error={errors.password}
          />
          {!!errors.form && (
            <Text style={{ color: c.danger, fontSize: 12.5, marginTop: 10 }}>{errors.form}</Text>
          )}
          <Button title="Sign in" onPress={submit} loading={busy} style={{ marginTop: space.xl }} />
        </Card>

        <Pressable onPress={() => nav.navigate('Register')} style={{ marginTop: space.xl, alignItems: 'center' }}>
          <Body>
            New here? <Text style={{ color: c.accentInk, fontWeight: '700' }}>Create an account</Text>
          </Body>
        </Pressable>

        <Muted style={{ textAlign: 'center', marginTop: space.xl }}>
          Seeded demo login — elie@faderoom.app · password1
        </Muted>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function RegisterScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '', password: '' });
  const [frequency, setFrequency] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your name';
    if (!isEmail(form.email.trim())) next.email = 'Enter a valid email';
    if (form.phone.replace(/\D/g, '').length < 7) next.phone = 'Enter a valid phone number';

    const dobError = dateOfBirthError(form.dob);
    if (dobError) next.dateOfBirth = dobError;
    if (!frequency) next.visitFrequencyWeeks = 'Pick how often you usually get cut';
    if (form.password.length < 6) next.password = 'Password must be at least 6 characters';

    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        dateOfBirth: toIsoDate(form.dob) as string,
        visitFrequencyWeeks: frequency as number,
        password: form.password,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? { form: err.message });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* The form no longer fits a phone at rest, and a field you cannot
            scroll to is a field nobody fills in. `handled` so a tap on a
            frequency chip lands first time rather than only dismissing the
            keyboard. */}
        <ScrollView
          contentContainerStyle={{ padding: space.lg, flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
        <Title>Create account</Title>
        <Muted style={{ marginTop: 6 }}>
          Your artist keeps this on file — it is how they know you before you sit down.
        </Muted>

        <ProviderButtons onError={(message) => setErrors({ form: message })} />

        <Card style={{ marginTop: space.xl }}>
          <Field label="Full name" value={form.name} onChangeText={set('name')} error={errors.name} style={{ marginTop: 0 }} />
          <Field
            label="Email"
            value={form.email}
            onChangeText={set('email')}
            autoCapitalize="none"
            keyboardType="email-address"
            error={errors.email}
          />
          <Field
            label="Mobile number"
            value={form.phone}
            onChangeText={set('phone')}
            keyboardType="phone-pad"
            placeholder="+961 …"
            error={errors.phone}
          />
          <Field
            label="Date of birth"
            value={form.dob}
            /* Masked as they type, so the format is shown rather than asked for. */
            onChangeText={(v: string) => set('dob')(maskDate(v))}
            keyboardType="number-pad"
            placeholder="DD/MM/YYYY"
            maxLength={10}
            error={errors.dateOfBirth}
          />

          <Text style={{ fontSize: 12.5, color: c.muted, fontWeight: '600', marginTop: space.md }}>
            How often do you get cut?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 8 }}>
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

          <Field
            label="Password"
            value={form.password}
            onChangeText={set('password')}
            secureTextEntry
            placeholder="Min. 6 characters"
            error={errors.password}
          />
          {!!errors.form && <Text style={{ color: c.danger, fontSize: 12.5, marginTop: 10 }}>{errors.form}</Text>}
          <Button title="Create account" onPress={submit} loading={busy} style={{ marginTop: space.xl }} />
        </Card>

        <Pressable onPress={() => nav.goBack()} style={{ marginTop: space.xl, alignItems: 'center' }}>
          <Body>
            Already have one? <Text style={{ color: c.accentInk, fontWeight: '700' }}>Sign in</Text>
          </Body>
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
