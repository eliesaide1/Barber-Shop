import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import {
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
} from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useDialog } from '../store/DialogContext';
import { useToast } from '../store/ToastContext';
import { useColors } from '../store/ThemeContext';
import { api, ApiError } from '../api/client';
import { absoluteUrl } from '../config';
import { radius, space } from '../theme';
import type { HaircutRecord } from '../types';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * My haircuts.
 *
 * Two things at once, and the order matters: anything waiting on an answer
 * comes first, because it is a question somebody has asked and not yet had
 * replied to. The rest is the history — what the client can point at next time
 * instead of describing it.
 */
export function HaircutsScreen() {
  const c = useColors();
  const { toast } = useToast();
  const { confirm, showError } = useDialog();
  const { data: records, loading, reload } = useApi<HaircutRecord[]>('/haircuts/mine');
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !records) return <Loading />;

  const pending = (records ?? []).filter((r) => r.status === 'pending');
  const saved = (records ?? []).filter((r) => r.status === 'approved');

  const approve = async (record: HaircutRecord) => {
    setBusy(record.id);
    try {
      await api.post(`/haircuts/${record.id}/approve`);
      toast('Saved to your haircuts ✓');
      reload(true);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not save that', {
        title: 'Couldn’t save it',
        icon: '✂️',
      });
    } finally {
      setBusy(null);
    }
  };

  /* Used for both "no thanks" and "actually, remove that" — they are the same
     act, and both really delete the photograph. */
  const remove = async (record: HaircutRecord, asked: boolean) => {
    const ok = await confirm({
      title: asked ? 'Don’t save this photo?' : 'Remove this haircut?',
      message: 'The photo is deleted from the shop’s system. Nothing is kept.',
      icon: '✂️',
      tone: 'danger',
      confirmLabel: asked ? 'Don’t save it' : 'Remove it',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;

    setBusy(record.id);
    try {
      if (asked) await api.post(`/haircuts/${record.id}/decline`);
      else await api.del(`/haircuts/${record.id}`);
      toast('Deleted');
      reload(true);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not remove that', {
        title: 'Couldn’t remove it',
        icon: '✂️',
      });
    } finally {
      setBusy(null);
    }
  };

  const Photo = ({ uri, size = 96 }: { uri?: string; size?: number }) => (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: c.surface3,
      }}
    >
      {!!uri && <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />}
    </View>
  );

  return (
    <Screen>
      <Title>My haircuts</Title>
      <Muted style={{ marginTop: 2 }}>
        Photos your artist took, kept only if you say so — so the next cut can match the last one.
      </Muted>

      {pending.length > 0 && (
        <>
          <Heading style={{ marginTop: space.xl }}>Waiting on you</Heading>
          {pending.map((r) => (
            <Card key={r.id} style={{ marginTop: space.sm, borderColor: c.accent }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Photo uri={absoluteUrl(r.images[0])} />
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{r.serviceName || 'Your cut'}</Body>
                  <Muted style={{ marginTop: 2 }}>
                    {r.artist?.displayName ?? 'Your artist'} · {when(r.takenAt)}
                  </Muted>
                  {!!r.notes && <Muted style={{ marginTop: 6 }}>“{r.notes}”</Muted>}
                </View>
              </Row>
              <Muted style={{ marginTop: space.md }}>
                Save it to your profile? Only you and the artist cutting your hair can see it.
              </Muted>
              <Row style={{ marginTop: space.md, gap: space.md }}>
                <Button
                  title="Save it"
                  compact
                  style={{ flex: 1 }}
                  disabled={busy === r.id}
                  onPress={() => approve(r)}
                />
                <Button
                  title="No thanks"
                  variant="ghost"
                  compact
                  style={{ flex: 1 }}
                  disabled={busy === r.id}
                  onPress={() => remove(r, true)}
                />
              </Row>
            </Card>
          ))}
        </>
      )}

      <Heading style={{ marginTop: space.xl }}>Your history</Heading>
      {saved.length === 0 ? (
        <View style={{ marginTop: space.sm }}>
          <Empty
            icon="✂️"
            title="Nothing saved yet"
            hint="After a cut, your artist can offer to save a photo. It’s yours — you decide."
          />
        </View>
      ) : (
        saved.map((r) => (
          <Card key={r.id} style={{ marginTop: space.sm }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <Photo uri={absoluteUrl(r.images[0])} />
              <View style={{ flex: 1 }}>
                <Between>
                  <Body style={{ fontWeight: '700' }}>{r.serviceName || 'Haircut'}</Body>
                  <Badge label="SAVED" tone="ok" />
                </Between>
                <Muted style={{ marginTop: 2 }}>
                  {r.artist?.displayName ?? 'Your artist'} · {when(r.takenAt)}
                </Muted>
                {!!r.notes && <Muted style={{ marginTop: 6 }}>“{r.notes}”</Muted>}
              </View>
            </Row>
            {r.images.length > 1 && (
              <Row style={{ marginTop: space.md, gap: space.sm }}>
                {r.images.slice(1).map((img) => (
                  <Photo key={img} uri={absoluteUrl(img)} size={64} />
                ))}
              </Row>
            )}
            <Button
              title="Remove"
              variant="danger"
              compact
              style={{ marginTop: space.md }}
              disabled={busy === r.id}
              onPress={() => remove(r, false)}
            />
          </Card>
        ))
      )}

      {saved.length > 0 && (
        <Card style={{ marginTop: space.lg }}>
          <Text style={{ fontSize: 20 }}>💈</Text>
          <Muted style={{ marginTop: 6, lineHeight: 19 }}>
            When you book, you can pick one of these as “this again” — your artist sees the photo and
            the notes before you sit down.
          </Muted>
        </Card>
      )}
    </Screen>
  );
}
