import React, { useState } from 'react';
import { Text, View } from 'react-native';
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
import { space } from '../../theme';
import type { Product } from '../../types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ArtistMoreScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { user, artist, config, signOut } = useAuth();
  const { preference, setPreference, name: themeName } = useTheme();
  const { confirm } = useDialog();

  const { data: shelf } = useApi<Product[]>('/products/manage/list');
  const published = (shelf ?? []).filter((p) => p.status === 'published');
  const pending = (shelf ?? []).filter((p) => p.status === 'pending');
  const lowStock = published.filter((p) => p.stock <= 3);

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
      <Title>More</Title>

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
            <Muted>Working hours</Muted>
            <Body>
              {artist.workingHours.start}–{artist.workingHours.end}
            </Body>
          </Between>
          <Between style={{ marginTop: space.md }}>
            <Muted>From</Muted>
            <Body>${artist.priceFrom}</Body>
          </Between>
          <Divider />
          <Muted style={{ marginBottom: 8 }}>Days on</Muted>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {DAYS.map((d, i) => (
              <Badge key={d} label={d} tone={artist.daysOff.includes(i) ? 'dim' : 'ok'} />
            ))}
          </Row>
          <Muted style={{ marginTop: space.md, fontSize: 11.5 }}>
            Hours, rates and days off are set in the back office.
          </Muted>
        </Card>
      )}

      <Heading style={{ marginTop: space.xl }}>My shelf</Heading>
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
        title="My portfolio"
        variant="secondary"
        onPress={() => nav.navigate('Portfolio')}
        style={{ marginTop: space.lg }}
      />
      <Button
        title="Message my clients"
        variant="secondary"
        onPress={() => nav.navigate('Broadcast')}
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
        <Between>
          <Muted>{config?.shop.name}</Muted>
          <Body>{config?.shop.area}</Body>
        </Between>
        <Between style={{ marginTop: space.md }}>
          <Muted>Hours</Muted>
          <Body>{config?.shop.hours}</Body>
        </Between>
        <Between style={{ marginTop: space.md }}>
          <Muted>Phone</Muted>
          <Text style={{ color: c.accentInk }}>{config?.shop.phone}</Text>
        </Between>
      </Card>

      <Button title="Sign out" variant="danger" onPress={confirmSignOut} style={{ marginTop: space.xl }} />
    </Screen>
  );
}

/* ---------------- broadcast to my clients ---------------- */

export function ArtistBroadcastScreen() {
  const nav = useNavigation<any>();
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
      <Title>Message my clients</Title>
      <Muted style={{ marginTop: 2 }}>Everyone who has booked your chair</Muted>

      <Card style={{ marginTop: space.lg }}>
        <Field
          label="Title"
          value={form.title}
          onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
          maxLength={60}
          placeholder="Saturday slots just opened"
          style={{ marginTop: 0 }}
        />
        <Field
          label="Message"
          value={form.body}
          onChangeText={(v) => setForm((f) => ({ ...f, body: v }))}
          maxLength={220}
          placeholder="Two chairs free after 4pm. Book from the app."
          multiline
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />
        <Muted style={{ textAlign: 'right', marginTop: 4 }}>{form.body.length}/220</Muted>
      </Card>

      <Heading style={{ marginTop: space.xl }}>Preview</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Avatar name="Fade Room" size={38} />
          <View style={{ flex: 1 }}>
            <Between>
              <Body style={{ fontWeight: '700', fontSize: 13 }}>FadeRoom</Body>
              <Muted style={{ fontSize: 11 }}>now</Muted>
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

      <Button title="Send now" onPress={send} loading={busy} style={{ marginTop: space.lg }} />
      <Button title="Cancel" variant="ghost" onPress={() => nav.goBack()} style={{ marginTop: space.md }} />
    </Screen>
  );
}
