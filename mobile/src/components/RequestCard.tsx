import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar, Badge, Between, Body, Button, Card, Muted, Row } from '../components/ui';
import { useColors } from '../store/ThemeContext';
import { useT } from '../store/CopyContext';
import { dayLabel, time } from '../lib/chairTime';
import { radius, space } from '../theme';
import type { AgendaEntry } from '../types';

const LENGTHS = [10, 15, 20, 25, 30, 40, 45, 60, 75, 90];

/* Nudges rather than a date picker. Moving a booking at the chair is "push them
   back a quarter of an hour", not "open a calendar" — and it keeps a native
   picker dependency out of the build for a control used in one place. */
const NUDGES = [-30, -15, -5, +5, +15, +30];

export function RequestCard({
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
  const t = useT();
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
        <Badge label={t('artistSchedule.requested', 'REQUESTED')} tone="warn" />
      </Between>

      <Row style={{ marginTop: space.md }}>
        <Avatar name={request.user?.name ?? 'Client'} size={40} />
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '700' }}>{request.user?.name ?? 'Client'}</Body>
          <Muted style={{ marginTop: 2 }}>{request.serviceName}</Muted>
        </View>
        <Text style={{ fontWeight: '800', color: c.text }}>${request.price}</Text>
      </Row>

      {!!request.user?.preferences?.clipperGuard && (
        <Muted style={{ marginTop: space.sm }}>✂ {request.user.preferences.clipperGuard}</Muted>
      )}
      {!!request.notes && <Muted style={{ marginTop: 4 }}>“{request.notes}”</Muted>}

      <Between style={{ marginTop: space.md }}>
        <Muted>{t('artistSchedule.start', 'Start')}</Muted>
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

      <Muted style={{ marginTop: space.md }}>{t('artistSchedule.howLongWillYou', 'How long will you give it?')}</Muted>
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
          title={t('artistSchedule.decline', 'Decline')}
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
