import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Between, Body, Card, Heading, Muted, Screen, Title } from '../components/ui';
import { useAuth } from '../store/AuthContext';
import { useColors } from '../store/ThemeContext';
import { deviceFacts, platformLabel, type DeviceFacts } from '../lib/device';
import { space } from '../theme';

/**
 * What this phone is, and who is signed in on it.
 *
 * Exists for the conversation that starts "it isn't working" — where the first
 * three questions are always which phone, which version, and which account, and
 * none of them can be answered from a screenshot of the thing going wrong. The
 * same facts are reported to the server on every foreground, so what is on this
 * screen is what the shop sees.
 */
export function DeviceScreen() {
  const c = useColors();
  const { user, artist, isArtist } = useAuth();
  const [facts, setFacts] = useState<DeviceFacts | null>(null);

  useEffect(() => {
    let cancelled = false;
    deviceFacts().then((f) => !cancelled && setFacts(f));
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: [string, string][] = [
    ['Device', facts ? platformLabel(facts.platform) : '…'],
    ['Model', facts?.model || '…'],
    ['OS version', facts?.osVersion || '…'],
  ];

  const appRows: [string, string][] = [
    ['App version', facts?.appVersion || '…'],
    ['Build', facts?.buildNumber || '…'],
  ];

  const accountRows: [string, string][] = [
    ['Signed in as', user?.name || '—'],
    ['Email', user?.email || '—'],
    /* Spelled out rather than shown as the raw role, because "client" is not a
       word anybody uses about themselves in a barbershop. */
    ['Account', isArtist ? `Artist${artist?.displayName ? ` · ${artist.displayName}` : ''}` : user?.role === 'admin' ? 'Shop admin' : 'Client'],
  ];

  const Rows = ({ items }: { items: [string, string][] }) => (
    <Card style={{ marginTop: space.sm }}>
      {items.map(([label, value], i) => (
        <Between
          key={label}
          style={{
            paddingVertical: space.md,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: c.line,
          }}
        >
          <Muted>{label}</Muted>
          <Body style={{ maxWidth: '60%', textAlign: 'right' }}>{value}</Body>
        </Between>
      ))}
    </Card>
  );

  return (
    <Screen>
      <Title>This device</Title>
      <Muted style={{ marginTop: space.xs }}>
        Handy if you ever need to tell the shop what you are running.
      </Muted>

      <Heading style={{ marginTop: space.xl }}>Device</Heading>
      <Rows items={rows} />

      <Heading style={{ marginTop: space.xl }}>App</Heading>
      <Rows items={appRows} />

      <Heading style={{ marginTop: space.xl }}>Account</Heading>
      <Rows items={accountRows} />

      <View style={{ height: space.xxl }} />
    </Screen>
  );
}
