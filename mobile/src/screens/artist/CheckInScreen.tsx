import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
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
  Muted,
  QRCode,
  Row,
  Screen,
  Title,
} from '../../components/ui';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { useAuth } from '../../store/AuthContext';
import { useColors } from '../../store/ThemeContext';
import { useDialog } from '../../store/DialogContext';
import { useToast } from '../../store/ToastContext';
import { api, ApiError } from '../../api/client';
import { space } from '../../theme';
import type { CheckInEvent, CheckInToken, RewardLookup } from '../../types';

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
};

const KIND: Record<string, { tone: 'ok' | 'gold'; label: string }> = {
  stamp: { tone: 'ok', label: 'CHECKED IN' },
  earned: { tone: 'gold', label: '🎁 EARNED' },
  redeemed: { tone: 'gold', label: '🎁 USED' },
};

export function ArtistCheckInScreen() {
  const c = useColors();
  const focused = useIsFocused();
  const { config } = useAuth();
  const { toast } = useToast();
  const { confirm, showError } = useDialog();

  const [qr, setQr] = useState<CheckInToken | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [claim, setClaim] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: feed, reload: reloadFeed } = useApi<CheckInEvent[]>('/loyalty/check-ins');

  const pullToken = useCallback(async () => {
    try {
      setQr(await api.get<CheckInToken>('/loyalty/check-in-token'));
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not get a code', {
        title: 'Couldn’t get a check-in code',
        icon: '💈',
      });
    }
  }, [showError]);

  useEffect(() => {
    if (focused) pullToken();
  }, [focused, pullToken]);

  useEffect(() => {
    if (qr) setRemaining(qr.expiresInMs);
  }, [qr]);

  /* Count the live token down and pull a fresh one the moment it lapses. The
     rotation is the whole point — it is what makes a photographed code
     worthless a minute later. Only runs while the screen is on top. */
  useEffect(() => {
    if (!focused) return undefined;
    timer.current = setInterval(() => {
      setRemaining((ms) => {
        if (ms <= 1000) {
          pullToken();
          return 0;
        }
        return ms - 1000;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [focused, pullToken]);

  useSocketEvent('checkin:new', (event: CheckInEvent) => {
    reloadFeed(true);
    const who = event.userName?.split(' ')[0] ?? 'A client';
    toast(event.kind === 'earned' ? `${who} just earned a free cut 🎁` : `${who} checked in`);
  });

  const redeem = async () => {
    const code = claim.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    try {
      const found = await api.get<RewardLookup>(`/loyalty/rewards/${encodeURIComponent(code)}`);

      const ok = await confirm({
        title: 'Valid free cut',
        message: `${found.client.name} · one standard haircut, worth $${found.value}. Redeeming burns the code — it cannot be used again.`,
        icon: '🎁',
        confirmLabel: 'Redeem — this cut is free',
        cancelLabel: 'Not now',
      });
      if (!ok) return;

      const res = await api.post<{ client: string }>(`/loyalty/rewards/${found.reward.code}/redeem`);
      toast(`Free cut redeemed for ${res.client} ✓`);
      setClaim('');
      reloadFeed(true);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not redeem that code', {
        title: 'Couldn’t redeem that free cut',
        icon: '🎁',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Check-in</Title>
      <Muted style={{ marginTop: 2 }}>Show this once the cut is done</Muted>

      <Card hero style={{ marginTop: space.lg, alignItems: 'center' }}>
        <Badge label="SHOW THIS TO YOUR CLIENT" tone="gold" />
        <View style={{ marginTop: space.lg }}>
          {qr ? <QRCode value={qr.token} size={220} /> : <Muted>Getting a code…</Muted>}
        </View>

        <Between style={{ alignSelf: 'stretch', marginTop: space.lg, alignItems: 'flex-end' }}>
          <View>
            <Muted style={{ fontSize: 11 }}>Or read out this code</Muted>
            <Text
              style={{
                color: c.text,
                fontWeight: '800',
                fontSize: 24,
                letterSpacing: 4,
                marginTop: 2,
              }}
            >
              {qr?.code ?? '——————'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Muted style={{ fontSize: 11 }}>Refreshes in</Muted>
            <Text style={{ color: c.accentInk, fontWeight: '800', fontSize: 22 }}>
              {Math.ceil(remaining / 1000)}s
            </Text>
          </View>
        </Between>

        <Muted style={{ marginTop: space.md, textAlign: 'center', fontSize: 11.5 }}>
          Never print it or leave it on display. It stops working within the minute, which is what
          proves the client was at the chair.
        </Muted>
      </Card>

      <Heading style={{ marginTop: space.xl }}>Redeem a free cut</Heading>
      <Card style={{ marginTop: space.sm }}>
        <Muted>Ask for the client’s 6-character claim code, or read it off their phone.</Muted>
        <Field
          value={claim}
          onChangeText={(v) => setClaim(v.toUpperCase())}
          autoCapitalize="characters"
          maxLength={20}
          placeholder="CLAIM CODE"
          style={{ textAlign: 'center', letterSpacing: 4, fontWeight: '700' }}
        />
        <Button
          title="Check the code"
          onPress={redeem}
          loading={busy}
          disabled={claim.trim().length < 6}
          style={{ marginTop: space.md }}
        />
      </Card>

      <Between style={{ marginTop: space.xl }}>
        <Heading>Today’s activity</Heading>
        <Badge label={`${feed?.length ?? 0} events`} />
      </Between>

      {!feed?.length ? (
        <View style={{ marginTop: space.sm }}>
          <Empty icon="💈" title="No check-ins yet" />
        </View>
      ) : (
        <Card style={{ marginTop: space.sm }}>
          {feed.map((e, i) => {
            const meta = KIND[e.kind] ?? KIND.stamp;
            return (
              <View key={e._id ?? e.id ?? `${e.at}-${i}`}>
                {i > 0 && <Divider />}
                <Row>
                  <Avatar name={e.userName} size={36} />
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: '700' }}>{e.userName}</Body>
                    <Muted style={{ marginTop: 2 }}>
                      {e.kind === 'stamp'
                        ? `Stamp ${e.stampNumber} of ${config?.loyaltyGoal ?? 5}`
                        : `Claim ${e.code}`}
                      {' · '}
                      {ago(e.at)}
                    </Muted>
                  </View>
                  <Badge label={meta.label} tone={meta.tone} />
                </Row>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
