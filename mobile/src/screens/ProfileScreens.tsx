import React, { useState } from 'react';
import { Image, Pressable, Switch, Text, View } from 'react-native';
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
import { DateOfBirthField } from '../components/DateOfBirthField';
import { useApi, useSocketEvent } from '../hooks/useApi';
import { useAuth } from '../store/AuthContext';
import { useCart } from '../store/CartContext';
import { useTheme, useColors } from '../store/ThemeContext';
import { useDialog } from '../store/DialogContext';
import { useNotifications } from '../store/NotificationsContext';
import { useToast } from '../store/ToastContext';
import { api, ApiError } from '../api/client';
import { absoluteUrl } from '../config';
import { KIND_GLYPH } from '../components/NotificationBanner';
import { openNotification } from '../navigation/ref';
import {
  VISIT_FREQUENCIES,
  dateOfBirthError,
  frequencyLabel,
  fromIsoDate,
  toIsoDate,
} from '../lib/clientDetails';
import { radius, space } from '../theme';
import type { Appointment, AppNotification, HaircutRecord, LoyaltyCard, Order, User } from '../types';

const STATUS_LABELS: Record<string, string> = {
  completed: 'Done',
  cancelled: 'Withdrawn',
  declined: 'Not taken',
  noshow: 'No-show',
};

/* ---------------- Profile ---------------- */

export function ProfileScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { user, config, signOut, updateUser } = useAuth();
  const { confirm, showError } = useDialog();
  const { preference, setPreference, name: themeName } = useTheme();
  const cart = useCart();
  const { data: card } = useApi<LoyaltyCard>('/loyalty/card');
  const { data: orders } = useApi<Order[]>('/orders');
  const { data: haircuts } = useApi<HaircutRecord[]>('/haircuts/mine');
  const awaitingPhotos = (haircuts ?? []).filter((h) => h.status === 'pending').length;

  /* Optimistic: the switch answers instantly and the server catches up. Nothing
     is lost if the write fails — worst case one more shop message arrives, and
     `user` re-reads the truth on the next focus. */
  const [broadcasts, setBroadcasts] = useState(user?.notifications?.broadcasts !== false);
  const [whatsapp, setWhatsapp] = useState(user?.notifications?.whatsapp === true);
  const [deleting, setDeleting] = useState(false);

  const saveNotifications = async (
    patch: { broadcasts?: boolean; whatsapp?: boolean },
    revert: () => void,
  ) => {
    try {
      const session = await api.patch<{ user: User }>('/auth/me', { notifications: patch });
      if (session.user) updateUser(session.user);
    } catch {
      revert();
    }
  };

  const saveBroadcasts = (on: boolean) => {
    setBroadcasts(on);
    return saveNotifications({ broadcasts: on }, () => setBroadcasts(!on));
  };
  const saveWhatsApp = (on: boolean) => {
    setWhatsapp(on);
    return saveNotifications({ whatsapp: on }, () => setWhatsapp(!on));
  };

  const stamps = card?.stamps ?? 0;
  const goal = card?.goal ?? config?.loyaltyGoal ?? 5;
  const incomplete = !user?.phone || !user?.dateOfBirth || !user?.visitFrequencyWeeks;

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

  /* Asked before it happens, and asked plainly: this is the one action in the
     app with nothing behind it to undo. The server takes the bookings, the
     loyalty card and the order history with the account, so the sentence says
     so rather than leaving it to be discovered. */
  const confirmDeleteAccount = async () => {
    const ok = await confirm({
      title: 'Are you sure?',
      message:
        'Deleting your account also deletes your bookings, your loyalty card and your order history. This cannot be undone.',
      icon: '🗑',
      tone: 'danger',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await api.del('/auth/me');
      /* The account is gone, so the tokens in the keychain point at nothing.
         Signing out clears them and returns to the sign-in screen. */
      await signOut();
    } catch (err) {
      setDeleting(false);
      await showError(
        err instanceof ApiError ? err.message : 'Please try again.',
        { title: 'Account not deleted', icon: '🗑' },
      );
    }
  };

  return (
    <Screen>
      <Title>Profile</Title>

      <Card style={{ marginTop: space.lg, alignItems: 'center' }}>
        <Avatar name={user?.name ?? ''} size={84} />
        <Body style={{ fontWeight: '800', fontSize: 20, marginTop: 12 }}>{user?.name}</Body>
        <Muted style={{ marginTop: 2 }}>{user?.email}</Muted>
        {!!user?.phone && <Muted>{user.phone}</Muted>}
        <Badge label="VIA BARBER HOUSE CLUB" tone="gold" style={{ marginTop: 10 }} />
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
        <Pressable onPress={() => nav.navigate('Haircuts')}>
          <Between style={{ paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.line }}>
            <Muted>My haircuts</Muted>
            {/* A photo awaiting an answer is a question somebody asked — worth a
                count here rather than only in a notification that scrolls away. */}
            <Body style={{ color: awaitingPhotos ? c.accentInk : c.text, fontWeight: awaitingPhotos ? '700' : '400' }}>
              {awaitingPhotos ? `${awaitingPhotos} to approve ›` : '›'}
            </Body>
          </Between>
        </Pressable>
      </Card>

      <Heading style={{ marginTop: space.xl }}>My details</Heading>
      {/* Accounts made before these were asked for have them empty. Say so once,
          plainly, rather than nagging — and only when something is actually
          missing. */}
      {incomplete && (
        <Card style={{ marginTop: space.sm, borderColor: c.accent, backgroundColor: c.accentSoft }}>
          <Body style={{ fontWeight: '700' }}>Finish your profile</Body>
          <Muted style={{ marginTop: 4 }}>
            Your artist keeps a card on every client. Yours is missing{' '}
            {[
              !user?.phone && 'a mobile number',
              !user?.dateOfBirth && 'your date of birth',
              !user?.visitFrequencyWeeks && 'how often you get cut',
            ]
              .filter(Boolean)
              .join(', ')}
            .
          </Muted>
          <Button
            title="Add them"
            compact
            onPress={() => nav.navigate('Preferences')}
            style={{ marginTop: space.md }}
          />
        </Card>
      )}
      <Card style={{ marginTop: space.sm }}>
        {[
          ['Mobile', user?.phone],
          ['Date of birth', fromIsoDate(user?.dateOfBirth)],
          ['Usually cuts', user?.visitFrequencyWeeks ? frequencyLabel(user.visitFrequencyWeeks) : ''],
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
            <Body>{(value as string) || '—'}</Body>
          </Between>
        ))}
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
        title="Edit my details"
        variant="ghost"
        onPress={() => nav.navigate('Preferences')}
        style={{ marginTop: space.md }}
      />

      <Heading style={{ marginTop: space.xl }}>Notifications</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Between>
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Body style={{ fontWeight: '700' }}>Shop news</Body>
            <Muted style={{ marginTop: 3 }}>
              Offers and announcements from VIA Barber House and your artist.
            </Muted>
          </View>
          <Switch
            value={broadcasts}
            onValueChange={saveBroadcasts}
            /* `thumbColor` is Android-only and `trackColor.false` is painted
               over by iOS's own track unless `ios_backgroundColor` matches —
               without it the off state is a light grey island in dark mode. */
            trackColor={{ true: c.accent, false: c.line }}
            thumbColor={c.surface}
            ios_backgroundColor={c.line}
          />
        </Between>
        <Between style={{ marginTop: space.lg }}>
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Body style={{ fontWeight: '700' }}>WhatsApp</Body>
            <Muted style={{ marginTop: 3 }}>
              Birthday wishes and the odd gift, on WhatsApp. Off unless you ask for it.
            </Muted>
          </View>
          <Switch
            value={whatsapp}
            onValueChange={saveWhatsApp}
            /* `thumbColor` is Android-only and `trackColor.false` is painted
               over by iOS's own track unless `ios_backgroundColor` matches —
               without it the off state is a light grey island in dark mode. */
            trackColor={{ true: c.accent, false: c.line }}
            thumbColor={c.surface}
            ios_backgroundColor={c.line}
          />
        </Between>

        {/* Saying what cannot be silenced is the point of the setting: without
            it people turn everything off to stop the adverts, and then miss the
            answer they were waiting for. */}
        <Muted style={{ marginTop: space.md }}>
          Booking answers, order updates and free cuts always come through in the app. Turn the lot
          off in your phone’s settings if you’d rather.
        </Muted>
      </Card>

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

      <Heading style={{ marginTop: space.xl }}>About</Heading>
      <Card style={{ marginTop: space.sm }} onPress={() => nav.navigate('Device')}>
        <Between>
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Body style={{ fontWeight: '700' }}>This device</Body>
            <Muted style={{ marginTop: 3 }}>
              Which phone, which app version, and who is signed in.
            </Muted>
          </View>
          <Body>›</Body>
        </Between>
      </Card>

      <Button title="Log out" variant="danger" onPress={confirmSignOut} style={{ marginTop: space.xl }} />
      <Button
        title="Delete account"
        variant="ghost"
        onPress={confirmDeleteAccount}
        loading={deleting}
        style={{ marginTop: space.sm }}
      />
    </Screen>
  );
}

/* ---------------- Preferences editor ---------------- */

export function PreferencesScreen() {
  const c = useColors();
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
  const [details, setDetails] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    dob: fromIsoDate(user?.dateOfBirth),
  });
  const [frequency, setFrequency] = useState<number | null>(user?.visitFrequencyWeeks ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    /* Details are only sent when they are complete and valid. An account made
       before these were asked for has empty ones, and saving a haircut note
       should not be blocked by a birthday nobody has got round to — but nor
       should it quietly write a half-typed date. */
    const next: Record<string, string> = {};
    if (details.name.trim().length < 2) next.name = 'Please enter your name';
    if (details.phone.replace(/\D/g, '').length < 7) next.phone = 'Enter a valid phone number';
    if (details.dob.trim()) {
      const dobError = dateOfBirthError(details.dob);
      if (dobError) next.dateOfBirth = dobError;
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const iso = toIsoDate(details.dob);
      const session = await api.patch<{ user: User }>('/auth/me', {
        preferences: form,
        name: details.name.trim(),
        phone: details.phone.trim(),
        ...(iso ? { dateOfBirth: iso } : {}),
        ...(frequency ? { visitFrequencyWeeks: frequency } : {}),
      });
      if (session.user) updateUser(session.user);
      toast('Saved ✓');
      nav.goBack();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
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
      <Title>My details</Title>
      <Muted style={{ marginTop: 2 }}>Your artist sees this before every visit.</Muted>

      <Heading style={{ marginTop: space.lg }}>About you</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Field
          label="Full name"
          value={details.name}
          onChangeText={(v: string) => setDetails((d) => ({ ...d, name: v }))}
          error={errors.name}
          style={{ marginTop: 0 }}
        />
        <Field
          label="Mobile number"
          value={details.phone}
          onChangeText={(v: string) => setDetails((d) => ({ ...d, phone: v }))}
          keyboardType="phone-pad"
          placeholder="+961 …"
          error={errors.phone}
        />
        <DateOfBirthField
          value={details.dob}
          onChange={(v: string) => setDetails((d) => ({ ...d, dob: v }))}
          error={errors.dateOfBirth}
        />

        <Muted style={{ marginTop: space.md, fontWeight: '600' }}>How often do you get cut?</Muted>
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
                  borderColor: on ? c.accent : c.line,
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
        <Muted style={{ marginTop: space.md, fontSize: 11.5 }}>
          It is how your artist knows when you are due — not a commitment.
        </Muted>
      </Card>

      <Heading style={{ marginTop: space.xl }}>Cut preferences</Heading>
      <Card style={{ marginTop: space.sm }}>
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
    /* A request and a confirmed chair are different things to give up, and the
       wording should not pretend otherwise. */
    const isRequest = a.status === 'pending';
    const ok = await confirm({
      title: isRequest ? 'Withdraw this request?' : 'Cancel this booking?',
      /* Say what happens to a held free cut — it's the thing worth worrying
         about, and the answer is reassuring. */
      message: a.rewardCode
        ? 'Your free cut goes straight back into your card. You can ask again any time.'
        : 'You can ask again any time.',
      icon: '🗓️',
      tone: 'danger',
      confirmLabel: isRequest ? 'Withdraw it' : 'Cancel booking',
      cancelLabel: isRequest ? 'Keep waiting' : 'Keep my chair',
    });
    if (!ok) return;

    try {
      await api.post(`/appointments/${a.id}/cancel`);
      toast(
        a.rewardCode
          ? 'Withdrawn · free cut back in your card'
          : isRequest ? 'Request withdrawn' : 'Booking cancelled',
      );
      reload(true);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not cancel', {
        title: isRequest ? 'Couldn’t withdraw it' : 'Couldn’t cancel',
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
        upcoming.map((a) => {
          const pending = a.status === 'pending';
          const who = a.artist.displayName.split(' ')[0];
          const moved =
            !!a.requestedStartsAt &&
            new Date(a.requestedStartsAt).getTime() !== new Date(a.startsAt).getTime();
          return (
          <Card key={a.id} style={{ marginTop: space.md }}>
            <Between>
              <Badge
                label={pending ? `Waiting on ${who}` : 'Confirmed'}
                tone={pending ? 'warn' : 'ok'}
              />
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
            {/* Say plainly that the chair is not yet theirs, and why that is the
                rule — it is what keeps the times honest for everyone. */}
            <Muted style={{ marginTop: space.md }}>
              {pending
                ? `${who} confirms the time and how long your cut needs. The slot isn’t held until then.`
                : `${a.durationMin} minutes in the chair.`}
            </Muted>
            {/* A time that isn't the one they asked for needs saying outright,
                or it reads as their own mistake. */}
            {!pending && moved && (
              <Muted style={{ marginTop: 4, color: c.accentInk }}>
                {who} moved this from{' '}
                {new Date(a.requestedStartsAt!).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                .
              </Muted>
            )}
            {/* What they asked for, still visible. Otherwise "this again" is a
                tap that leaves no trace and they cannot tell it worked. */}
            {!!a.reference && (
              <Row style={{ marginTop: space.md }}>
                <Image
                  source={{ uri: absoluteUrl(a.reference.images[0]) }}
                  style={{ width: 46, height: 46, borderRadius: radius.sm + 2, backgroundColor: c.surface3 }}
                />
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>Same as last time</Body>
                  <Muted style={{ marginTop: 2 }}>
                    {a.reference.serviceName || 'Haircut'} ·{' '}
                    {new Date(a.reference.takenAt).toLocaleDateString([], {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Muted>
                </View>
              </Row>
            )}
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
            <Button
              title={pending ? 'Withdraw request' : 'Cancel booking'}
              variant="danger"
              compact
              onPress={() => cancel(a)}
              style={{ marginTop: space.md }}
            />
          </Card>
          );
        })
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
                  {/* A turned-down request is the one history row that owes an
                      explanation, so give the artist's own words when there are any. */}
                  {a.status === 'declined' && (
                    <Muted style={{ marginTop: 2 }}>
                      {a.declineReason || 'Your artist couldn’t take that time.'}
                    </Muted>
                  )}
                </View>
                <Badge
                  label={STATUS_LABELS[a.status] ?? a.status}
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
  const { isArtist } = useAuth();
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
      <Muted style={{ marginTop: 2 }}>From VIA Barber House and your artists</Muted>

      {!items?.length ? (
        <View style={{ marginTop: space.lg }}>
          <Empty icon="🔔" title="Nothing yet" hint="Shop news and your order updates land here." />
        </View>
      ) : (
        items.map((n) => (
          <Card
            key={n.id}
            /* The inbox is where a banner that timed out gets caught, so the
               row has to lead to the same place the banner would have. */
            onPress={() => openNotification(n.data, isArtist)}
            style={{
              marginTop: space.md,
              borderColor: n.read ? c.line : c.accent,
              backgroundColor: n.read ? c.surface : c.accentSoft,
            }}
          >
            <Between>
              <Row style={{ flex: 1, gap: space.sm }}>
                <Text style={{ fontSize: 16 }}>{KIND_GLYPH[n.kind] ?? KIND_GLYPH.message}</Text>
                <Body style={{ fontWeight: '800', flex: 1 }}>{n.title}</Body>
              </Row>
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
