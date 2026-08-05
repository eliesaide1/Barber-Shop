import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Avatar,
  Badge,
  Between,
  Body,
  Button,
  Card,
  Empty,
  Field,
  Heading,
  Loading,
  Muted,
  PunchStrip,
  Row,
  Screen,
  Segmented,
  Title,
} from '../components/ui';
import { useApi, useSocketEvent } from '../hooks/useApi';
import { useAuth } from '../store/AuthContext';
import { useCart } from '../store/CartContext';
import { useTheme, useColors } from '../store/ThemeContext';
import { useDialog } from '../store/DialogContext';
import { useNotifications } from '../store/NotificationsContext';
import { useToast } from '../store/ToastContext';
import { api, ApiError } from '../api/client';
import { space } from '../theme';
import type { Appointment, AppNotification, LoyaltyCard, Order } from '../types';

/* ---------------- Profile ---------------- */

export function ProfileScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { user, config, signOut } = useAuth();
  const { confirm } = useDialog();
  const { preference, setPreference, name: themeName } = useTheme();
  const cart = useCart();
  const { data: card } = useApi<LoyaltyCard>('/loyalty/card');
  const { data: orders } = useApi<Order[]>('/orders');

  const stamps = card?.stamps ?? 0;
  const goal = card?.goal ?? config?.loyaltyGoal ?? 5;

  const confirmSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You’ll need to sign in again to book a chair or check in.',
      icon: '👋',
      tone: 'danger',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
    });
    if (ok) signOut();
  };

  return (
    <Screen>
      <Title>Profile</Title>

      <Card style={{ marginTop: space.lg, alignItems: 'center' }}>
        <Avatar name={user?.name ?? ''} size={84} />
        <Body style={{ fontWeight: '800', fontSize: 20, marginTop: 12 }}>{user?.name}</Body>
        <Muted style={{ marginTop: 2 }}>{user?.email}</Muted>
        {!!user?.phone && <Muted>{user.phone}</Muted>}
        <Badge label="FADEROOM CLUB" tone="gold" style={{ marginTop: 10 }} />
      </Card>

      <Heading style={{ marginTop: space.xl }}>Loyalty</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Between>
          <Body style={{ fontWeight: '700' }}>{stamps}/{goal} check-ins</Body>
          <Muted>{goal - stamps} to a free cut</Muted>
        </Between>
        <View style={{ marginTop: space.md }}>
          <PunchStrip stamps={stamps} goal={goal} />
        </View>
        <Row style={{ marginTop: space.lg, gap: space.md }}>
          <Button title="My card" variant="secondary" compact style={{ flex: 1 }} onPress={() => nav.navigate('Loyalty')} />
          <Button
            title="Scan to check in"
            compact
            style={{ flex: 1 }}
            onPress={() => nav.navigate('Tabs', { screen: 'Scan' })}
          />
        </Row>
      </Card>

      <Heading style={{ marginTop: space.xl }}>Shop</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Pressable onPress={() => nav.navigate('Orders')}>
          <Between style={{ paddingVertical: space.sm }}>
            <Muted>My orders</Muted>
            <Body>{orders?.length ?? 0} ›</Body>
          </Between>
        </Pressable>
        <Pressable onPress={() => nav.navigate('Cart')}>
          <Between style={{ paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.line }}>
            <Muted>Cart</Muted>
            <Body>{cart.count} item{cart.count === 1 ? '' : 's'} ›</Body>
          </Between>
        </Pressable>
        <Pressable onPress={() => nav.navigate('Appointments')}>
          <Between style={{ paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.line }}>
            <Muted>My appointments</Muted>
            <Body>›</Body>
          </Between>
        </Pressable>
      </Card>

      <Heading style={{ marginTop: space.xl }}>My cut preferences</Heading>
      <Card style={{ marginTop: space.sm }}>
        {[
          ['Clipper guard', user?.preferences?.clipperGuard],
          ['Beard', user?.preferences?.beard],
          ['Part', user?.preferences?.part],
          ['Notes', user?.preferences?.notes],
        ].map(([label, value], i) => (
          <Between
            key={label as string}
            style={{
              paddingVertical: space.md,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.line,
            }}
          >
            <Muted>{label}</Muted>
            <Body style={{ maxWidth: '60%', textAlign: 'right' }}>{(value as string) || '—'}</Body>
          </Between>
        ))}
      </Card>
      <Button
        title="Edit preferences"
        variant="ghost"
        onPress={() => nav.navigate('Preferences')}
        style={{ marginTop: space.md }}
      />

      <Heading style={{ marginTop: space.xl }}>Appearance</Heading>
      <View style={{ marginTop: space.sm }}>
        <Segmented
          value={preference ?? 'system'}
          onChange={(v) => setPreference(v === 'system' ? null : (v as 'light' | 'dark'))}
          options={[
            { value: 'light', label: '☀ Light' },
            { value: 'dark', label: '☾ Dark' },
            { value: 'system', label: 'Auto' },
          ]}
        />
      </View>
      <Muted style={{ marginTop: space.sm }}>
        {preference ? `Always ${preference}.` : `Following your phone — currently ${themeName}.`}
      </Muted>

      <Heading style={{ marginTop: space.xl }}>Shop</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Between><Muted>{config?.shop.name}</Muted><Body>{config?.shop.area}</Body></Between>
        <Between style={{ marginTop: space.md }}><Muted>Hours</Muted><Body>{config?.shop.hours}</Body></Between>
        <Between style={{ marginTop: space.md }}>
          <Muted>Phone</Muted>
          <Text style={{ color: c.accentInk }}>{config?.shop.phone}</Text>
        </Between>
      </Card>

      <Button title="Log out" variant="danger" onPress={confirmSignOut} style={{ marginTop: space.xl }} />
    </Screen>
  );
}

/* ---------------- Preferences editor ---------------- */

export function PreferencesScreen() {
  const nav = useNavigation<any>();
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const { showError } = useDialog();
  const [form, setForm] = useState({
    clipperGuard: user?.preferences?.clipperGuard ?? '',
    beard: user?.preferences?.beard ?? '',
    part: user?.preferences?.part ?? '',
    notes: user?.preferences?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const session = await api.patch<{ user: typeof user }>('/auth/me', { preferences: form });
      if (session.user) updateUser(session.user);
      toast('Preferences saved ✓');
      nav.goBack();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not save', {
        title: 'Couldn’t save',
        icon: '✂️',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Cut preferences</Title>
      <Muted style={{ marginTop: 2 }}>Your artist sees this before every visit.</Muted>

      <Card style={{ marginTop: space.lg }}>
        <Field
          label="Clipper guard"
          value={form.clipperGuard}
          onChangeText={(v: string) => setForm((f) => ({ ...f, clipperGuard: v }))}
          placeholder="#2 sides, scissor top"
          style={{ marginTop: 0 }}
        />
        <Field
          label="Beard"
          value={form.beard}
          onChangeText={(v: string) => setForm((f) => ({ ...f, beard: v }))}
          placeholder="Line up, keep length"
        />
        <Field
          label="Part"
          value={form.part}
          onChangeText={(v: string) => setForm((f) => ({ ...f, part: v }))}
          placeholder="Natural left"
        />
        <Field
          label="Anything your barber should know"
          value={form.notes}
          onChangeText={(v: string) => setForm((f) => ({ ...f, notes: v }))}
          placeholder="Sensitive skin — no alcohol aftershave."
          multiline
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />
      </Card>

      <Button title="Save" onPress={save} loading={busy} style={{ marginTop: space.lg }} />
    </Screen>
  );
}

/* ---------------- Appointments ---------------- */

export function AppointmentsScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { toast } = useToast();
  const { confirm, showError } = useDialog();
  const { data: appointments, loading, reload } = useApi<Appointment[]>('/appointments');

  useSocketEvent('appointment:status', () => reload(true));

  const cancel = async (a: Appointment) => {
    const ok = await confirm({
      title: 'Cancel this booking?',
      /* Say what happens to a held free cut — it's the thing worth worrying
         about, and the answer is reassuring. */
      message: a.rewardCode
        ? 'Your free cut goes straight back into your card. You can rebook any time.'
        : 'You can rebook any time.',
      icon: '🗓️',
      tone: 'danger',
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep my chair',
    });
    if (!ok) return;

    try {
      await api.post(`/appointments/${a.id}/cancel`);
      toast(a.rewardCode ? 'Cancelled · free cut back in your card' : 'Booking cancelled');
      reload(true);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not cancel', {
        title: 'Couldn’t cancel',
        icon: '🗓️',
      });
    }
  };

  if (loading && !appointments) return <Loading />;

  const upcoming = appointments?.filter(
    (a) => ['confirmed', 'pending'].includes(a.status) && new Date(a.startsAt).getTime() > Date.now(),
  ) ?? [];
  const past = appointments?.filter((a) => !upcoming.includes(a)) ?? [];

  return (
    <Screen>
      <Title>Appointments</Title>
      <Muted style={{ marginTop: 2 }}>Upcoming visits & your cut history</Muted>

      {upcoming.length === 0 ? (
        <View style={{ marginTop: space.lg }}>
          <Empty
            icon="💈"
            title="No upcoming visits"
            hint="Your chair is waiting."
            action={<Button title="Book a cut" onPress={() => nav.navigate('Tabs', { screen: 'Book' })} />}
          />
        </View>
      ) : (
        upcoming.map((a) => (
          <Card key={a.id} style={{ marginTop: space.md }}>
            <Between>
              <Badge label={a.status === 'confirmed' ? 'Confirmed' : 'Awaiting artist'} tone={a.status === 'confirmed' ? 'ok' : 'warn'} />
              <Muted>
                {new Date(a.startsAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                {new Date(a.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Muted>
            </Between>
            <Row style={{ marginTop: space.md }}>
              <Avatar name={a.artist.displayName} size={42} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '700' }}>{a.serviceName}</Body>
                <Muted style={{ marginTop: 3 }}>
                  {a.artist.displayName} · {a.artist.chair} · {a.free ? 'free 🎁' : `$${a.price}`}
                </Muted>
              </View>
              {a.free && <Badge label="FREE CUT" tone="gold" />}
            </Row>
            {!!a.rewardCode && (
              <Card style={{ marginTop: space.md, borderColor: c.accent, backgroundColor: c.accentSoft, padding: space.md }}>
                <Between>
                  <Muted>Claim code</Muted>
                  <Text style={{ color: c.text, fontWeight: '800', letterSpacing: 3 }}>{a.rewardCode}</Text>
                </Between>
                <Muted style={{ marginTop: 6, fontSize: 11 }}>
                  Your artist redeems it at the chair.
                </Muted>
              </Card>
            )}
            <Button title="Cancel booking" variant="danger" compact onPress={() => cancel(a)} style={{ marginTop: space.md }} />
          </Card>
        ))
      )}

      {past.length > 0 && (
        <>
          <Heading style={{ marginTop: space.xl }}>History</Heading>
          <Card style={{ marginTop: space.sm }}>
            {past.map((a, i) => (
              <Row
                key={a.id}
                style={{ paddingVertical: space.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}
              >
                <Avatar name={a.artist.displayName} size={38} />
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600' }}>{a.serviceName}</Body>
                  <Muted style={{ marginTop: 2 }}>
                    {a.artist.displayName} · {new Date(a.startsAt).toLocaleDateString()}
                  </Muted>
                </View>
                <Badge
                  label={a.status === 'completed' ? 'Done' : a.status === 'cancelled' ? 'Cancelled' : a.status}
                  tone={a.status === 'completed' ? 'dim' : 'red'}
                />
              </Row>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

/* ---------------- Notifications ---------------- */

export function NotificationsScreen() {
  const c = useColors();
  /* The provider already holds these and keeps them live — the screen just
     renders them, so the badge and the list can never disagree. */
  const { items, loading, unread, markAllRead } = useNotifications();

  React.useEffect(() => {
    /* Opening the inbox is the read receipt. Runs once on mount rather than on
       every render, so arriving messages still show as new until you come
       back. */
    if (unread > 0) markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !items.length) return <Loading />;

  return (
    <Screen>
      <Title>Notifications</Title>
      <Muted style={{ marginTop: 2 }}>From FadeRoom and your artists</Muted>

      {!items?.length ? (
        <View style={{ marginTop: space.lg }}>
          <Empty icon="🔔" title="Nothing yet" hint="Shop news and your order updates land here." />
        </View>
      ) : (
        items.map((n) => (
          <Card
            key={n.id}
            style={{
              marginTop: space.md,
              borderColor: n.read ? c.line : c.accent,
              backgroundColor: n.read ? c.surface : c.accentSoft,
            }}
          >
            <Between>
              <Body style={{ fontWeight: '800', flex: 1 }}>{n.title}</Body>
              {!n.read && <Badge label="NEW" tone="gold" />}
            </Between>
            <Muted style={{ marginTop: 6, lineHeight: 19 }}>{n.body}</Muted>
            <Muted style={{ marginTop: 8, fontSize: 11 }}>
              {new Date(n.sentAt).toLocaleString()}
              {n.createdByName ? ` · ${n.createdByName}` : ''}
            </Muted>
          </Card>
        ))
      )}
    </Screen>
  );
}
