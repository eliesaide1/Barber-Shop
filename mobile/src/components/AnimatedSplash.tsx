import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

/* The launch storyboard draws this same logo, 200pt square, centred on black.
   Matching those numbers exactly is the whole trick: the static screen the OS
   shows before any JavaScript runs and the first frame this renders are
   identical, so the handoff between them is invisible and the animation looks
   like it started on its own. */
const LOGO = 200;
const HOLD_MS = 620;
const FADE_MS = 420;

/**
 * The splash, continued.
 *
 * iOS launch screens are static by definition — the OS renders the storyboard
 * before the app has a runtime to animate anything with. So the motion has to
 * live here, on top of the app, and hand back to it when it is done.
 *
 * Drawn rather than played from a video file: at 200pt the logo stays crisp on
 * every screen density from one asset, there is no decoder to spin up on the
 * slowest part of launch, and it costs no native dependency.
 */
export function AnimatedSplash({ onDone }: { onDone?: () => void }) {
  const [gone, setGone] = useState(false);
  const scale = useRef(new Animated.Value(0.92)).current;
  const logoIn = useRef(new Animated.Value(0)).current;
  const cover = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      /* Someone who has asked the system to reduce motion gets the same screen
         without the movement — it still fades, so the handoff is not a jump. */
      let reduced = false;
      try {
        reduced = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        reduced = false;
      }
      if (cancelled) return;

      const settle = reduced
        ? Animated.timing(logoIn, { toValue: 1, duration: 200, useNativeDriver: true })
        : Animated.parallel([
            Animated.timing(logoIn, {
              toValue: 1,
              duration: 460,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(scale, {
              toValue: 1,
              damping: 14,
              stiffness: 130,
              mass: 0.9,
              useNativeDriver: true,
            }),
          ]);

      Animated.sequence([
        settle,
        Animated.delay(HOLD_MS),
        Animated.timing(cover, {
          toValue: 0,
          duration: FADE_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        /* Unmounted, not just transparent: a full-screen view left in the tree
           would keep swallowing every touch behind it. */
        setGone(true);
        onDone?.();
      });
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [scale, logoIn, cover, onDone]);

  if (gone) return null;

  return (
    <Animated.View style={[styles.cover, { opacity: cover }]} pointerEvents="none">
      <View style={styles.centre}>
        <Animated.Image
          source={require('../assets/logo.png')}
          resizeMode="contain"
          style={{
            width: LOGO,
            height: LOGO,
            opacity: logoIn,
            transform: [{ scale }],
          }}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* Black, to match the storyboard and the artwork's own background. Not the
     theme's background: this is on screen before the theme means anything, and
     a light-mode user would otherwise see the panel flash white underneath. */
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 9999,
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
