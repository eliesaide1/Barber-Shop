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
  Divider,
  Empty,
  Field,
  Heading,
  Loading,
  Logo,
  Muted,
  Row,
  Screen,
  Segmented,
  Title,
} from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../store/AuthContext';
import { useTheme, useColors } from '../../store/ThemeContext';
import { useDialog } from '../../store/DialogContext';
import { useToast } from '../../store/ToastContext';
import { api, ApiError } from '../../api/client';
import { radius, space } from '../../theme';
import type { Product } from '../../types';
import { useT } from '../../store/CopyContext';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* Turnaround options, in minutes. Zero is on the list because some artists
   genuinely do run back-to-back and the setting should not argue with them. */
const GAPS = [0, 5, 10, 15, 20, 30];

export function ArtistMoreScreen() {
  const c = useColors();
  const t = useT();
  const nav = useNavigation<any>();
  const { user, artist, config, signOut, refreshUser } = useAuth();
  const { preference, setPreference, name: themeName } = useTheme();
  const { confirm, showError } = useDialog();
  const { toast } = useToast();
  const [savingGap, setSavingGap] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * Turnaround is the one scheduling setting that belongs on the phone rather
   * than at the desk: it is the thing you change *because* of how this morning
   * actually went, standing at the chair, not something you plan a week out.
   */
  const setGap = async (minutes: number) => {
    if (!artist || minutes === artist.gapMin) return;
    setSavingGap(true);
    try {
      await api.patch(`/artists/${artist.id}`, { gapMin: minutes });
      await refreshUser();
      toast(minutes ? `${minutes} min between clients ✓` : 'Back-to-back bookings ✓');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not save that', {
        title: 'Couldn’t change your turnaround',
        icon: '🗓️',
      });
    } finally {
      setSavingGap(false);
    }
  };

  const { data: shelf } = useApi<Product[]>('/products/manage/list');
  const published = (shelf ?? []).filter((p) => p.status === 'published');
  const pending = (shelf ?? []).filter((p) => p.status === 'pending');
  const lowStock = published.filter((p) => p.stock <= 3);

  /* Deliberately spells out what goes and what does not. An artist closing
     their chair is cancelling other people's appointments, and the sentence
     that says so is the only warning they get. */
  const confirmDeleteAccount = async () => {
    const ok = await confirm({
      title: t('artistMore.deleteTitle', 'Close your chair?'),
      message: t(
        'artistMore.deleteMessage',
        'Your upcoming bookings are cancelled and those clients are told. Your shelf is archived and your login is deleted. This cannot be undone.',
      ),
      icon: '🗑',
      tone: 'danger',
      confirmLabel: t('artistMore.deleteConfirm', 'Yes, close it'),
      cancelLabel: t('artistMore.deleteCancel', 'Cancel'),
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await api.del('/auth/me');
      await signOut();
    } catch (err) {
      setDeleting(false);
      await showError(
        err instanceof ApiError ? err.message : 'Please try again.',
        { title: t('artistMore.deleteFailed', 'Chair not closed'), icon: '🗑' },
      );
    }
  };

  const confirmSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You’ll need to sign in again to run your chair.',
      icon: '👋',
      tone: 'danger',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
    });
    if (ok) signOut();
  };

  return (
    <Screen>
      <Title>{t('artistMore.more', 'More')}</Title>

      <Card style={{ marginTop: space.lg, alignItems: 'center' }}>
        <Avatar name={artist?.displayName ?? user?.name ?? ''} size={84} />
        <Body style={{ fontWeight: '800', fontSize: 20, marginTop: 12 }}>
          {artist?.displayName ?? user?.name}
        </Body>
        <Muted style={{ marginTop: 2 }}>{artist?.specialty || 'Artist'}</Muted>
        <Muted>{user?.email}</Muted>
        <Badge
          label={`${artist?.chair || 'No chair'} · ★ ${artist?.rating ?? '—'}`}
          tone="gold"
          style={{ marginTop: 10 }}
        />
      </Card>

      {!!artist && (
        <Card style={{ marginTop: space.md }}>
          <Between>
            <Muted>{t('artistMore.workingHours', 'Working hours')}</Muted>
            <Body>
              {artist.workingHours.start}–{artist.workingHours.end}
            </Body>
          </Between>
          <Between style={{ marginTop: space.md }}>
            <Muted>{t('artistMore.from', 'From')}</Muted>
            <Body>${artist.priceFrom}</Body>
          </Between>
          <Divider />
          <Muted style={{ marginBottom: 8 }}>{t('artistMore.daysOn', 'Days on')}</Muted>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {DAYS.map((d, i) => (
              <Badge key={d} label={d} tone={artist.daysOff.includes(i) ? 'dim' : 'ok'} />
            ))}
          </Row>
          <Muted style={{ marginTop: space.md, fontSize: 11.5 }}>{t('artistMore.hoursRatesAndDays', 'Hours, rates and days off are set in the back office.')}</Muted>
        </Card>
      )}

      {!!artist && (
        <Card style={{ marginTop: space.md }}>
          <Body style={{ fontWeight: '700' }}>{t('artistMore.timeBetweenClients', 'Time between clients')}</Body>
          <Muted style={{ marginTop: 4 }}>
            Your turnaround — sweeping up, cleaning the guards, taking payment. A 15-minute cut at
            10:00 with {artist.gapMin || 0} min frees the chair at{' '}
            {`10:${String(15 + (artist.gapMin || 0)).padStart(2, '0')}`}, so the next booking starts
            there.
          </Muted>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
            {[...new Set([...GAPS, artist.gapMin])]
              .sort((a, b) => a - b)
              .map((m) => {
                const on = m === artist.gapMin;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setGap(m)}
                    disabled={savingGap}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: savingGap }}
                    style={{
                      paddingVertical: 9,
                      paddingHorizontal: 14,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      opacity: savingGap ? 0.5 : 1,
                      borderColor: on ? c.accent : c.line,
                      backgroundColor: on ? c.accent : c.surface2,
                    }}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 12.5, color: on ? c.onAccent : c.text }}>
                      {m === 0 ? 'None' : `${m} min`}
                    </Text>
                  </Pressable>
                );
              })}
          </View>

          <Muted style={{ marginTop: space.md, fontSize: 11.5 }}>
            Applies to times offered from now on. Bookings already in the diary stay where they are.
          </Muted>
        </Card>
      )}

      <Heading style={{ marginTop: space.xl }}>{t('artistMore.myShelf', 'My shelf')}</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Row style={{ gap: space.md }}>
          {[
            { n: String(published.length), l: 'Published', accent: true },
            { n: String(pending.length), l: 'In review' },
            { n: String(lowStock.length), l: 'Low stock' },
          ].map((s) => (
            <View key={s.l} style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: s.accent ? c.accentInk : c.text }}>
                {s.n}
              </Text>
              <Muted style={{ fontSize: 11, marginTop: 2 }}>{s.l}</Muted>
            </View>
          ))}
        </Row>
        {lowStock.length > 0 && (
          <>
            <Divider />
            <Muted>Running low: {lowStock.map((p) => `${p.name} (${p.stock})`).join(', ')}</Muted>
          </>
        )}
        <Muted style={{ marginTop: space.md, fontSize: 11.5 }}>
          Adding products happens in the back office, where the shop approves them before clients
          see them.
        </Muted>
      </Card>

      <Button
        title={t('artistMore.myPortfolio', 'My portfolio')}
        variant="secondary"
        onPress={() => nav.navigate('Portfolio')}
        style={{ marginTop: space.lg }}
      />
      <Button
        title={t('artistMore.messageMyClients', 'Message my clients')}
        variant="secondary"
        onPress={() => nav.navigate('Broadcast')}
        style={{ marginTop: space.md }}
      />

      <Heading style={{ marginTop: space.xl }}>{t('artistMore.appearance', 'Appearance')}</Heading>
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

      <Heading style={{ marginTop: space.xl }}>{t('artistMore.shop', 'Shop')}</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Between>
          <Muted>{config?.shop.name}</Muted>
          <Body>{config?.shop.area}</Body>
        </Between>
        <Between style={{ marginTop: space.md }}>
          <Muted>{t('artistMore.hours', 'Hours')}</Muted>
          <Body>{config?.shop.hours}</Body>
        </Between>
        <Between style={{ marginTop: space.md }}>
          <Muted>{t('artistMore.phone', 'Phone')}</Muted>
          <Text style={{ color: c.accentInk }}>{config?.shop.phone}</Text>
        </Between>
      </Card>

      <Button
        title={t('artistMore.thisDevice', 'This device')}
        variant="ghost"
        onPress={() => nav.navigate('Device')}
        style={{ marginTop: space.lg }}
      />

      <Button
        title={t('artistMore.privacyPolicy', 'Privacy policy')}
        variant="ghost"
        onPress={() => nav.navigate('Privacy')}
        style={{ marginTop: space.sm }}
      />

      <Button title={t('artistMore.signOut', 'Sign out')} variant="danger" onPress={confirmSignOut} style={{ marginTop: space.xl }} />
      <Button
        title={t('artistMore.deleteAccount', 'Delete account')}
        variant="ghost"
        onPress={confirmDeleteAccount}
        loading={deleting}
        style={{ marginTop: space.sm }}
      />
    </Screen>
  );
}

/* ---------------- broadcast to my clients ---------------- */

export function ArtistBroadcastScreen() {
  const nav = useNavigation<any>();
  const t = useT();
  const { toast } = useToast();
  const { showError } = useDialog();
  const [form, setForm] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      showError('A title and a message are both required.', { title: 'Nothing to send', icon: '✦' });
      return;
    }
    setBusy(true);
    try {
      /* An artist can only reach their own clients — the API enforces that too,
         so this is a convenience, not the guard. */
      const sent = await api.post<{ deliveredCount: number }>('/notifications', {
        title: form.title.trim(),
        body: form.body.trim(),
        audience: 'artist-clients',
      });
      toast(
        sent.deliveredCount
          ? `Sent · ${sent.deliveredCount} device${sent.deliveredCount === 1 ? '' : 's'} live now`
          : 'Sent · waiting for them next time they open the app',
      );
      nav.goBack();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not send that', {
        title: 'Message not sent',
        icon: '✦',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('artistMore.messageMyClients', 'Message my clients')}</Title>
      <Muted style={{ marginTop: 2 }}>{t('artistMore.everyoneWhoHasBooked', 'Everyone who has booked your chair')}</Muted>

      <Card style={{ marginTop: space.lg }}>
        <Field
          label={t('artistMore.title', 'Title')}
          value={form.title}
          onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
          maxLength={60}
          placeholder={t('artistMore.saturdaySlotsJustOpened', 'Saturday slots just opened')}
          style={{ marginTop: 0 }}
        />
        <Field
          label={t('artistMore.message', 'Message')}
          value={form.body}
          onChangeText={(v) => setForm((f) => ({ ...f, body: v }))}
          maxLength={220}
          placeholder={t('artistMore.twoChairsFreeAfter', 'Two chairs free after 4pm. Book from the app.')}
          multiline
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />
        <Muted style={{ textAlign: 'right', marginTop: 4 }}>{form.body.length}/220</Muted>
      </Card>

      <Heading style={{ marginTop: space.xl }}>{t('artistMore.preview', 'Preview')}</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Logo size={38} cornerRadius={19} />
          <View style={{ flex: 1 }}>
            <Between>
              <Body style={{ fontWeight: '700', fontSize: 13 }}>{t('artistMore.viaBarberHouse', 'VIA Barber House')}</Body>
              <Muted style={{ fontSize: 11 }}>{t('artistMore.now', 'now')}</Muted>
            </Between>
            <Body style={{ fontWeight: '700', marginTop: 3 }}>
              {form.title || 'Your title appears here'}
            </Body>
            <Muted style={{ marginTop: 3 }}>
              {form.body || 'And the message, exactly as your clients will read it.'}
            </Muted>
          </View>
        </Row>
      </Card>

      <Button title={t('artistMore.sendNow', 'Send now')} onPress={send} loading={busy} style={{ marginTop: space.lg }} />
      <Button title={t('artistMore.cancel', 'Cancel')} variant="ghost" onPress={() => nav.goBack()} style={{ marginTop: space.md }} />
    </Screen>
  );
}
