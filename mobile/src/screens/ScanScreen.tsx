import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import {
  Camera,
  VisionCamera,
  isScannedCode,
  useCameraPermission,
  type ScannedObject,
  type CameraObjectOutput,
} from 'react-native-vision-camera';
import {
  Badge,
  Between,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Muted,
  PunchStrip,
  QRCode,
  Screen,
  Title,
} from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useColors } from '../store/ThemeContext';
import { useToast } from '../store/ToastContext';
import { useDialog } from '../store/DialogContext';
import { useAuth } from '../store/AuthContext';
import { api, ApiError } from '../api/client';
import { radius, space } from '../theme';
import type { LoyaltyCard, Reward } from '../types';

interface CheckInResult {
  stamps: number;
  goal: number;
  artist: { id: string; displayName: string };
  reward: Reward | null;
  card: LoyaltyCard;
}

export function ScanScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const focused = useIsFocused();
  const { toast } = useToast();
  const { showError } = useDialog();
  const { config } = useAuth();

  const { hasPermission, requestPermission } = useCameraPermission();
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);

  const { data: card, reload } = useApi<LoyaltyCard>('/loyalty/card');
  const goal = card?.goal ?? config?.loyaltyGoal ?? 5;
  const stamps = card?.stamps ?? 0;

  /* Camera reads fire continuously — swallow repeats while one is in flight
     and for a moment after, or a single QR becomes a burst of requests. */
  const lock = useRef(0);

  const submit = useCallback(
    async (code: string) => {
      if (!code.trim() || busy) return;
      setBusy(true);
      try {
        const res = await api.post<CheckInResult>('/loyalty/check-in', { code: code.trim() });
        setResult(res);
        setManual('');
        reload(true);
      } catch (err) {
        showError(err instanceof ApiError ? err.message : 'Could not check in', {
          title: 'Couldn’t check you in',
          icon: '💈',
        });
        /* Back off a little longer after a rejection so a stale QR in frame
           doesn't hammer the API. */
        lock.current = Date.now() + 4000;
      } finally {
        setBusy(false);
      }
    },
    [busy, showError, reload],
  );

  const onObjectsScanned = useCallback(
    (objects: ScannedObject[]) => {
      if (Date.now() < lock.current) return;
      const code = objects.find(isScannedCode);
      if (!code?.value) return;
      lock.current = Date.now() + 3000;
      submit(code.value);
    },
    [submit],
  );

  /* Not a device limitation — vision-camera 5.x simply has not implemented
     code scanning on Android. Its createObjectOutput() is a bare `throw` with
     no capability check, so every Android phone lands here; the feature is
     iOS-only in the 5.x line, and 5.2.1 is the newest release.

     Rather than let that take the screen down, we detect it once and fall back
     to the typed code — which is exactly why the artist's portal prints a
     6-character code under the QR. Built by hand rather than with
     useObjectOutput() so the throw is catchable. */
  const scanner = useMemo<{ output: CameraObjectOutput | null; supported: boolean }>(() => {
    try {
      return { output: VisionCamera.createObjectOutput({ enabledObjectTypes: ['qr'] }), supported: true };
    } catch {
      return { output: null, supported: false };
    }
  }, []);

  useEffect(() => {
    scanner.output?.setOnObjectsScannedCallback(onObjectsScanned);
  }, [scanner, onObjectsScanned]);

  useEffect(() => {
    if (scanner.supported && !hasPermission) requestPermission();
  }, [scanner.supported, hasPermission, requestPermission]);

  const cameraReady = scanner.supported && hasPermission && focused && !result;

  return (
    <Screen>
      <Between>
        <View style={{ flex: 1 }}>
          <Title>Check in</Title>
          <Muted style={{ marginTop: 2 }}>Scan the code at your artist’s chair</Muted>
        </View>
        <Badge label={`${stamps}/${goal}`} tone="gold" />
      </Between>

      <View
        style={{
          marginTop: space.md,
          aspectRatio: 1,
          borderRadius: radius.xl,
          overflow: 'hidden',
          backgroundColor: '#0b0a09',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {cameraReady && scanner.output ? (
          <Camera
            style={{ position: 'absolute', width: '100%', height: '100%' }}
            device="back"
            isActive={focused && !result}
            outputs={[scanner.output]}
          />
        ) : (
          <Text style={{ fontSize: 44, opacity: 0.35 }}>{scanner.supported ? '📷' : '⌨️'}</Text>
        )}

        {/* viewfinder corners */}
        <View style={{ width: '66%', aspectRatio: 1 }}>
          {[
            { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
            { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
            { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
            { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
          ].map((corner, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: 32,
                height: 32,
                borderWidth: 3,
                borderColor: c.accent,
                borderRadius: 5,
                ...corner,
              }}
            />
          ))}
        </View>
      </View>

      <Muted style={{ textAlign: 'center', marginTop: 10 }}>
        {!scanner.supported
          ? 'Camera scanning isn’t supported on Android yet — type the code instead'
          : !hasPermission
            ? 'Camera permission is needed to scan'
            : busy
              ? 'Checking you in…'
              : 'Point at the code on your artist’s phone'}
      </Muted>

      {scanner.supported && !hasPermission && (
        <Button
          title="Open settings"
          variant="ghost"
          onPress={() => Linking.openSettings()}
          style={{ marginTop: space.md }}
        />
      )}

      <Card style={{ marginTop: space.lg }}>
        <Between>
          <Body style={{ fontWeight: '700' }}>Your card</Body>
          <Muted>{goal - stamps} to go</Muted>
        </Between>
        <View style={{ marginTop: space.md }}>
          <PunchStrip stamps={stamps} goal={goal} />
        </View>
      </Card>

      <Card style={{ marginTop: space.md }}>
        <Body style={{ fontWeight: '700' }}>
          {scanner.supported ? 'Camera not working?' : 'Enter your code'}
        </Body>
        <Muted style={{ marginTop: 6 }}>
          Type the 6-character code printed under your artist’s QR.
        </Muted>
        <Field
          value={manual}
          onChangeText={(v) => setManual(v.toUpperCase())}
          autoCapitalize="characters"
          maxLength={6}
          placeholder="A1B2C3"
          style={{ textAlign: 'center', letterSpacing: 4, fontWeight: '700' }}
        />
        <Button
          title="Check in"
          onPress={() => submit(manual)}
          loading={busy}
          disabled={manual.length < 6}
          style={{ marginTop: space.md }}
        />
      </Card>

      {result && (
        <Card hero style={{ marginTop: space.lg, alignItems: 'center' }}>
          {result.reward ? (
            <>
              <Text style={{ fontSize: 50 }}>🎁</Text>
              <Title style={{ marginTop: 8, textAlign: 'center' }}>Free haircut unlocked!</Title>
              <Muted style={{ marginTop: 6, textAlign: 'center' }}>
                {goal} check-ins done — your next cut is on FadeRoom.
              </Muted>
              <Text
                style={{
                  color: c.text,
                  fontWeight: '800',
                  fontSize: 26,
                  letterSpacing: 5,
                  marginTop: space.md,
                }}
              >
                {result.reward.code}
              </Text>
              <View style={{ marginTop: space.md }}>
                <QRCode value={`FR1|R|${result.reward.code}`} size={170} />
              </View>
              <Muted style={{ marginTop: space.md, textAlign: 'center' }}>
                Show this at the chair. Your artist confirms it in their portal — that’s what marks it used.
              </Muted>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 46 }}>✂️</Text>
              <Title style={{ marginTop: 8 }}>Checked in</Title>
              <Muted style={{ marginTop: 6 }}>
                Stamp {result.stamps} of {result.goal} · {result.artist.displayName}
              </Muted>
              <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>
                <PunchStrip stamps={result.stamps} goal={result.goal} />
              </View>
              <Muted style={{ marginTop: space.lg, textAlign: 'center' }}>
                {result.goal - result.stamps} more and your next cut is free.
              </Muted>
            </>
          )}
          <Button
            title="See my card"
            onPress={() => {
              setResult(null);
              nav.navigate('Loyalty');
            }}
            style={{ marginTop: space.lg, alignSelf: 'stretch' }}
          />
          <Button
            title="Done"
            variant="ghost"
            onPress={() => setResult(null)}
            style={{ marginTop: space.md, alignSelf: 'stretch' }}
          />
        </Card>
      )}
    </Screen>
  );
}
