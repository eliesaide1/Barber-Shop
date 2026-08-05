import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useColors } from '../store/ThemeContext';
import { radius, space } from '../theme';
import { toPath } from '../lib/qr';

/* ---------------- text ---------------- */

/* All four take the full TextProps surface, so numberOfLines, accessibility
   props and the rest pass straight through to the underlying <Text>. */
type TextBlockProps = TextProps & { children: React.ReactNode };

export function Title({ children, style, ...rest }: TextBlockProps) {
  const c = useColors();
  return (
    <Text style={[{ fontSize: 21, fontWeight: '800', color: c.text, letterSpacing: -0.3 }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Heading({ children, style, ...rest }: TextBlockProps) {
  const c = useColors();
  return (
    <Text style={[{ fontSize: 15, fontWeight: '800', color: c.text }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Body({ children, style, ...rest }: TextBlockProps) {
  const c = useColors();
  return (
    <Text style={[{ fontSize: 14, color: c.text }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Muted({ children, style, ...rest }: TextBlockProps) {
  const c = useColors();
  return (
    <Text style={[{ fontSize: 12.5, color: c.muted, lineHeight: 18 }, style]} {...rest}>
      {children}
    </Text>
  );
}

/* ---------------- surfaces ---------------- */

export function Card({
  children,
  style,
  onPress,
  hero,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  hero?: boolean;
}) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: hero ? c.heroFrom : c.surface,
    borderColor: hero ? c.heroLine : c.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.75 }]}>
      {children}
    </Pressable>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: 1, backgroundColor: c.line, marginVertical: space.lg }} />;
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md }, style]}>{children}</View>;
}

export function Between({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}>
      {children}
    </View>
  );
}

/* ---------------- controls ---------------- */

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, style, compact }: ButtonProps) {
  const c = useColors();
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.accent, fg: c.onAccent, border: c.accent },
    secondary: { bg: c.surface2, fg: c.text, border: c.line },
    ghost: { bg: 'transparent', fg: c.accentInk, border: c.line },
    danger: { bg: 'transparent', fg: c.danger, border: c.danger },
  };
  const p = palette[variant];
  const off = disabled || loading;

  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingVertical: compact ? 11 : 15,
          paddingHorizontal: space.lg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          opacity: off ? 0.45 : 1,
          transform: [{ scale: pressed && !off ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={p.fg} />}
      <Text style={{ color: p.fg, fontWeight: '700', fontSize: compact ? 14 : 15.5 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  style,
  ...props
}: TextInputProps & { label?: string; error?: string | null }) {
  const c = useColors();
  return (
    <View style={{ marginTop: space.md }}>
      {label && (
        <Text style={{ fontSize: 12.5, color: c.muted, fontWeight: '600', marginBottom: 7 }}>{label}</Text>
      )}
      <TextInput
        placeholderTextColor={c.muted}
        style={[
          {
            backgroundColor: c.surface2,
            borderColor: error ? c.danger : c.line,
            borderWidth: 1,
            borderRadius: radius.sm + 3,
            paddingHorizontal: 14,
            paddingVertical: 13,
            fontSize: 15,
            color: c.text,
          },
          style,
        ]}
        {...props}
      />
      {!!error && <Text style={{ color: c.danger, fontSize: 12, marginTop: 5 }}>{error}</Text>}
    </View>
  );
}

export function Badge({
  label,
  tone = 'dim',
  style,
}: {
  label: string;
  tone?: 'gold' | 'ok' | 'warn' | 'red' | 'dim';
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const tones: Record<string, { bg: string; fg: string }> = {
    gold: { bg: c.accentSoft, fg: c.accentInk },
    ok: { bg: 'rgba(47,111,67,0.14)', fg: c.ok },
    warn: { bg: 'rgba(176,116,0,0.16)', fg: c.warn },
    red: { bg: 'rgba(192,57,43,0.12)', fg: c.danger },
    dim: { bg: c.surface3, fg: c.muted },
  };
  const t = tones[tone];
  return (
    <View style={[{ backgroundColor: t.bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 }, style]}>
      <Text style={{ color: t.fg, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  const c = useColors();
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: c.onAccent, fontWeight: '800', fontSize: size * 0.34 }}>{initials}</Text>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: c.surface2,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: radius.sm,
              backgroundColor: active ? c.accent : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: active ? c.onAccent : c.muted, fontWeight: '700', fontSize: 13 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  qty,
  max,
  onChange,
}: {
  qty: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const c = useColors();
  const btn = (label: string, to: number, off: boolean) => (
    <Pressable
      onPress={off ? undefined : () => onChange(to)}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.3 : 1 }}
      accessibilityRole="button"
      accessibilityLabel={label === '−' ? 'Remove one' : 'Add one'}
    >
      <Text style={{ color: c.text, fontSize: 19, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.surface2,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: radius.sm + 2,
        overflow: 'hidden',
      }}
    >
      {btn('−', qty - 1, false)}
      <Text style={{ minWidth: 26, textAlign: 'center', color: c.text, fontWeight: '800' }}>{qty}</Text>
      {btn('+', qty + 1, qty >= max)}
    </View>
  );
}

/* ---------------- loyalty punch card ---------------- */

export function PunchStrip({ stamps, goal }: { stamps: number; goal: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {Array.from({ length: goal }, (_, i) => {
        const on = i < stamps;
        const isGoal = i === goal - 1;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              aspectRatio: 1,
              borderRadius: 999,
              borderWidth: 2,
              borderStyle: on || isGoal ? 'solid' : 'dashed',
              borderColor: on || isGoal ? c.accent : c.line,
              backgroundColor: on ? c.accent : c.surface2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: on ? c.onAccent : isGoal ? c.accentInk : c.muted, fontWeight: '800', fontSize: 14 }}>
              {on ? (isGoal ? '🎁' : '✂') : isGoal ? '🎁' : String(i + 1)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ---------------- QR ---------------- */

/** Always dark-on-white: inverting a QR in dark mode stops scanners reading it. */
export function QRCode({ value, size = 200 }: { value: string; size?: number }) {
  const path = React.useMemo(() => toPath(value), [value]);
  if (!path) return <Muted>Nothing to encode</Muted>;
  return (
    <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: radius.lg }}>
      <Svg width={size} height={size} viewBox={`0 0 ${path.size} ${path.size}`}>
        <Rect width={path.size} height={path.size} fill="#fff" />
        <Path d={path.d} fill="#000" />
      </Svg>
    </View>
  );
}

/* ---------------- states ---------------- */

export function Empty({ icon, title, hint, action }: { icon: string; title: string; hint?: string; action?: React.ReactNode }) {
  const c = useColors();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 34 }}>
      <Text style={{ fontSize: 32 }}>{icon}</Text>
      <Text style={{ fontWeight: '700', color: c.text, marginTop: 10, fontSize: 15 }}>{title}</Text>
      {!!hint && <Muted style={{ marginTop: 6, textAlign: 'center' }}>{hint}</Muted>}
      {action && <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>{action}</View>}
    </Card>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const c = useColors();
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={c.accent} />
      <Muted style={{ marginTop: 10 }}>{label}</Muted>
    </View>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[{ padding: space.lg, paddingBottom: 40 }, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export const styles = StyleSheet.create({
  gap: { gap: space.md },
});
