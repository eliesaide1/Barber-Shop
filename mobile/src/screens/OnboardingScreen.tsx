import React, { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Logo, Muted, Title } from '../components/ui';
import { Icon } from '../components/Icon';
import { ONBOARDING_ART } from '../components/OnboardingArt';
import { useColors } from '../store/ThemeContext';
import { radius, space } from '../theme';

interface Slide {
  title: string;
  body: string;
}

/* Four, and in the order the app is actually used: ask for a chair, turn up
   and scan, watch the card fill, buy what your artist put in your hair. */
const SLIDES: Slide[] = [
  {
    title: 'Ask for a chair',
    body:
      'Pick a time that suits you and send it to your artist. They confirm the slot and how long your cut needs — so the book stays honest.',
  },
  {
    title: 'Scan when you arrive',
    body:
      'Your artist shows a code at the chair. Scan it and the visit is on your card before the cape is off.',
  },
  {
    title: 'Every eighth cut is on us',
    body:
      'Seven stamps, then a free one. The card lives in the app, so there is nothing to lose in a coat pocket.',
  },
  {
    title: 'Shop the shelf',
    body:
      'The pomades, oils and tonics your artist actually uses. Order in the app and collect at the shop.',
  },
];

const LAST = SLIDES.length - 1;

/**
 * The introduction, shown once per install.
 *
 * A plain paged ScrollView rather than a carousel library: four slides that
 * never change is not enough to justify a dependency, and `pagingEnabled`
 * already gives the swipe, the snap and the rubber-banding at both ends for
 * free — on both platforms, with the native feel each of them expects.
 *
 * Skip sits in the top corner throughout. It is the same destination as the
 * checkmark on the last slide — somebody who already knows the shop should not
 * have to swipe through four screens to reach the sign-in form, and a returning
 * client reinstalling the app is exactly that person.
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);

  /* Settled, not mid-drag. Reading the offset while a finger is still moving
     flickers the dots back and forth across the halfway point. */
  const onSettled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  };

  const go = (to: number) => {
    scroller.current?.scrollTo({ x: to * width, animated: true });
    setIndex(to);
  };

  const onLast = index === LAST;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      {/* The logo stays centred on the screen rather than in the space left
          over beside Skip, so it does not shift when Skip disappears. */}
      <View
        style={{
          paddingTop: space.md,
          paddingBottom: space.sm,
          paddingHorizontal: space.lg,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Logo size={40} />

        <Pressable
          onPress={onDone}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip the introduction"
          style={({ pressed }) => ({
            position: 'absolute',
            left: space.lg,
            top: space.md,
            paddingVertical: space.sm,
            paddingHorizontal: space.md,
            borderRadius: radius.pill,
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Body style={{ color: c.muted, fontWeight: '700' }}>Skip</Body>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onSettled}
        /* Android fires momentum-end unreliably when a swipe stops dead on the
           boundary, so the drag end is read as well. Both compute the same
           index from the same offset, so a double call is a no-op. */
        onScrollEndDrag={onSettled}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => {
          const Art = ONBOARDING_ART[i];
          return (
            <View
              key={slide.title}
              style={{ width, paddingHorizontal: space.xl, justifyContent: 'center' }}
              accessible
              accessibilityLabel={`${slide.title}. ${slide.body}. Step ${i + 1} of ${SLIDES.length}.`}
            >
              <View style={{ height: 260, marginBottom: space.xl }}>
                <Art />
              </View>

              <Title style={{ fontSize: 26, textAlign: 'center' }}>{slide.title}</Title>
              <Muted style={{ fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginTop: space.md }}>
                {slide.body}
              </Muted>
            </View>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: space.xl, paddingBottom: space.lg }}>
        {/* Where you are, and a way back to a slide you swiped past too fast. */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginBottom: space.xl }}>
          {SLIDES.map((slide, i) => (
            <Pressable
              key={slide.title}
              onPress={() => go(i)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Step ${i + 1} of ${SLIDES.length}`}
              accessibilityState={{ selected: i === index }}
              style={{
                width: i === index ? 26 : 8,
                height: 8,
                borderRadius: radius.pill,
                backgroundColor: i === index ? c.accent : c.line,
              }}
            />
          ))}
        </View>

        {/* One control that changes its job on the last slide: forward while
            there is more to read, and the checkmark that finishes once there
            is not. Same place, same size, so it never moves under a thumb. */}
        <Pressable
          onPress={() => (onLast ? onDone() : go(index + 1))}
          accessibilityRole="button"
          accessibilityLabel={onLast ? 'Get started' : 'Next'}
          style={({ pressed }) => ({
            height: 58,
            borderRadius: onLast ? radius.md : radius.pill,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: space.sm,
            alignSelf: onLast ? 'stretch' : 'center',
            width: onLast ? undefined : 58,
            transform: [{ scale: pressed ? 0.98 : 1 }],
            shadowColor: c.accent,
            shadowOpacity: 0.35,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 5,
          })}
        >
          {onLast ? (
            <>
              <Icon name="check" color={c.onAccent} size={22} active />
              <Body style={{ color: c.onAccent, fontWeight: '800', fontSize: 16 }}>Get started</Body>
            </>
          ) : (
            /* The one arrow in the set points back, so it is mirrored rather
               than drawn a second time. */
            <View style={{ transform: [{ scaleX: -1 }] }}>
              <Icon name="back" color={c.onAccent} size={24} active />
            </View>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
