import React, { useEffect, useRef } from 'react';
import { Animated, Image, PanResponder, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../store/ThemeContext';
import { absoluteUrl } from '../config';
import { radius, space } from '../theme';
import type { AppNotification, NotificationKind } from '../types';

/* A booking answer and a shop advert should not look the same at a glance —
   one is something you were waiting for. */
export const KIND_GLYPH: Record<NotificationKind, string> = {
  message: '✂',
  booking: '🗓',
  order: '🛍',
  loyalty: '🎁',
};

interface Props {
  notification: AppNotification;
  onPress: () => void;
  onDismiss: () => void;
}

/**
 * The in-app heads-up banner — what a push notification looks like while the
 * app is already open.
 *
 * A toast was the wrong shape for this: it sits at the bottom, carries one line
 * and cannot be acted on. A message from the shop has a title, a body and
 * somewhere to go, so it gets the same treatment the OS would give it — top of
 * the screen, tappable, and swipe-up to dismiss.
 */
export function NotificationBanner({ notification, onPress, onDismiss }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = (then?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      onDismiss();
      then?.();
    });
  };

  useEffect(() => {
    Animated.spring(slide, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
    }).start();

    timer.current = setTimeout(() => hide(), 5200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification.id]);

  /* Swipe up to dismiss, the way the system shade behaves. */
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -24) hide();
      },
    }),
  ).current;

  return (
    <Animated.View
      {...pan.panHandlers}
      style={{
        position: 'absolute',
        top: insets.top + 6,
        left: space.md,
        right: space.md,
        zIndex: 900,
        opacity: slide,
        transform: [
          { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] }) },
        ],
      }}
    >
      <Pressable
        onPress={() => hide(onPress)}
        accessibilityRole="button"
        accessibilityLabel={`${notification.title}. ${notification.body}`}
        style={({ pressed }) => ({
          backgroundColor: c.surface,
          borderColor: c.accent,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: space.md,
          flexDirection: 'row',
          gap: space.md,
          alignItems: 'flex-start',
          elevation: 10,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          transform: [{ scale: pressed ? 0.99 : 1 }],
        })}
      >
        {/* A photograph when there is one — "they want this cut again" is
            answered by seeing it, not by a glyph standing in for it. */}
        {notification.image ? (
          <Image
            source={{ uri: absoluteUrl(notification.image) }}
            style={{
              width: 38,
              height: 38,
              borderRadius: radius.sm + 2,
              backgroundColor: c.surface3,
            }}
          />
        ) : (
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: radius.sm + 2,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 19, color: c.onAccent }}>
              {KIND_GLYPH[notification.kind] ?? KIND_GLYPH.message}
            </Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
              {(notification.createdByName || 'VIA Barber House').toUpperCase()}
            </Text>
            <Text style={{ color: c.muted, fontSize: 11 }}>now</Text>
          </View>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 14, marginTop: 2 }} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={{ color: c.muted, fontSize: 12.5, marginTop: 2, lineHeight: 17 }} numberOfLines={2}>
            {notification.body}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
