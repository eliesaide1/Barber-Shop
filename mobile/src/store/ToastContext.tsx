import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useColors } from './ThemeContext';
import { radius } from '../theme';

interface ToastContextValue {
  /**
   * A brief confirmation that something worked.
   *
   * There is deliberately no `error` here. A toast is the wrong shape for a
   * failure: it disappears on a timer, so the one message the user actually
   * needed to read is the one most likely to be missed, and it offers nothing
   * to acknowledge. Failures go through `useDialog().showError` instead.
   */
  toast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string) => {
      setMessage(text);
      if (timer.current) clearTimeout(timer.current);

      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
          ({ finished }) => finished && setMessage(null),
        );
      }, 2400);
    },
    [opacity],
  );

  const value = useMemo(() => ({ toast: show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message !== null && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            {
              opacity,
              backgroundColor: c.name === 'dark' ? '#f4efe6' : '#221d17',
              borderLeftColor: c.accent,
              transform: [
                { translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
              ],
            },
          ]}
        >
          <Text style={[styles.text, { color: c.name === 'dark' ? '#0d0c0b' : '#f7f3ed' }]}>
            {message}
          </Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 100,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  text: { fontSize: 13.5, fontWeight: '700' },
});

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
