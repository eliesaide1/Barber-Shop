import React, { useEffect, useRef } from 'react';
import { Animated, BackHandler, Modal, Pressable, Text, View } from 'react-native';
import { useColors } from '../store/ThemeContext';
import { radius, space } from '../theme';

export type DialogTone = 'default' | 'danger';

export interface DialogProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Emoji shown in a tinted disc above the title. */
  icon?: string;
  tone?: DialogTone;
  confirmLabel?: string;
  /** Omit for a single-button dialog (an acknowledgement rather than a choice). */
  cancelLabel?: string;
  /** Whether the backdrop and the hardware back button dismiss it. */
  dismissible?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The app's own dialog, replacing React Native's `Alert`.
 *
 * `Alert` renders the platform's own chrome, which ignores the theme entirely —
 * a bright system box in the middle of a dark screen, with no way to show the
 * shop's typography or colour. This is the same surface language as the rest of
 * the app: the card, the palette, the button shapes.
 *
 * Actions are stacked rather than side by side, with the affirmative on top.
 * On a destructive choice that puts the greatest visual weight on the option
 * that cannot be undone, and keeps "get me out of here" a full thumb-width away.
 */
export function Dialog({
  visible,
  title,
  message,
  icon,
  tone = 'default',
  confirmLabel = 'OK',
  cancelLabel,
  dismissible = true,
  onConfirm,
  onCancel,
}: DialogProps) {
  const c = useColors();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 240,
      mass: 0.7,
    }).start();
  }, [visible, anim]);

  /* Android's hardware back should behave like tapping Cancel, not like
     nothing happening. Modal's onRequestClose covers it, but only while the
     modal owns the back button — so guard on `visible`. */
  useEffect(() => {
    if (!visible || !dismissible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [visible, dismissible, onCancel]);

  const accent = tone === 'danger' ? c.danger : c.accent;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => dismissible && onCancel()}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: c.overlay,
          alignItems: 'center',
          justifyContent: 'center',
          padding: space.xl,
        }}
        onPress={() => dismissible && onCancel()}
      >
        {/* Swallows taps so pressing the card itself never dismisses it. */}
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 340 }}>
          <Animated.View
            accessibilityViewIsModal
            accessibilityRole="alert"
            style={{
              backgroundColor: c.surface,
              borderColor: c.line,
              borderWidth: 1,
              borderRadius: radius.xl,
              padding: space.xl,
              alignItems: 'center',
              opacity: anim,
              transform: [
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
              elevation: 12,
              shadowColor: '#000',
              shadowOpacity: 0.35,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
            }}
          >
            {!!icon && (
              <View
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  backgroundColor: tone === 'danger' ? 'rgba(192,57,43,0.12)' : c.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: space.md,
                }}
              >
                <Text style={{ fontSize: 27 }}>{icon}</Text>
              </View>
            )}

            <Text
              style={{
                fontSize: 19,
                fontWeight: '800',
                color: c.text,
                textAlign: 'center',
                letterSpacing: -0.2,
              }}
            >
              {title}
            </Text>

            {!!message && (
              <Text
                style={{
                  fontSize: 13.5,
                  color: c.muted,
                  textAlign: 'center',
                  lineHeight: 20,
                  marginTop: space.sm,
                }}
              >
                {message}
              </Text>
            )}

            <View style={{ alignSelf: 'stretch', marginTop: space.xl, gap: space.sm + 2 }}>
              <DialogButton
                label={confirmLabel}
                onPress={onConfirm}
                background={tone === 'danger' ? 'transparent' : accent}
                border={accent}
                color={tone === 'danger' ? c.danger : c.onAccent}
              />
              {!!cancelLabel && (
                <DialogButton
                  label={cancelLabel}
                  onPress={onCancel}
                  background={c.surface2}
                  border={c.line}
                  color={c.text}
                />
              )}
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DialogButton({
  label,
  onPress,
  background,
  border,
  color,
}: {
  label: string;
  onPress: () => void;
  background: string;
  border: string;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: background,
        borderColor: border,
        borderWidth: 1,
        borderRadius: radius.md,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: pressed ? 0.98 : 1 }],
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}
