import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Body, Button, Card, Field, Muted, Title } from '../components/ui';
import { useAuth } from '../store/AuthContext';
import { useColors } from '../store/ThemeContext';
import { ApiError } from '../api/client';
import { space } from '../theme';

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

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
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your name';
    if (!isEmail(form.email.trim())) next.email = 'Enter a valid email';
    if (form.phone.replace(/\D/g, '').length < 7) next.phone = 'Enter a valid phone number';
    if (form.password.length < 6) next.password = 'Password must be at least 6 characters';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
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
        style={{ flex: 1, padding: space.lg, justifyContent: 'center' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Title>Create account</Title>
        <Muted style={{ marginTop: 6 }}>Join FadeRoom in under a minute.</Muted>

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
            label="Phone"
            value={form.phone}
            onChangeText={set('phone')}
            keyboardType="phone-pad"
            placeholder="+961 …"
            error={errors.phone}
          />
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
