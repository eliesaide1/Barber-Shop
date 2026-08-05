import React, { useMemo, useState } from 'react';
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
  Heading,
  Loading,
  Muted,
  Row,
  Screen,
  Title,
} from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { useAuth } from '../../store/AuthContext';
import { useColors } from '../../store/ThemeContext';
import { useDialog } from '../../store/DialogContext';
import { useToast } from '../../store/ToastContext';
import { useNotifications } from '../../store/NotificationsContext';
import { api, ApiError } from '../../api/client';
import { radius, space } from '../../theme';
import type { AgendaEntry } from '../../types';

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const STATUS: Record<string, { tone: 'ok' | 'warn' | 'dim' | 'red' | 'gold'; label: string }> = {
  confirmed: { tone: 'ok', label: 'Upcoming' },
  pending: { tone: 'warn', label: 'Awaiting' },
  completed: { tone: 'dim', label: 'Done' },
  noshow: { tone: 'red', label: 'No-show' },
};

export function ArtistScheduleScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { artist } = useAuth();
  const { toast } = useToast();
  const { confirm, showError } = useDialog();
  const { unread } = useNotifications();
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  /* A week of days to swipe through — a barber rarely needs more than that on
     a phone, and it keeps the whole picker on one row. */
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return { iso: isoDay(d), label: i === 0 ? 'Today' : DAY_NAMES[d.getDay()], date: d.getDate() };
      }),
    [],
  );
  const day = days[offset];

  const { data: agenda, loading, reload } = useApi<AgendaEntry[]>(
    `/appointments/agenda?date=${day.iso}`,
    [day.iso],
  );

  useSocketEvent('appointment:created', () => reload(true));
  useSocketEvent('appointment:status', () => reload(true));

  const setStatus = async (entry: AgendaEntry, status: 'completed' | 'noshow') => {
    if (status === 'noshow') {
      const ok = await confirm({
        title: `Mark ${entry.user?.name.split(' ')[0] ?? 'this client'} a no-show?`,
        message: 'The slot is freed and the booking is closed. This cannot be undone.',
        icon: '🗓️',
        tone: 'danger',
        confirmLabel: 'Mark no-show',
        cancelLabel: 'Not yet',
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      await api.post(`/appointments/${entry.id}/status`, { status });
      reload(true);
      if (status === 'completed') {
        /* Finishing a cut is exactly when the client should be checking in —
           so offer the QR rather than making them go looking for it. */
        const show = await confirm({
          title: 'Cut completed',
          message: `Show your check-in code so ${entry.user?.name.split(' ')[0] ?? 'they'} get their stamp.`,
          icon: '✂️',
          confirmLabel: 'Show check-in code',
          cancelLabel: 'Not now',
        });
        if (show) nav.navigate('CheckIn');
      } else {
        toast('Marked no-show · slot freed');
      }
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not update that booking', {
        title: 'Couldn’t update the booking',
        icon: '🗓️',
      });
    } finally {
      setBusy(false);
    }
  };

  const takings = (agenda ?? [])
    .filter((a) => a.status === 'completed' && !a.free)
    .reduce((sum, a) => sum + a.price, 0);
  const remaining = (agenda ?? []).filter((a) => ['confirmed', 'pending'].includes(a.status)).length;

  return (
    <Screen>
      <Between>
        <View style={{ flex: 1 }}>
          <Title>{artist?.displayName.split(' ')[0] ?? 'Your'}’s chair</Title>
          <Muted style={{ marginTop: 2 }}>{artist?.chair ?? 'Artist portal'}</Muted>
        </View>
        <Row style={{ gap: space.sm }}>
          <Pressable
            onPress={() => nav.navigate('Notifications')}
            accessibilityRole="button"
            accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.md,
              backgroundColor: c.surface2,
              borderColor: c.line,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="bell" color={c.text} size={21} />
            {unread > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  paddingHorizontal: 5,
                  backgroundColor: c.danger,
                  borderWidth: 2,
                  borderColor: c.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>
                  {unread > 9 ? '9+' : unread}
                </Text>
              </View>
            )}
          </Pressable>
          <Avatar name={artist?.displayName ?? 'A'} />
        </Row>
      </Between>

      <Row style={{ marginTop: space.lg, gap: space.md }}>
        {[
          { n: String(agenda?.length ?? 0), l: 'Booked', accent: true },
          { n: `$${takings}`, l: 'Earned' },
          { n: String(remaining), l: 'To come' },
        ].map((s) => (
          <Card key={s.l} style={{ flex: 1, padding: space.md }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: s.accent ? c.accentInk : c.text }}>
              {s.n}
            </Text>
            <Muted style={{ fontSize: 11, marginTop: 2 }}>{s.l}</Muted>
          </Card>
        ))}
      </Row>

      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
        {days.map((d, i) => {
          const active = i === offset;
          return (
            <Pressable
              key={d.iso}
              onPress={() => setOffset(i)}
              style={{
                flex: 1,
                paddingVertical: 9,
                alignItems: 'center',
                borderRadius: radius.md,
                backgroundColor: active ? c.accent : c.surface2,
                borderColor: active ? c.accent : c.line,
                borderWidth: 1,
              }}
            >
              <Text style={{ fontSize: 10.5, fontWeight: '600', color: active ? c.onAccent : c.muted }}>
                {d.label}
              </Text>
              <Text
                style={{ fontSize: 15, fontWeight: '800', color: active ? c.onAccent : c.text, marginTop: 1 }}
              >
                {d.date}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && !agenda ? (
        <Loading label="Loading the chair…" />
      ) : !agenda?.length ? (
        <View style={{ marginTop: space.lg }}>
          <Empty icon="🗓️" title="Nothing booked" hint="No appointments on this day." />
        </View>
      ) : (
        agenda.map((a) => {
          const meta = STATUS[a.status] ?? STATUS.confirmed;
          const done = a.status === 'completed' || a.status === 'noshow';
          return (
            <Card key={a.id} style={{ marginTop: space.md, opacity: done ? 0.6 : 1 }}>
              <Between>
                <Row style={{ gap: space.sm }}>
                  <Text style={{ fontWeight: '800', fontSize: 17, color: c.text }}>{time(a.startsAt)}</Text>
                  <Muted>{a.durationMin} min</Muted>
                </Row>
                <Badge label={meta.label} tone={meta.tone} />
              </Between>

              <Row style={{ marginTop: space.md }}>
                <Avatar name={a.user?.name ?? 'Walk in'} size={40} />
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{a.user?.name ?? 'Walk-in'}</Body>
                  <Muted style={{ marginTop: 2 }}>{a.serviceName}</Muted>
                </View>
                {a.free ? (
                  <Badge label="🎁 FREE" tone="gold" />
                ) : (
                  <Text style={{ fontWeight: '800', color: c.text }}>${a.price}</Text>
                )}
              </Row>

              {/* What the client asked for, so it's readable without tapping through. */}
              {!!a.user?.preferences?.clipperGuard && (
                <Muted style={{ marginTop: space.sm }}>✂ {a.user.preferences.clipperGuard}</Muted>
              )}
              {!!a.notes && <Muted style={{ marginTop: 4 }}>“{a.notes}”</Muted>}
              {!!a.rewardCode && (
                <Muted style={{ marginTop: 4 }}>
                  Free cut held · claim <Text style={{ color: c.accentInk, fontWeight: '700' }}>{a.rewardCode}</Text>
                </Muted>
              )}

              {!done && (
                <Row style={{ marginTop: space.md, gap: space.md }}>
                  <Button
                    title="Complete"
                    compact
                    style={{ flex: 1 }}
                    disabled={busy}
                    onPress={() => setStatus(a, 'completed')}
                  />
                  <Button
                    title="No-show"
                    variant="ghost"
                    compact
                    style={{ flex: 1 }}
                    disabled={busy}
                    onPress={() => setStatus(a, 'noshow')}
                  />
                </Row>
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
