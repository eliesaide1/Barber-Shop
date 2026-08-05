import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Badge,
  Between,
  Body,
  Button,
  Card,
  Divider,
  Heading,
  Loading,
  Muted,
  PunchStrip,
  QRCode,
  Row,
  Screen,
  Title,
} from '../components/ui';
import { useApi, useSocketEvent } from '../hooks/useApi';
import { useColors } from '../store/ThemeContext';
import { useToast } from '../store/ToastContext';
import { space } from '../theme';
import type { LoyaltyCard, Reward } from '../types';

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 14 ? `${days}d ago` : `${Math.round(days / 7)} wks ago`;
};

export function LoyaltyScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { toast } = useToast();
  const { data: card, loading, reload } = useApi<LoyaltyCard>('/loyalty/card');
  const [showing, setShowing] = useState<Reward | null>(null);

  /* The artist burns a reward in their portal — the card updates here live. */
  useSocketEvent('loyalty:updated', () => {
    reload(true);
    toast('Your loyalty card was updated');
  });

  if (loading && !card) return <Loading />;
  if (!card) return null;

  const live = card.rewards.filter((r) => r.status !== 'redeemed');
  const used = card.rewards.filter((r) => r.status === 'redeemed');
  const left = card.goal - card.stamps;

  return (
    <Screen>
      <Title>Loyalty card</Title>
      <Muted style={{ marginTop: 2 }}>Every {card.goal} check-ins = 1 free haircut</Muted>

      <Card hero style={{ marginTop: space.lg, alignItems: 'center' }}>
        <Badge label="FADEROOM CLUB" tone="gold" />
        <Row style={{ alignItems: 'baseline', marginTop: 10, gap: 2 }}>
          <Text style={{ fontSize: 44, fontWeight: '800', color: c.text }}>{card.stamps}</Text>
          <Text style={{ fontSize: 20, color: c.muted, fontWeight: '700' }}>/{card.goal}</Text>
        </Row>
        <Muted>check-ins toward your free cut</Muted>
        <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>
          <PunchStrip stamps={card.stamps} goal={card.goal} />
        </View>
        <Muted style={{ marginTop: space.lg }}>
          {left === card.goal ? 'Scan at the chair after your next cut' : `${left} to go`}
        </Muted>
        <Button
          title="Scan to check in"
          onPress={() => nav.navigate('Tabs', { screen: 'Scan' })}
          style={{ marginTop: space.md, alignSelf: 'stretch' }}
        />
      </Card>

      {live.length > 0 && (
        <>
          <Heading style={{ marginTop: space.xl }}>Ready to use</Heading>
          {live.map((r) => (
            <Card key={r.code} style={{ marginTop: space.sm, borderColor: c.accent, backgroundColor: c.accentSoft }}>
              <Between>
                <View>
                  <Body style={{ fontWeight: '800' }}>🎁 Free haircut</Body>
                  <Muted style={{ marginTop: 4 }}>
                    Earned {ago(r.earnedAt)} · worth ${card.freeCutValue}
                  </Muted>
                </View>
                <Badge label={r.status === 'reserved' ? 'ON A BOOKING' : 'AVAILABLE'} tone="gold" />
              </Between>
              <Divider />
              <Between>
                <Muted>Claim code</Muted>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 22, letterSpacing: 4 }}>{r.code}</Text>
              </Between>
              <Button
                title={showing?.code === r.code ? 'Hide code' : 'Show to my artist'}
                onPress={() => setShowing(showing?.code === r.code ? null : r)}
                style={{ marginTop: space.lg }}
              />
              {showing?.code === r.code && (
                <View style={{ alignItems: 'center', marginTop: space.lg }}>
                  <QRCode value={`FR1|R|${r.code}`} size={190} />
                  <Muted style={{ marginTop: space.md, textAlign: 'center' }}>
                    It stays valid until your artist redeems it — you can’t mark it used yourself.
                  </Muted>
                </View>
              )}
            </Card>
          ))}
        </>
      )}

      <Heading style={{ marginTop: space.xl }}>How it works</Heading>
      <Card style={{ marginTop: space.sm }}>
        {[
          ['📷', <>After every cut, scan the QR on your artist’s phone. That’s <Text style={{ fontWeight: '700' }}>one stamp</Text>.</>],
          ['🔄', 'The QR changes every minute, so it only works while you’re at the chair — a screenshot won’t.'],
          ['1️⃣', 'One stamp per visit. Scanning again in the same session won’t add another.'],
          ['🎁', <>The {card.goal}th stamp turns into a <Text style={{ fontWeight: '700' }}>free haircut</Text> and your card starts over at 0.</>],
          ['✅', <>Show your claim code at the chair — <Text style={{ fontWeight: '700' }}>your artist</Text> confirms it. Free cut = a standard haircut (${card.freeCutValue}); add-ons are still charged.</>],
        ].map(([icon, text], i) => (
          <Row key={i} style={{ alignItems: 'flex-start', paddingVertical: 9 }}>
            <Text style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{icon as string}</Text>
            <Muted style={{ flex: 1, lineHeight: 19 }}>{text as React.ReactNode}</Muted>
          </Row>
        ))}
      </Card>

      <Heading style={{ marginTop: space.xl }}>Card history</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Between><Muted>Lifetime check-ins</Muted><Body style={{ fontWeight: '700' }}>{card.totalCheckIns}</Body></Between>
        <Between style={{ marginTop: space.md }}>
          <Muted>Free cuts earned</Muted><Body style={{ fontWeight: '700' }}>{card.rewards.length}</Body>
        </Between>
        <Between style={{ marginTop: space.md }}>
          <Muted>Free cuts used</Muted><Body style={{ fontWeight: '700' }}>{used.length}</Body>
        </Between>
      </Card>

      {card.history.length > 0 && (
        <Card style={{ marginTop: space.md }}>
          {card.history
            .slice()
            .reverse()
            .map((s, i) => (
              <Row key={`${s.at}-${i}`} style={{ paddingVertical: 10 }}>
                <Text style={{ fontSize: 18 }}>✂</Text>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600' }}>
                    Stamp {card.history.length - i} of {card.goal}
                  </Body>
                  <Muted style={{ marginTop: 2 }}>{ago(s.at)}</Muted>
                </View>
                <Badge label="✓" tone="ok" />
              </Row>
            ))}
        </Card>
      )}
    </Screen>
  );
}
