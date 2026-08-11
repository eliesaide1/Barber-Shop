import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import {
  Avatar,
  Badge,
  Between,
  Body,
  Card,
  Empty,
  Heading,
  Loading,
  Muted,
  Row,
  Screen,
  Title,
} from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { absoluteUrl } from '../../config';
import { ageFrom, frequencyLabel } from '../../lib/clientDetails';
import { useColors } from '../../store/ThemeContext';
import { radius, space } from '../../theme';
import type { HaircutRecord } from '../../types';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * One client, as the artist about to cut their hair needs them.
 *
 * The reference attached to a booking covers the client who remembered to pick
 * one. This covers everybody else — which is most people, most of the time.
 * "Reproduce the same haircut during a future visit" cannot depend on the
 * client having done something in advance; the artist has to be able to look
 * them up while they are sitting there.
 *
 * Approved records only, whoever is asking. The one exception the API makes is
 * an artist's own pending proposal, so they can see they have asked and are
 * waiting rather than wondering whether it sent.
 */
export function ArtistClientHistoryScreen() {
  const c = useColors();
  const { params } = useRoute<any>();
  const { userId, name, phone, dateOfBirth, visitFrequencyWeeks } = params ?? {};

  const { data: records, loading } = useApi<HaircutRecord[]>(
    userId ? `/haircuts/client/${userId}` : null,
    [userId],
  );
  const [zoomed, setZoomed] = useState<string | null>(null);

  if (loading && !records) return <Loading label="Looking them up…" />;

  const saved = (records ?? []).filter((r) => r.status === 'approved');
  const waiting = (records ?? []).filter((r) => r.status === 'pending');
  const age = ageFrom(dateOfBirth);

  return (
    <Screen>
      <Row>
        <Avatar name={name ?? 'Client'} size={52} />
        <View style={{ flex: 1 }}>
          <Title>{name ?? 'Client'}</Title>
          <Muted style={{ marginTop: 2 }}>
            {[
              frequencyLabel(visitFrequencyWeeks),
              age !== null ? `${age}` : null,
              phone,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Muted>
        </View>
      </Row>

      {waiting.length > 0 && (
        <Card style={{ marginTop: space.lg, borderColor: c.line }}>
          <Muted>
            {waiting.length === 1 ? 'One photo is' : `${waiting.length} photos are`} waiting on{' '}
            {name?.split(' ')[0] ?? 'them'} to approve. It appears here once they do.
          </Muted>
        </Card>
      )}

      <Heading style={{ marginTop: space.xl }}>Past cuts</Heading>
      {saved.length === 0 ? (
        <View style={{ marginTop: space.sm }}>
          <Empty
            icon="✂️"
            title="Nothing saved yet"
            hint="After a cut, offer to photograph it. With their approval it lands here for next time."
          />
        </View>
      ) : (
        saved.map((r) => (
          <Card key={r.id} style={{ marginTop: space.md }}>
            <Between>
              <Body style={{ fontWeight: '700' }}>{r.serviceName || 'Haircut'}</Body>
              <Badge label={when(r.takenAt)} tone="dim" />
            </Between>

            {/* Tap to fill the width. A thumbnail is enough to recognise a cut
                and not enough to copy one. */}
            <Row style={{ marginTop: space.md, gap: space.sm, flexWrap: 'wrap' }}>
              {r.images.map((img) => {
                const uri = absoluteUrl(img);
                const big = zoomed === img;
                return (
                  <Pressable key={img} onPress={() => setZoomed(big ? null : img)}>
                    <Image
                      source={{ uri }}
                      style={{
                        width: big ? 300 : 92,
                        height: big ? 300 : 92,
                        borderRadius: radius.md,
                        backgroundColor: c.surface3,
                      }}
                      resizeMode="cover"
                    />
                  </Pressable>
                );
              })}
            </Row>

            {/* The half a photograph cannot carry, and the half that actually
                lets somebody repeat the cut. */}
            {!!r.notes && (
              <View
                style={{
                  marginTop: space.md,
                  padding: space.md,
                  borderRadius: radius.md,
                  backgroundColor: c.surface2,
                }}
              >
                <Muted style={{ fontSize: 11, fontWeight: '700', marginBottom: 3 }}>HOW IT WAS DONE</Muted>
                <Body>{r.notes}</Body>
              </View>
            )}

            <Muted style={{ marginTop: space.sm, fontSize: 11.5 }}>
              {r.artist?.displayName ?? 'A colleague'}
            </Muted>
          </Card>
        ))
      )}

      {saved.length > 0 && (
        <Muted style={{ marginTop: space.lg, textAlign: 'center' }}>
          <Text>Tap a photo to enlarge it.</Text>
        </Muted>
      )}
    </Screen>
  );
}
