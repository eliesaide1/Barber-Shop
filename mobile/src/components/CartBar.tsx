import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Muted } from './ui';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import { useColors } from '../store/ThemeContext';
import { useT } from '../store/CopyContext';
import { useDialog } from '../store/DialogContext';
import { basketEnquiry, openWhatsApp, shopWhatsApp } from '../lib/whatsapp';
import { radius, space } from '../theme';

/**
 * The basket, pinned to the bottom of whatever you are looking at.
 *
 * There is no checkout behind it and no payment anywhere in the app: tapping
 * through hands the basket to the shop on WhatsApp and the conversation
 * continues there. So this is not a step on the way to a till — it is the
 * whole of the ordering interface, which is why it follows you across the
 * shelf rather than waiting on a cart screen nobody visits.
 *
 * Counts items rather than money. Prices are not published to the app, so
 * there is no total to show; the number that matters to somebody halfway down
 * the shelf is how much they have picked up.
 */
export function CartBar({ onEmpty }: { onEmpty?: () => void } = {}) {
  const c = useColors();
  const t = useT();
  const cart = useCart();
  const { config } = useAuth();
  const { alert } = useDialog();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  if (!cart.lines.length) return null;

  /* One noun, used by both the label and the spoken description — they said
     different things when each pluralised on its own. */
  const noun = cart.count === 1 ? 'item' : 'items';

  const finish = async () => {
    const number = shopWhatsApp(config);
    if (!number) {
      await alert({
        title: 'No number to send to',
        message: 'The shop has not published a WhatsApp number yet. Please call instead.',
        icon: '💬',
      });
      return;
    }

    setBusy(true);
    const opened = await openWhatsApp(number, basketEnquiry(cart.lines, config));
    setBusy(false);

    if (!opened) {
      await alert({
        title: 'WhatsApp did not open',
        message: 'Install WhatsApp, or call the shop to place your order.',
        icon: '💬',
      });
      return;
    }

    /* The basket is left alone. Nothing has been confirmed — the shop still has
       to answer — and clearing it here would mean somebody who tapped by
       mistake, or whose message never sent, comes back to an empty shelf. */
    onEmpty?.();
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        /* Sits directly on the tab bar inside the tabs, and on the home
           indicator outside them — so the inset is only added when there is no
           tab bar underneath to have already cleared it. */
        paddingBottom: space.md + insets.bottom * 0.5,
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.line,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Body style={{ fontWeight: '800' }}>
          {cart.count} {noun}
        </Body>
        <Muted style={{ marginTop: 2 }}>
          {t('basket.hint', 'The shop will quote you on WhatsApp')}
        </Muted>
      </View>

      <Pressable
        onPress={busy ? undefined : finish}
        accessibilityRole="button"
        accessibilityLabel={`Send ${cart.count} ${noun} to the shop on WhatsApp`}
        style={({ pressed }) => ({
          backgroundColor: c.accent,
          borderRadius: radius.md,
          paddingVertical: 14,
          paddingHorizontal: space.xl,
          opacity: busy ? 0.5 : 1,
          transform: [{ scale: pressed && !busy ? 0.98 : 1 }],
        })}
      >
        <Text style={{ color: c.onAccent, fontWeight: '800', fontSize: 15.5 }}>
          {t('basket.finished', 'Finished')}
        </Text>
      </Pressable>
    </View>
  );
}
