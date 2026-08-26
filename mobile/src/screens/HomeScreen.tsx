import React from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
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
  Muted,
  PunchStrip,
  Row,
  Screen,
  Title,
} from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { Icon } from '../components/Icon';
import { CartButton } from './ShopScreens';
import { useApi, useSocketEvent } from '../hooks/useApi';
import { nextRewardToUse } from '../lib/rewards';
import { useAuth } from '../store/AuthContext';
import { useCart } from '../store/CartContext';
import { useColors } from '../store/ThemeContext';
import { useToast } from '../store/ToastContext';
import { useNotifications } from '../store/NotificationsContext';
import { absoluteUrl } from '../config';
import { useDialog } from '../store/DialogContext';
import { radius, space } from '../theme';
import type { Appointment, Artist, LoyaltyCard, Order, Product, StyleLook } from '../types';

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (same(d, today)) return `Today · ${time}`;
  if (same(d, tomorrow)) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
};

export function HomeScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const cart = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const { showError } = useDialog();
  const { unread } = useNotifications();

  const { data: appointments, reload: reloadAppointments } = useApi<Appointment[]>('/appointments');
  const { data: card, reload: reloadCard } = useApi<LoyaltyCard>('/loyalty/card');
  const { data: artists, reload: reloadArtists } = useApi<Artist[]>('/artists');
  const { data: products, reload: reloadProducts } = useApi<Product[]>('/products?limit=6');
  const { data: orders, reload: reloadOrders } = useApi<Order[]>('/orders');
  const { data: looks, reload: reloadLooks } = useApi<StyleLook[]>('/styles');

  useSocketEvent('loyalty:updated', () => reloadCard(true));
  useSocketEvent('order:status', () => reloadOrders(true));
  useSocketEvent('appointment:status', () => reloadAppointments(true));
  /* The shop editing itself. Home is the screen most likely to be open and
     left open, so it is the one where a chair added in the back office should
     appear without anybody navigating anywhere. */
  useSocketEvent('artists:changed', () => reloadArtists(true));
  useSocketEvent('catalogue:changed', () => reloadProducts(true));
  useSocketEvent('lookbook:changed', () => reloadLooks(true));

  const next = appointments?.find(
    (a) => ['confirmed', 'pending'].includes(a.status) && new Date(a.startsAt).getTime() > Date.now(),
  );
  const openOrders = orders?.filter((o) => o.isOpen) ?? [];
  const reward = nextRewardToUse(card?.rewards);
  const stamps = card?.stamps ?? 0;
  const goal = card?.goal ?? 5;

  const add = (p: Product) => {
    const res = cart.add(p);
    if (res.ok) toast(res.message);
    else showError(res.message, { title: 'Not enough stock', icon: '🛍️' });
  };

  return (
    <Screen>
      <Between>
        <Row style={{ flex: 1 }}>
          <Avatar name={user?.name ?? 'You'} />
          <View>
            <Title>{user?.name.split(' ')[0]} 👋</Title>
            <Muted>Good to see you</Muted>
          </View>
        </Row>
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
          <CartButton />
        </Row>
      </Between>

      <Row style={{ marginTop: space.lg, gap: space.md }}>
        {[
          { n: String(card?.totalCheckIns ?? 0), l: 'Visits', accent: true },
          { n: `${stamps}/${goal}`, l: 'To free cut' },
          { n: String(appointments?.filter((a) => a.status === 'completed').length ?? 0), l: 'Cuts booked' },
        ].map((s) => (
          <Card key={s.l} style={{ flex: 1, padding: space.md }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: s.accent ? c.accentInk : c.text }}>{s.n}</Text>
            <Muted style={{ fontSize: 11, marginTop: 2 }}>{s.l}</Muted>
          </Card>
        ))}
      </Row>

      {reward && (
        <Card
          style={{ marginTop: space.lg, borderColor: c.accent, backgroundColor: c.accentSoft }}
          onPress={() => nav.navigate('Loyalty')}
        >
          <Row>
            <Text style={{ fontSize: 30 }}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '800' }}>Free haircut ready</Body>
              <Muted style={{ marginTop: 4 }}>
                Claim code <Text style={{ color: c.accentInk, fontWeight: '700' }}>{reward.code}</Text> · show it at the chair
              </Muted>
            </View>
            <Text style={{ color: c.muted }}>›</Text>
          </Row>
        </Card>
      )}

      {next ? (
        <Card hero style={{ marginTop: space.lg }}>
          <Between>
            {/* A request and a chair are not the same promise — don't call an
                unanswered ask an appointment. */}
            <Badge
              label={next.status === 'pending' ? 'REQUESTED' : 'NEXT APPOINTMENT'}
              tone={next.status === 'pending' ? 'warn' : 'gold'}
            />
            <Muted>{when(next.startsAt)}</Muted>
          </Between>
          <Row style={{ marginTop: space.md }}>
            <Avatar name={next.artist.displayName} size={44} />
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '800', fontSize: 17 }}>{next.serviceName}</Body>
              <Muted style={{ marginTop: 4 }}>
                {next.artist.displayName} · {next.artist.chair} ·{' '}
                {next.status === 'pending'
                  ? `waiting on ${next.artist.displayName.split(' ')[0]}`
                  : `${next.durationMin} min`}{' '}
                · {next.free ? 'free 🎁' : `$${next.price}`}
              </Muted>
            </View>
          </Row>
          <Button
            title={next.status === 'pending' ? 'See my request' : 'Manage appointment'}
            compact
            onPress={() => nav.navigate('Appointments')}
            style={{ marginTop: space.lg }}
          />
        </Card>
      ) : (
        <View style={{ marginTop: space.lg }}>
          <Empty
            icon="💈"
            title="No upcoming visits"
            hint="Your chair is waiting."
            action={<Button title="Book a cut" onPress={() => nav.navigate('Tabs', { screen: 'Book' })} />}
          />
        </View>
      )}

      {openOrders.map((o) => (
        <Card
          key={o.id}
          style={{ marginTop: space.lg, borderColor: c.accent }}
          onPress={() => nav.navigate('OrderDetail', { id: o.id })}
        >
          <Row>
            <Text style={{ fontSize: 26 }}>{o.fulfilment === 'pickup' ? '🛍️' : '🛵'}</Text>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '800' }}>
                {o.fulfilment === 'pickup' ? 'Ready at the shop' : 'On its way'}
              </Body>
              <Muted style={{ marginTop: 4 }}>
                {o.items.reduce((t, i) => t + i.qty, 0)} items · ${o.total} · order {o.code}
              </Muted>
            </View>
            <Text style={{ color: c.muted }}>›</Text>
          </Row>
        </Card>
      ))}

      <Between style={{ marginTop: space.xl }}>
        <Heading style={{ fontSize: 17 }}>Our artists</Heading>
        <Pressable onPress={() => nav.navigate('Tabs', { screen: 'Book' })}>
          <Text style={{ color: c.accentInk, fontSize: 13 }}>Book now</Text>
        </Pressable>
      </Between>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
        <Row style={{ gap: space.md, paddingRight: space.lg }}>
          {artists?.map((a) => (
            <Card key={a.id} style={{ width: 172, padding: space.md }} onPress={() => nav.navigate('Tabs', { screen: 'Book' })}>
              <Avatar name={a.displayName} size={52} />
              <Body style={{ fontWeight: '700', marginTop: 10 }}>{a.displayName}</Body>
              <Muted style={{ fontSize: 11, marginTop: 2, height: 30 }} >{a.specialty}</Muted>
              <Between style={{ marginTop: space.sm }}>
                <Text style={{ color: c.accentInk, fontSize: 12, fontWeight: '700' }}>★ {a.rating}</Text>
                <Muted style={{ fontSize: 11 }}>from ${a.priceFrom}</Muted>
              </Between>
            </Card>
          ))}
        </Row>
      </ScrollView>

      {!!looks?.length && (
        <>
          <Between style={{ marginTop: space.xl }}>
            <Heading style={{ fontSize: 17 }}>Trending styles</Heading>
            <Pressable onPress={() => nav.navigate('Lookbook')}>
              <Text style={{ color: c.accentInk, fontSize: 13 }}>View all</Text>
            </Pressable>
          </Between>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
            <Row style={{ gap: space.md, alignItems: 'flex-start', paddingRight: space.lg }}>
              {looks.slice(0, 6).map((look) => (
                <Pressable key={look.id} onPress={() => nav.navigate('Lookbook')} style={{ width: 150 }}>
                  <View
                    style={{
                      height: 170,
                      borderRadius: radius.lg,
                      overflow: 'hidden',
                      backgroundColor: c.surface3,
                      borderColor: c.line,
                      borderWidth: 1,
                    }}
                  >
                    {absoluteUrl(look.images?.[0]) ? (
                      <Image
                        source={{ uri: absoluteUrl(look.images?.[0]) }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 36 }}>✂️</Text>
                      </View>
                    )}
                  </View>
                  <Body style={{ fontWeight: '700', fontSize: 13, marginTop: 6 }} numberOfLines={1}>
                    {look.title}
                  </Body>
                  <Muted style={{ fontSize: 11 }}>
                    {look.category} · from ${look.price}
                  </Muted>
                </Pressable>
              ))}
            </Row>
          </ScrollView>
        </>
      )}

      <Between style={{ marginTop: space.xl }}>
        <Heading style={{ fontSize: 17 }}>From the shop</Heading>
        <Pressable onPress={() => nav.navigate('Tabs', { screen: 'Shop' })}>
          <Text style={{ color: c.accentInk, fontSize: 13 }}>Browse all</Text>
        </Pressable>
      </Between>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
        <Row style={{ gap: space.md, alignItems: 'flex-start', paddingRight: space.lg }}>
          {products?.slice(0, 5).map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              width={152}
              inCart={cart.qtyOf(p.id)}
              onPress={() => nav.navigate('Product', { id: p.id })}
              onAdd={() => add(p)}
            />
          ))}
        </Row>
      </ScrollView>

      <Card style={{ marginTop: space.xl }} onPress={() => nav.navigate('Loyalty')}>
        <Row>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>Loyalty card</Body>
            <Muted style={{ marginTop: 4 }}>
              {goal - stamps} more check-in{goal - stamps === 1 ? '' : 's'} and your next cut is on us
            </Muted>
            <View style={{ marginTop: space.md }}>
              <PunchStrip stamps={stamps} goal={goal} />
            </View>
          </View>
        </Row>
      </Card>
    </Screen>
  );
}
