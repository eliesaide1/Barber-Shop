import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Body, Button, Card, Field, Logo, Muted, Row, Title } from '../components/ui';
import { DateOfBirthField } from '../components/DateOfBirthField';
import { Icon } from '../components/Icon';
import { useAuth } from '../store/AuthContext';
import { useColors } from '../store/ThemeContext';
import { useT } from '../store/CopyContext';
import { ApiError } from '../api/client';
import { checkVerification, startVerification } from '../api/verification';
import type { Provider } from '../api/social';
import {
  VISIT_FREQUENCIES,
  dateOfBirthError,
  frequencyLabel,
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
  const t = useT();
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
        <Muted style={{ fontSize: 11.5 }}>{t('auth.orWithEmail', 'or with an email')}</Muted>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
      </View>
    </View>
  );
}

function Brand() {
  const c = useColors();
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space.xl }}>
      <Logo size={48} cornerRadius={14} />
      <View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>VIA Barber House</Text>
        <Muted>{t('auth.tagline', 'Sharp cuts. No waiting.')}</Muted>
      </View>
    </View>
  );
}

export function LoginScreen() {
  const c = useColors();
  const t = useT();
  const nav = useNavigation<any>();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <Title>{t('auth.welcomeTitle', 'Welcome back')}</Title>
        <Muted style={{ marginTop: 6 }}>
          {t('auth.welcomeSubtitle', 'Sign in to book a chair and collect your stamps.')}
        </Muted>

        <ProviderButtons onError={(message) => setErrors({ form: message })} />

        <Card style={{ marginTop: space.xl }}>
          <Field
            label={t('auth.email', 'Email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={errors.email}
            style={{ marginTop: 0 }}
          />
          <Field
            label={t('auth.password', 'Password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            error={errors.password}
          />
          {!!errors.form && (
            <Text style={{ color: c.danger, fontSize: 12.5, marginTop: 10 }}>{errors.form}</Text>
          )}
          <Button
            title={t('auth.signIn', 'Sign in')}
            onPress={submit}
            loading={busy}
            style={{ marginTop: space.xl }}
          />
        </Card>

        <Pressable onPress={() => nav.navigate('Register')} style={{ marginTop: space.xl, alignItems: 'center' }}>
          <Body>
            {t('auth.newHere', 'New here?')}{' '}
            <Text style={{ color: c.accentInk, fontWeight: '700' }}>
              {t('auth.createAccount', 'Create an account')}
            </Text>
          </Body>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * A way back that does not depend on reaching the bottom of the form.
 *
 * Sign-up is long enough to scroll, and the "Already have one? Sign in" link
 * sits under the last field — so somebody who opened this by mistake had to
 * scroll past every question to get out of it. The arrow stays put above the
 * scroll instead.
 */
function AuthHeader({ onBack }: { onBack: () => void }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
      }}
    >
      <Pressable
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? c.surface : 'transparent',
        })}
      >
        <Icon name="back" size={22} color={c.text} />
      </Pressable>
    </View>
  );
}

export function RegisterScreen() {
  const c = useColors();
  const t = useT();
  const nav = useNavigation<any>();
  const { register, config } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '', password: '' });
  const [frequency, setFrequency] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  /* The proof that the number answered. Held here rather than sent straight on,
     because the form is still being filled in when it arrives — and cleared if
     the number is edited afterwards, or it would vouch for the old one. */
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [proof, setProof] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) => {
    /* Editing the proven field throws the proof away — it vouches for what was
       typed when it was issued, and the server will refuse it against anything
       else anyway. Better to show that here than at the end. */
    if (k === verifyField) {
      setSent(false);
      setProof(null);
      setCode('');
    }
    setForm((f) => ({ ...f, [k]: v }));
  };

  /* Which field has to be proven, and therefore which one clears the proof when
     it is edited. The shop can switch this while somebody is mid-form. */
  const channel = config?.verification?.channel ?? 'whatsapp';
  const verifyField = channel === 'email' ? 'email' : 'phone';
  const verifyValue = channel === 'email' ? form.email.trim() : form.phone.trim();
  const needsCode = Boolean(config?.verification?.required) && !proof;

  const sendCode = async () => {
    const bad =
      channel === 'email' ? !isEmail(verifyValue) : verifyValue.replace(/\D/g, '').length < 7;
    if (bad) {
      setErrors((e) => ({
        ...e,
        [verifyField]: channel === 'email' ? 'Enter a valid email' : 'Enter a valid phone number',
      }));
      return;
    }
    setBusy(true);
    try {
      const res = await startVerification(channel, verifyValue);
      /* The shop may have switched verification off between the app reading the
         config and somebody reaching this button. */
      if (!res.required) setProof('not-required');
      else setSent(true);
      setErrors((e) => ({ ...e, [verifyField]: '', form: '' }));
    } catch (err) {
      setErrors((e) => ({ ...e, form: err instanceof ApiError ? err.message : 'Could not send the code' }));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setBusy(true);
    try {
      const res = await checkVerification(channel, verifyValue, code.trim());
      setProof(res.verificationToken ?? 'not-required');
      setErrors((e) => ({ ...e, code: '', form: '' }));
    } catch (err) {
      setErrors((e) => ({
        ...e,
        code: err instanceof ApiError ? err.message : 'Could not check the code',
      }));
    } finally {
      setBusy(false);
    }
  };

  /* Register is always pushed from Login, so going back is the right move — it
     keeps whatever was typed there. `navigate` is the fallback for the case
     where there is no history to pop, which would otherwise do nothing. */
  const toLogin = () => (nav.canGoBack() ? nav.goBack() : nav.navigate('Login'));

  const submit = async () => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your name';
    if (!isEmail(form.email.trim())) next.email = 'Enter a valid email';
    if (form.phone.replace(/\D/g, '').length < 7) next.phone = 'Enter a valid phone number';

    const dobError = dateOfBirthError(form.dob);
    if (dobError) next.dateOfBirth = dobError;
    if (!frequency) next.visitFrequencyWeeks = 'Pick how often you usually get cut';
    if (form.password.length < 6) next.password = 'Password must be at least 6 characters';
    if (needsCode) {
      next[verifyField] = channel === 'email' ? 'Verify this email first' : 'Verify this number first';
    }

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
        ...(proof && proof !== 'not-required' ? { verificationToken: proof } : {}),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? { form: err.message });
      }
    } finally {
      setBusy(false);
    }
  };

  /* Drawn once and placed under whichever field it proves — a code box sitting
     under the email while the number is what needs verifying is the kind of
     thing people stare at rather than report. */
  const verifyStep = (
    <>
        {Boolean(config?.verification?.required) && !proof && (
          <View style={{ marginTop: space.sm }}>
            {!sent ? (
              <>
                <Muted>
                  {t(
                    'auth.verifyHint',
                    'We’ll send a code to this number on WhatsApp to check it’s yours.',
                  )}
                </Muted>
                <Button
                  title={t('auth.sendCode', 'Send me a code')}
                  variant="secondary"
                  compact
                  onPress={sendCode}
                  loading={busy}
                  style={{ marginTop: space.sm }}
                />
              </>
            ) : (
              <>
                <Field
                  label={t(
                      channel === 'email' ? 'auth.codeEmail' : 'auth.code',
                      channel === 'email' ? 'Code from your email' : 'Code from WhatsApp',
                    )}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  placeholder="123456"
                  error={errors.code}
                  style={{ marginTop: 0 }}
                />
                <Row style={{ gap: space.sm, marginTop: space.sm }}>
                  <Button
                    title={t('auth.confirmCode', 'Confirm')}
                    compact
                    onPress={confirmCode}
                    loading={busy}
                    disabled={code.trim().length < 4}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={t('auth.resendCode', 'Send again')}
                    variant="ghost"
                    compact
                    onPress={sendCode}
                    style={{ flex: 1 }}
                  />
                </Row>
              </>
            )}
          </View>
        )}
        {Boolean(proof) && proof !== 'not-required' && (
          <Muted style={{ marginTop: space.sm, color: c.ok }}>
            {t(
                channel === 'email' ? 'auth.emailVerified' : 'auth.numberVerified',
                channel === 'email' ? '✓ Email verified' : '✓ Number verified',
              )}
          </Muted>
        )}
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <AuthHeader onBack={toLogin} />
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
        <Title>{t('auth.registerTitle', 'Create account')}</Title>
        <Muted style={{ marginTop: 6 }}>
          {t(
            'auth.registerSubtitle',
            'Your artist keeps this on file — it is how they know you before you sit down.',
          )}
        </Muted>

        <ProviderButtons onError={(message) => setErrors({ form: message })} />

        <Card style={{ marginTop: space.xl }}>
          <Field label={t('auth.fullName', 'Full name')} value={form.name} onChangeText={set('name')} error={errors.name} style={{ marginTop: 0 }} />
          <Field
            label={t('auth.email', 'Email')}
            value={form.email}
            onChangeText={set('email')}
            autoCapitalize="none"
            keyboardType="email-address"
            error={errors.email}
          />
          {channel === 'email' && verifyStep}
          <Field
            label={t('auth.mobile', 'Mobile number')}
            value={form.phone}
            onChangeText={set('phone')}
            keyboardType="phone-pad"
            placeholder="+961 …"
            error={errors.phone}
          />

          {channel !== 'email' && verifyStep}

          <DateOfBirthField
            value={form.dob}
            onChange={(v: string) => set('dob')(v)}
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
            label={t('auth.password', 'Password')}
            value={form.password}
            onChangeText={set('password')}
            secureTextEntry
            placeholder="Min. 6 characters"
            error={errors.password}
          />
          {!!errors.form && <Text style={{ color: c.danger, fontSize: 12.5, marginTop: 10 }}>{errors.form}</Text>}
          <Button
            title={t('auth.createAccount', 'Create an account')}
            onPress={submit}
            loading={busy}
            style={{ marginTop: space.xl }}
          />
        </Card>

        <Pressable onPress={toLogin} style={{ marginTop: space.xl, alignItems: 'center' }}>
          <Body>
            {t('auth.alreadyHaveOne', 'Already have one?')}{' '}
            <Text style={{ color: c.accentInk, fontWeight: '700' }}>{t('auth.signIn', 'Sign in')}</Text>
          </Body>
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
