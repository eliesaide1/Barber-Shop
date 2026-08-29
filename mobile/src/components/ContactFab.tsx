import React, { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Linking, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../store/AuthContext';
import { useDialog } from '../store/DialogContext';
import { useColors } from '../store/ThemeContext';
import { WhatsAppIcon } from './WhatsAppIcon';
import { radius } from '../theme';
import type { Appointment, Artist } from '../types';

/**
 * "Message us" — fixed bottom right, over everything.
 *
 * ── Why this is not the template machinery ───────────────────────────────────
 *
 * A client opening WhatsApp to ask a question is *them* starting the
 * conversation, which is the one case Meta imposes nothing on. No approved
 * template, no opt-in, no credentials: it is a link. It works today, on a build
 * with no WhatsApp set up at all.
 *
 * ── Which artist ─────────────────────────────────────────────────────────────
 *
 * "Contact the artist" only means something if the app knows which one. It asks
 * in the order a person would: whoever you have a booking with, then whoever you
 * usually go to, then the shop itself. An artist who has not published a number
 * hands the conversation to the shop rather than dead-ending — and if there is
 * no number anywhere, the button does not appear at all. A contact button that
 * does nothing is worse than no contact button.
 */

/* Above the tab bar (68) rather than on top of it, so it never eats a tab. */
const TAB_BAR = 68;
const SIZE = 54;

export function ContactFab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, config } = useAuth();
  const { showError } = useDialog();

  /* Both are already loaded for other screens, so this costs a cache hit rather
     than a request in the common case. */
  const { data: appointments } = useApi<Appointment[]>(user ? '/appointments' : null);
  const { data: artists } = useApi<Artist[]>(user ? '/artists' : null);

  /**
   * A ring that swells out of the button and fades, twice a cycle, with a long
   * pause between.
   *
   * Long, because a button that pulses without stopping is one people learn to
   * ignore in a day and find irritating by the end of the week — the point is
   * to be noticed once by somebody who has not spotted it yet, not to keep
   * asking. Native-driven, so it costs nothing on the JS thread while somebody
   * scrolls the shelf past it.
   */
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;

    /* Somebody who has asked their phone to calm down is not asking this
       button for an exception. */
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;

      const ripple = (v: Animated.Value, delay: number) =>
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(1200 - delay),
        ]);

      /* Two rings rather than one, the second half a beat behind: a single ring
         is a flicker somebody catches only if they happen to be looking at it,
         and the whole point is to be seen by somebody who is not. The button
         swells slightly with them, because a still button inside a moving halo
         reads as a graphic rather than as something to press. */
      loop = Animated.loop(
        Animated.parallel([
          ripple(ring1, 0),
          ripple(ring2, 600),
          Animated.sequence([
            Animated.timing(breathe, {
              toValue: 1,
              duration: 800,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(breathe, {
              toValue: 0,
              duration: 800,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.delay(1200),
          ]),
        ]),
      );
      loop.start();
    });

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [ring1, ring2, breathe]);

  /* Drawn as an outline rather than a filled disc. A solid circle expanding
     behind a solid button of the same colour is a soft blur nobody registers;
     an edge travelling outwards is a thing the eye follows. */
  const ringStyle = (v: Animated.Value) => ({
    position: 'absolute' as const,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2.5,
    borderColor: '#25D366',
    opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.75, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
  });

  const target = useMemo(() => {
    const byId = new Map((artists ?? []).map((a) => [a.id, a]));

    /* The artist you are actually about to see. */
    const next = (appointments ?? [])
      .filter(
        (a) =>
          ['pending', 'confirmed'].includes(a.status) &&
          new Date(a.startsAt).getTime() > Date.now(),
      )
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];

    const preferredId = user?.preferences?.preferredArtist ?? null;
    const artist =
      (next && byId.get(next.artist?.id)) || (preferredId ? byId.get(preferredId) : undefined);

    if (artist?.whatsappNumber) {
      return { number: artist.whatsappNumber, name: artist.displayName.split(' ')[0] };
    }
    if (config?.contact?.whatsapp) {
      return { number: config.contact.whatsapp, name: config.shop.name };
    }
    return null;
  }, [appointments, artists, user, config]);

  if (!target) return null;

  const open = async () => {
    /* wa.me rather than the whatsapp:// scheme: it opens the app when installed
       and a web page when not, and needs no `queries` entry in the manifest to
       be checkable on Android 11+. */
    const text = encodeURIComponent(config?.contact?.greeting ?? '');
    const url = `https://wa.me/${target.number}${text ? `?text=${text}` : ''}`;
    try {
      await Linking.openURL(url);
    } catch {
      showError('Couldn’t open WhatsApp. Is it installed?', {
        title: `Message ${target.name}`,
        icon: '💬',
      });
    }
  };

  return (
    <View
      /* `box-none` so the padding around the button never swallows a tap meant
         for the screen behind it. */
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 16,
        bottom: TAB_BAR + insets.bottom + 12,
        zIndex: 800,
      }}
    >
      {/* Behind the button and untouchable, so a ring never eats the tap it
          exists to attract. */}
      <Animated.View pointerEvents="none" style={ringStyle(ring1)} />
      <Animated.View pointerEvents="none" style={ringStyle(ring2)} />

      <Animated.View
        style={{
          transform: [
            { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
          ],
        }}
      >
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Message ${target.name} on WhatsApp`}
        style={({ pressed }) => ({
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          /* WhatsApp's own green. A brand-coloured button here would be asking
             people to read a label before they know what it does. */
          backgroundColor: '#25D366',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 3,
          borderColor: c.bg,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <WhatsAppIcon size={28} />
      </Pressable>
      </Animated.View>
    </View>
  );
}

export const CONTACT_FAB_CLEARANCE = SIZE + 24;
