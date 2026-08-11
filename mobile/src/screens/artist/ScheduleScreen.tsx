import React, { useCallback, useMemo, useState } from 'react';
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
import type { AgendaEntry, ConfirmResult } from '../../types';

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const STATUS: Record<string, { tone: 'ok' | 'warn' | 'dim' | 'red' | 'gold'; label: string }> = {
  confirmed: { tone: 'ok', label: 'Upcoming' },
  pending: { tone: 'warn', label: 'Requested' },
  completed: { tone: 'dim', label: 'Done' },
  declined: { tone: 'dim', label: 'Declined' },
  noshow: { tone: 'red', label: 'No-show' },
};

/* The lengths you actually reach for at the chair. The request's own estimate
   is folded in below, so the price list's number is always among them. */
const LENGTHS = [10, 15, 20, 25, 30, 40, 45, 60, 75, 90];

/* Nudges rather than a date picker. Moving a booking at the chair is "push them
   back a quarter of an hour", not "open a calendar" — and it keeps a native
   picker dependency out of the build for a control used in one place. */
const NUDGES = [-30, -15, -5, +5, +15, +30];

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * One waiting request, with the decision on it.
 *
 * The length is chosen right here rather than behind a modal: accepting is the
 * common case, and it should cost a glance and two taps.
 */
function RequestCard({
  request,
  busy,
  onAccept,
  onDecline,
}: {
  request: AgendaEntry;
  busy: boolean;
  onAccept: (r: AgendaEntry, minutes: number, movedTo: string | null) => void;
  onDecline: (r: AgendaEntry) => void;
}) {
  const c = useColors();
  const [length, setLength] = useState(request.durationMin);
  /* Minutes away from the time they asked for. Zero is "yes, as asked", and the
     request keeps its own startsAt as the anchor so nudges never compound. */
  const [shift, setShift] = useState(0);
  const options = useMemo(
    () => [...new Set([...LENGTHS, request.durationMin])].sort((a, b) => a - b),
    [request.durationMin],
  );

  const asked = new Date(request.startsAt);
  const startsAt = new Date(asked.getTime() + shift * 60_000);
  const moved = shift !== 0;

  return (
    <Card style={{ marginTop: space.md, borderColor: c.accent }}>
      <Between>
        <Row style={{ gap: space.sm }}>
          <Text style={{ fontWeight: '800', fontSize: 17, color: moved ? c.accentInk : c.text }}>
            {time(startsAt.toISOString())}
          </Text>
          <Muted>{dayLabel(startsAt.toISOString())}</Muted>
        </Row>
        {request.free ? <Badge label="🎁 FREE" tone="gold" /> : <Badge label="REQUESTED" tone="warn" />}
      </Between>

      <Row style={{ marginTop: space.md }}>
        <Avatar name={request.user?.name ?? 'Client'} size={40} />
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '700' }}>{request.user?.name ?? 'Client'}</Body>
          <Muted style={{ marginTop: 2 }}>{request.serviceName}</Muted>
        </View>
        {!request.free && <Text style={{ fontWeight: '800', color: c.text }}>${request.price}</Text>}
      </Row>

      {!!request.user?.preferences?.clipperGuard && (
        <Muted style={{ marginTop: space.sm }}>✂ {request.user.preferences.clipperGuard}</Muted>
      )}
      {!!request.notes && <Muted style={{ marginTop: 4 }}>“{request.notes}”</Muted>}

      <Between style={{ marginTop: space.md }}>
        <Muted>Start</Muted>
        {moved && (
          <Pressable onPress={() => setShift(0)} accessibilityRole="button">
            <Text style={{ color: c.accentInk, fontWeight: '700', fontSize: 12 }}>
              Asked for {time(request.startsAt)} · reset
            </Text>
          </Pressable>
        )}
      </Between>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
        {NUDGES.map((n) => (
          <Pressable
            key={n}
            onPress={() => setShift((s) => s + n)}
            accessibilityRole="button"
            accessibilityLabel={`${n > 0 ? 'Later' : 'Earlier'} by ${Math.abs(n)} minutes`}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 13,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: c.line,
              backgroundColor: c.surface2,
            }}
          >
            <Text style={{ fontWeight: '700', fontSize: 12.5, color: c.text }}>
              {n > 0 ? `+${n}` : n}
            </Text>
          </Pressable>
        ))}
      </View>

      <Muted style={{ marginTop: space.md }}>How long will you give it?</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
        {options.map((m) => {
          const on = m === length;
          return (
            <Pressable
              key={m}
              onPress={() => setLength(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 13,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: on ? c.accent : c.line,
                backgroundColor: on ? c.accent : c.surface2,
              }}
            >
              <Text style={{ fontWeight: '700', fontSize: 12.5, color: on ? c.onAccent : c.text }}>
                {m} min
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Row style={{ marginTop: space.md, gap: space.md }}>
        <Button
          title={moved ? `Move to ${time(startsAt.toISOString())} · ${length} min` : `Accept · ${length} min`}
          compact
          style={{ flex: 1 }}
          disabled={busy}
          onPress={() => onAccept(request, length, moved ? startsAt.toISOString() : null)}
        />
        <Button
          title="Decline"
          variant="ghost"
          compact
          style={{ flex: 1 }}
          disabled={busy}
          onPress={() => onDecline(request)}
        />
      </Row>
    </Card>
  );
}

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
  /* Requests are not tied to the day on screen — a decision waiting on you is
     waiting on you whichever date the picker happens to show. */
  const { data: requests, reload: reloadRequests } = useApi<AgendaEntry[]>('/appointments/requests');

  const refresh = useCallback(() => {
    reload(true);
    reloadRequests(true);
  }, [reload, reloadRequests]);

  useSocketEvent('appointment:created', refresh);
  useSocketEvent('appointment:status', refresh);

  /**
   * Accepting is the moment the chair is actually reserved. Nothing was held
   * while the request sat in the inbox — which is what stops one client taking
   * out every slot in the week — so the length chosen here is what gets booked.
   */
  const accept = async (request: AgendaEntry, durationMin: number, movedTo: string | null) => {
    setBusy(true);
    try {
      const res = await api.post<ConfirmResult>(`/appointments/${request.id}/confirm`, {
        durationMin,
        ...(movedTo ? { startsAt: movedTo } : {}),
      });
      const who = request.user?.name.split(' ')[0] ?? 'They';
      const when = movedTo
        ? `moved to ${time(res.appointment.startsAt)}, ${durationMin} min`
        : `in for ${durationMin} min`;
      toast(
        res.declined
          ? `${who} ${when} · ${res.declined} other request${res.declined === 1 ? '' : 's'} declined`
          : `${who} ${when} ✓`,
      );
      refresh();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not accept that request', {
        title: 'Couldn’t accept it',
        icon: '🗓️',
      });
    } finally {
      setBusy(false);
    }
  };

  const decline = async (request: AgendaEntry) => {
    const who = request.user?.name.split(' ')[0] ?? 'this client';
    const ok = await confirm({
      title: `Turn down ${who}?`,
      message: request.free
        ? 'They’re told, and their free cut goes straight back into their card.'
        : 'They’re told, and the time stays open for someone else.',
      icon: '🗓️',
      tone: 'danger',
      confirmLabel: 'Decline it',
      cancelLabel: 'Keep it waiting',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.post(`/appointments/${request.id}/decline`);
      toast(`Declined · ${who} has been told`);
      refresh();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not decline that request', {
        title: 'Couldn’t decline it',
        icon: '🗓️',
      });
    } finally {
      setBusy(false);
    }
  };

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
  const remaining = (agenda ?? []).filter((a) => a.status === 'confirmed').length;
  const waiting = requests?.length ?? 0;

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
          { n: String(waiting), l: 'To answer', accent: waiting > 0 },
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

      {waiting > 0 && (
        <>
          <Heading style={{ marginTop: space.xl }}>Waiting on you</Heading>
          <Muted style={{ marginTop: 2 }}>
            Nothing is held until you accept. Two people can ask for the same time — whoever you
            take gets it, and the rest are told.
          </Muted>
          {requests?.map((r) => (
            <RequestCard key={r.id} request={r} busy={busy} onAccept={accept} onDecline={decline} />
          ))}
        </>
      )}

      <Heading style={{ marginTop: space.xl }}>The day</Heading>
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

              {/* A request has no chair yet, so there is nothing to close out —
                  it is answered in the inbox above. */}
              {a.status === 'pending' ? (
                <Muted style={{ marginTop: space.md }}>Answer this one under “Waiting on you”.</Muted>
              ) : (
                !done && (
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
                )
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
