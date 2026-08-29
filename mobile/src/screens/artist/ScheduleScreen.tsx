import React, { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
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
import { HaircutCapture } from '../../components/HaircutCapture';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { useAuth } from '../../store/AuthContext';
import { useColors } from '../../store/ThemeContext';
import { useDialog } from '../../store/DialogContext';
import { useToast } from '../../store/ToastContext';
import { useNotifications } from '../../store/NotificationsContext';
import { api, ApiError } from '../../api/client';
import { absoluteUrl } from '../../config';
import { time } from '../../lib/chairTime';
import { radius, space } from '../../theme';
import type { AgendaEntry } from '../../types';
import { useT } from '../../store/CopyContext';

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS: Record<string, { tone: 'ok' | 'warn' | 'dim' | 'red' | 'gold'; label: string }> = {
  confirmed: { tone: 'ok', label: 'Upcoming' },
  pending: { tone: 'warn', label: 'Requested' },
  completed: { tone: 'dim', label: 'Done' },
  declined: { tone: 'dim', label: 'Declined' },
  noshow: { tone: 'red', label: 'No-show' },
};

/* The lengths you actually reach for at the chair. The request's own estimate
   is folded in below, so the price list's number is always among them. */

export function ArtistScheduleScreen() {
  const c = useColors();
  const t = useT();
  const nav = useNavigation<any>();
  const { artist } = useAuth();
  const { toast } = useToast();
  const { confirm, showError } = useDialog();
  const { unread } = useNotifications();
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState<AgendaEntry | null>(null);

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
  const refresh = useCallback(() => {
    reload(true);
  }, [reload]);

  useSocketEvent('appointment:created', refresh);
  useSocketEvent('appointment:status', refresh);

  /**
   * Accepting is the moment the chair is actually reserved. Nothing was held
   * while the request sat in the inbox — which is what stops one client taking
   * out every slot in the week — so the length chosen here is what gets booked.
   */

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
      refresh();
      if (status === 'completed') {
        /* The moment the cut is finished is the only moment this photo can be
           taken, so it is asked for here rather than left to a screen somebody
           would have to remember to visit. */
        const record = await confirm({
          title: 'Photograph the cut?',
          message:
            `${entry.user?.name.split(' ')[0] ?? 'They'} has to approve it before it is saved — ` +
            'it goes to them to say yes or no. Worth it: next time you can just repeat it.',
          icon: '📷',
          confirmLabel: 'Take a photo',
          cancelLabel: 'Not this time',
        });
        if (record) {
          setCapturing(entry);
          return;
        }
      }
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
    .filter((a) => a.status === 'completed')
    .reduce((sum, a) => sum + a.price, 0);
  const remaining = (agenda ?? []).filter((a) => a.status === 'confirmed').length;

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
          /* "To answer" left with the requests — the tab carries that count
             now, and two places showing it is two places to disagree. */
          { n: `$${takings}`, l: 'Earned' },
          { n: String(remaining), l: 'To come' },
        ].map((s) => (
          <Card key={s.l} style={{ flex: 1, padding: space.md }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>
              {s.n}
            </Text>
            <Muted style={{ fontSize: 11, marginTop: 2 }}>{s.l}</Muted>
          </Card>
        ))}
      </Row>

      <Heading style={{ marginTop: space.xl }}>{t('artistSchedule.theDay', 'The day')}</Heading>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
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
        <Loading label={t('artistSchedule.loadingTheChair', 'Loading the chair…')} />
      ) : !agenda?.length ? (
        <View style={{ marginTop: space.lg }}>
          <Empty icon="🗓️" title={t('artistSchedule.nothingBooked', 'Nothing booked')} hint={t('artistSchedule.noAppointmentsOnThis', 'No appointments on this day.')} />
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
                {/* Always the price. A booking the client is paying for and one
                    they earned look identical here, which is the point. */}
                <Text style={{ fontWeight: '800', color: c.text }}>${a.price}</Text>
              </Row>

              {/* What the client asked for, so it's readable without tapping through. */}
              {!!a.user?.preferences?.clipperGuard && (
                <Muted style={{ marginTop: space.sm }}>✂ {a.user.preferences.clipperGuard}</Muted>
              )}
              {!!a.notes && <Muted style={{ marginTop: 4 }}>“{a.notes}”</Muted>}

              {/* "This again". The reason for keeping haircut records at all —
                  put where the work happens rather than filed on a profile. */}
              {!!a.reference && (
                <Row style={{ marginTop: space.md, alignItems: 'flex-start' }}>
                  <Image
                    source={{ uri: absoluteUrl(a.reference.images[0]) }}
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: radius.md,
                      backgroundColor: c.surface3,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: '700' }}>{t('artistSchedule.wantsThisAgain', 'Wants this again')}</Body>
                    <Muted style={{ marginTop: 2 }}>
                      {new Date(a.reference.takenAt).toLocaleDateString([], {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Muted>
                    {!!a.reference.notes && (
                      <Muted style={{ marginTop: 4 }}>{a.reference.notes}</Muted>
                    )}
                  </View>
                </Row>
              )}

              {/* Most people do not attach a reference when they book, so the
                  way to reproduce their last cut has to be reachable from the
                  chair rather than depending on them having planned ahead. */}
              {!!a.user && (
                <Pressable
                  onPress={() =>
                    nav.navigate('ClientHistory', {
                      userId: a.user!.id,
                      name: a.user!.name,
                      phone: a.user!.phone,
                      dateOfBirth: a.user!.dateOfBirth,
                      visitFrequencyWeeks: a.user!.visitFrequencyWeeks,
                    })
                  }
                  accessibilityRole="button"
                  style={{ marginTop: space.md }}
                >
                  <Text style={{ color: c.accentInk, fontWeight: '700', fontSize: 13 }}>
                    {a.reference ? 'See their other cuts →' : 'See their past cuts →'}
                  </Text>
                </Pressable>
              )}

              {/* A request has no chair yet, so there is nothing to close out —
                  it is answered in the inbox above. */}
              {a.status === 'pending' ? (
                <Muted style={{ marginTop: space.md }}>{t('artistSchedule.answerThisOneUnder', 'Answer this one under “Waiting on you”.')}</Muted>
              ) : (
                !done && (
                  <Row style={{ marginTop: space.md, gap: space.md }}>
                    <Button
                      title={t('artistSchedule.complete', 'Complete')}
                      compact
                      style={{ flex: 1 }}
                      disabled={busy}
                      onPress={() => setStatus(a, 'completed')}
                    />
                    <Button
                      title={t('artistSchedule.noShow', 'No-show')}
                      variant="ghost"
                      compact
                      style={{ flex: 1 }}
                      disabled={busy}
                      onPress={() => setStatus(a, 'noshow')}
                    />
                  </Row>
                )
              )}
            </Card>
          );
        })
      )}
      {capturing && (
        <HaircutCapture
          entry={capturing}
          onClose={() => setCapturing(null)}
          onSent={() => {
            setCapturing(null);
            refresh();
          }}
        />
      )}
    </Screen>
  );
}
