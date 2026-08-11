import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
  Loading,
  Muted,
  Row,
  Screen,
  Title,
} from '../components/ui';
import { useApi } from '../hooks/useApi';
import { nextRewardToUse, rewardTitle } from '../lib/rewards';
import { useAuth } from '../store/AuthContext';
import { useColors } from '../store/ThemeContext';
import { useToast } from '../store/ToastContext';
import { useDialog } from '../store/DialogContext';
import { api, ApiError } from '../api/client';
import { absoluteUrl } from '../config';
import { radius, space } from '../theme';
import type { Artist, HaircutRecord, LoyaltyCard, Service, Slot } from '../types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const nextSevenDays = () =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return {
      date: d,
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      label: i === 0 ? 'Today' : DAY_NAMES[d.getDay()],
      day: d.getDate(),
      weekday: d.getDay(),
    };
  });

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
};

export function BookScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { toast } = useToast();
  const { showError } = useDialog();

  const days = useMemo(nextSevenDays, []);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notes, setNotes] = useState('');
  const [useReward, setUseReward] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { config } = useAuth();
  const { data: artists, loading: loadingArtists } = useApi<Artist[]>('/artists');
  const { data: services } = useApi<Service[]>('/services');
  const { data: card } = useApi<LoyaltyCard>('/loyalty/card');
  /* Approved only — the server filters, and a pending photo must never be
     offered as something to show an artist. */
  const { data: allCuts } = useApi<HaircutRecord[]>('/haircuts/mine');
  const haircuts = (allCuts ?? []).filter((h) => h.status === 'approved');

  const artist = artists?.find((a) => a.id === artistId) ?? artists?.[0] ?? null;
  const service = services?.find((s) => s.id === serviceId) ?? services?.[0] ?? null;
  const day = days[dayIndex];

  const availabilityPath =
    artist && service ? `/appointments/availability?artist=${artist.id}&date=${day.iso}&service=${service.id}` : null;
  const { data: availability, loading: loadingSlots } = useApi<{
    dayOff: boolean;
    slots: Slot[];
  }>(availabilityPath, [artist?.id, service?.id, day.iso]);

  /* Live only, and the soonest to expire first — matching what the server will
     actually reserve, so the code shown here is the code that gets attached. */
  const freeCut = nextRewardToUse(card?.rewards);

  /**
   * This asks for a time; it does not take one.
   *
   * The chair is reserved when the artist accepts and says how long to give the
   * cut — which is also what stops one person taking every slot in the week.
   */
  const requestSlot = async () => {
    if (!artist || !service || !slot) return;
    setBusy(true);
    try {
      await api.post('/appointments', {
        artist: artist.id,
        service: service.id,
        startsAt: slot.startsAt,
        notes,
        useReward: useReward && !!freeCut,
        ...(reference ? { reference } : {}),
      });
      toast(`Sent to ${artist.displayName.split(' ')[0]} 💈`);
      setSlot(null);
      setNotes('');
      setUseReward(false);
      setReference(null);
      nav.navigate('Appointments');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not send that request', {
        title: 'Couldn’t send your request',
        icon: '🗓️',
      });
    } finally {
      setBusy(false);
    }
  };

  if (loadingArtists && !artists) return <Loading />;

  return (
    <Screen>
      <Title>Book</Title>
      <Muted style={{ marginTop: 2 }}>FadeRoom · Mar Mikhael, Beirut</Muted>

      <Heading style={{ marginTop: space.xl }}>1 · Choose your artist</Heading>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
        <Row style={{ gap: space.sm, paddingRight: space.lg }}>
          {artists?.map((a) => {
            const active = a.id === artist?.id;
            return (
              <Pressable
                key={a.id}
                onPress={() => {
                  setArtistId(a.id);
                  setSlot(null);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 9,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: radius.md,
                  backgroundColor: active ? c.accent : c.surface2,
                  borderColor: active ? c.accent : c.line,
                  borderWidth: 1,
                }}
              >
                <Avatar name={a.displayName} size={30} />
                <Text style={{ color: active ? c.onAccent : c.text, fontWeight: '700' }}>
                  {a.displayName.split(' ')[0]}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </ScrollView>

      {artist && (
        <Card style={{ marginTop: space.md }}>
          <Row>
            <Avatar name={artist.displayName} size={44} />
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }}>{artist.displayName}</Body>
              <Muted style={{ marginTop: 3 }}>{artist.specialty}</Muted>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: c.accentInk, fontWeight: '700' }}>★ {artist.rating}</Text>
              <Muted style={{ fontSize: 10 }}>{artist.reviewsCount} reviews</Muted>
            </View>
          </Row>
        </Card>
      )}

      <Heading style={{ marginTop: space.xl }}>2 · Choose a service</Heading>
      <Card style={{ marginTop: space.sm, paddingVertical: space.sm }}>
        {services?.map((s, i) => {
          const active = s.id === service?.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                setServiceId(s.id);
                setSlot(null);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingVertical: space.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.line,
              }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  borderWidth: 2,
                  borderColor: active ? c.accent : c.line,
                  backgroundColor: active ? c.accent : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {active && <Text style={{ color: c.onAccent, fontWeight: '800', fontSize: 14 }}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }}>{s.name}</Body>
                <Muted style={{ marginTop: 2 }}>{s.description} · {s.durationMin} min</Muted>
              </View>
              <Text style={{ color: c.text, fontWeight: '800' }}>${s.price}</Text>
            </Pressable>
          );
        })}
      </Card>

      <Heading style={{ marginTop: space.xl }}>3 · Pick a day</Heading>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
        <Row style={{ gap: space.sm, paddingRight: space.lg }}>
          {days.map((d, i) => {
            const active = i === dayIndex;
            const off = artist?.daysOff.includes(d.weekday);
            return (
              <Pressable
                key={d.iso}
                onPress={() => {
                  setDayIndex(i);
                  setSlot(null);
                }}
                style={{
                  width: 56,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderRadius: radius.md,
                  backgroundColor: active ? c.accent : c.surface2,
                  borderColor: active ? c.accent : c.line,
                  borderWidth: 1,
                  opacity: off ? 0.4 : 1,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: active ? c.onAccent : c.muted }}>
                  {d.label}
                </Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: active ? c.onAccent : c.text, marginTop: 2 }}>
                  {d.day}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </ScrollView>

      <Heading style={{ marginTop: space.xl }}>4 · Ask for a time</Heading>
      <Muted style={{ marginTop: 4 }}>
        {artist?.displayName.split(' ')[0] ?? 'Your artist'} confirms how long your cut needs, and
        may shift it a little to make it fit. Nothing is held until then — a time others have asked
        for is still worth asking for.
      </Muted>
      {loadingSlots && !availability ? (
        <Loading label="Checking the chair…" />
      ) : availability?.dayOff ? (
        <View style={{ marginTop: space.md }}>
          <Empty
            icon="💈"
            title={`${artist?.displayName.split(' ')[0]} is off this day`}
            hint="Pick another day or another artist."
          />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
          {availability?.slots.map((s) => {
            const selected = slot?.startsAt === s.startsAt;
            return (
              <Pressable
                key={s.startsAt}
                onPress={s.available ? () => setSlot(s) : undefined}
                style={{
                  width: '31.5%',
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: selected ? c.accent : c.line,
                  backgroundColor: selected ? c.accentSoft : c.surface2,
                  opacity: s.available ? 1 : 0.3,
                }}
              >
                <Text
                  style={{
                    fontSize: 13.5,
                    fontWeight: '600',
                    color: selected ? c.accentInk : c.text,
                    textDecorationLine: s.available ? 'none' : 'line-through',
                  }}
                >
                  {to12h(s.time)}
                </Text>
                {/* Say who else is in the queue rather than hiding it. The slot
                    is still yours to ask for — the artist picks. */}
                {s.available && s.requested > 0 && (
                  <Muted style={{ fontSize: 10, marginTop: 2 }}>
                    {s.requested} asked
                  </Muted>
                )}
              </Pressable>
            );
          })}
          {availability?.slots.length === 0 && (
            <Muted style={{ padding: space.lg }}>No slots left on this day.</Muted>
          )}
        </View>
      )}

      {!!freeCut && (
        <Pressable
          onPress={() => setUseReward((v) => !v)}
          style={{
            marginTop: space.lg,
            padding: space.lg,
            borderRadius: radius.lg,
            borderWidth: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            borderColor: useReward ? c.accent : c.line,
            backgroundColor: useReward ? c.accentSoft : c.surface,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: useReward ? c.accent : c.line,
              backgroundColor: useReward ? c.accent : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {useReward && <Text style={{ color: c.onAccent, fontWeight: '800', fontSize: 13 }}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>🎁 Use my free haircut</Body>
            <Muted style={{ marginTop: 2 }}>
              Code {freeCut.code} · your artist confirms it at the chair
            </Muted>
          </View>
        </Pressable>
      )}

      {/* "This again" beats describing it. Only approved cuts appear — a photo
          still awaiting an answer is not one to put in front of an artist. */}
      {!!haircuts?.length && (
        <>
          <Heading style={{ marginTop: space.xl }}>Same as one of these?</Heading>
          <Muted style={{ marginTop: 4 }}>
            Your artist sees the photo and how it was done, before you sit down.
          </Muted>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
            <Row style={{ gap: space.sm, paddingRight: space.lg }}>
              {haircuts.map((h) => {
                const on = reference === h.id;
                return (
                  <Pressable
                    key={h.id}
                    onPress={() => setReference(on ? null : h.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{
                      width: 104,
                      borderRadius: radius.md,
                      borderWidth: 2,
                      borderColor: on ? c.accent : c.line,
                      overflow: 'hidden',
                      backgroundColor: c.surface2,
                    }}
                  >
                    <Image
                      source={{ uri: absoluteUrl(h.images[0]) }}
                      style={{ width: '100%', height: 104 }}
                    />
                    <View style={{ padding: 7 }}>
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: 11, fontWeight: '700', color: on ? c.accentInk : c.text }}
                      >
                        {on ? '✓ This one' : h.serviceName || 'Haircut'}
                      </Text>
                      <Muted style={{ fontSize: 10, marginTop: 1 }}>
                        {new Date(h.takenAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                      </Muted>
                    </View>
                  </Pressable>
                );
              })}
            </Row>
          </ScrollView>
        </>
      )}

      <Field
        label="Notes for your artist (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. #2 on the sides, keep the top long"
        multiline
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />

      <Card style={{ marginTop: space.lg }}>
        <Between><Muted>Service</Muted><Body style={{ fontWeight: '700' }}>{service?.name ?? '—'}</Body></Between>
        <Between style={{ marginTop: space.sm }}>
          <Muted>Artist</Muted><Body style={{ fontWeight: '700' }}>{artist?.displayName ?? '—'}</Body>
        </Between>
        <Between style={{ marginTop: space.sm }}>
          <Muted>When</Muted>
          <Body style={{ fontWeight: '700' }}>
            {slot ? `${day.label} ${day.day} · ${to12h(slot.time)}` : '—'}
          </Body>
        </Between>
        <Between style={{ marginTop: space.sm }}>
          <Muted>Length</Muted>
          <Body style={{ fontWeight: '700' }}>
            {artist?.displayName.split(' ')[0] ?? 'Your artist'} sets it
          </Body>
        </Between>
        <Divider />
        <Between>
          <Body style={{ fontWeight: '700' }}>Total</Body>
          {useReward && freeCut ? (
            <Row style={{ gap: 8 }}>
              <Text style={{ color: c.muted, textDecorationLine: 'line-through' }}>${service?.price}</Text>
              <Badge label="FREE 🎁" tone="gold" />
            </Row>
          ) : (
            <Text style={{ color: c.accentInk, fontWeight: '800', fontSize: 18 }}>${service?.price ?? 0}</Text>
          )}
        </Between>
      </Card>

      <Button
        title={slot ? 'Ask for this time' : 'Pick a time first'}
        disabled={!slot}
        loading={busy}
        onPress={requestSlot}
        style={{ marginTop: space.lg }}
      />
      <Muted style={{ textAlign: 'center', marginTop: space.sm }}>
        You’ll hear back in the app. Up to {config?.maxOpenRequests ?? 3} requests can be waiting at once.
      </Muted>
    </Screen>
  );
}
