import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Avatar,
  Badge,
  Between,
  Body,
  Card,
  Empty,
  Field,
  Loading,
  Muted,
  PunchStrip,
  Row,
  Screen,
  Title,
} from '../../components/ui';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { useColors } from '../../store/ThemeContext';
import { ageFrom, frequencyLabel } from '../../lib/clientDetails';
import { space } from '../../theme';
import type { ClientBookEntry } from '../../types';

const lastSeen = (iso: string | null) => {
  if (!iso) return 'Never checked in';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days}d ago`;
  return `${Math.round(days / 7)} wks ago`;
};

/** How overdue a client is, in the shop's terms rather than raw days. */
const standing = (entry: ClientBookEntry) => {
  if (entry.owedRewards > 0) return { tone: 'gold' as const, label: `🎁 ${entry.owedRewards} FREE CUT` };
  if (!entry.lastCheckInAt) return { tone: 'warn' as const, label: 'NEW' };
  const days = (Date.now() - new Date(entry.lastCheckInAt).getTime()) / 86_400_000;
  if (days > 35) return { tone: 'warn' as const, label: 'OVERDUE' };
  if (entry.totalCheckIns >= 20) return { tone: 'gold' as const, label: 'VIP' };
  return { tone: 'ok' as const, label: 'REGULAR' };
};

export function ArtistClientsScreen() {
  const c = useColors();
  const [query, setQuery] = useState('');
  const { data: clients, loading, reload } = useApi<ClientBookEntry[]>('/loyalty/clients');

  /* A stamp landing anywhere in the shop changes this list. */
  useSocketEvent('checkin:new', () => reload(true));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients ?? [];
    return (clients ?? []).filter(
      (e) => e.user.name.toLowerCase().includes(q) || e.user.email.toLowerCase().includes(q),
    );
  }, [clients, query]);

  const owed = (clients ?? []).filter((e) => e.owedRewards > 0).length;
  /* The reason for asking how often somebody cuts. A regular who has drifted
     past their own interval has not changed their habit — they have gone
     somewhere else, and that is worth seeing while it is still recoverable. */
  const overdue = (clients ?? []).filter((e) => e.overdue).length;

  if (loading && !clients) return <Loading label="Loading your book…" />;

  return (
    <Screen>
      <Title>Clients</Title>
      <Muted style={{ marginTop: 2 }}>Everyone with a loyalty card at the shop</Muted>

      <Row style={{ marginTop: space.lg, gap: space.md }}>
        {[
          { n: String(clients?.length ?? 0), l: 'On the book', accent: true },
          { n: String(owed), l: 'Owed a free cut' },
          { n: String(overdue), l: 'Due a visit', accent: overdue > 0 },
        ].map((s) => (
          <Card key={s.l} style={{ flex: 1, padding: space.md }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: s.accent ? c.accentInk : c.text }}>
              {s.n}
            </Text>
            <Muted style={{ fontSize: 11, marginTop: 2 }}>{s.l}</Muted>
          </Card>
        ))}
      </Row>

      <Field
        placeholder="Search by name or email…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {!shown.length ? (
        <View style={{ marginTop: space.lg }}>
          <Empty
            icon="👤"
            title={query ? 'Nobody matches that' : 'No clients yet'}
            hint={query ? undefined : 'They appear here once they have a loyalty card.'}
          />
        </View>
      ) : (
        shown.map((e) => {
          const tag = standing(e);
          return (
            <Card key={e.user._id ?? e.user.id ?? e.user.email} style={{ marginTop: space.md }}>
              <Row>
                <Avatar name={e.user.name} size={44} />
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{e.user.name}</Body>
                  <Muted style={{ marginTop: 2 }}>
                    {e.totalCheckIns} visit{e.totalCheckIns === 1 ? '' : 's'} · {lastSeen(e.lastCheckInAt)}
                  </Muted>
                  <Muted style={{ marginTop: 2 }}>
                    {frequencyLabel(e.user.visitFrequencyWeeks)}
                    {ageFrom(e.user.dateOfBirth) !== null && ` · ${ageFrom(e.user.dateOfBirth)}`}
                    {!!e.user.phone && ` · ${e.user.phone}`}
                  </Muted>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Badge label={tag.label} tone={tag.tone} />
                  {e.overdue && <Badge label="DUE" tone="warn" />}
                </View>
              </Row>

              <Between style={{ marginTop: space.md }}>
                <View style={{ flex: 1, marginRight: space.md }}>
                  <PunchStrip stamps={e.stamps} goal={e.goal} />
                </View>
                <Muted style={{ fontSize: 11 }}>
                  {e.stamps}/{e.goal}
                </Muted>
              </Between>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
