import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Badge,
  Between,
  Body,
  Button,
  Card,
  Divider,
  Empty,
  Heading,
  Loading,
  Muted,
  QRCode,
  Row,
  Screen,
  Title,
} from '../components/ui';
import { useApi, useSocketEvent } from '../hooks/useApi';
import { useColors } from '../store/ThemeContext';
import { useToast } from '../store/ToastContext';
import { space } from '../theme';
import type { Order } from '../types';

const FLOW: Record<string, [string, string, string][]> = {
  pickup: [
    ['ready', 'Ready at the shop', 'Show your pickup code at the chair'],
    ['collected', 'Collected', 'Handed over at VIA Barber House'],
  ],
  delivery: [
    ['packing', 'Packing', 'We’re boxing your order'],
    ['out', 'Out for delivery', 'On its way to you'],
    ['delivered', 'Delivered', 'Left with you'],
  ],
};

const label = (o: Order) =>
  (FLOW[o.fulfilment]?.find(([s]) => s === o.status)?.[1]) ?? (o.status === 'cancelled' ? 'Cancelled' : o.status);

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
};

export function OrdersScreen() {
  const nav = useNavigation<any>();
  const { toast } = useToast();
  const { data: orders, loading, reload } = useApi<Order[]>('/orders');

  /* The artist marks an order collected in the CMS; it lands here instantly. */
  useSocketEvent('order:status', (order: Order) => {
    toast(label(order));
    reload(true);
  });

  if (loading && !orders) return <Loading />;

  return (
    <Screen>
      <Title>My orders</Title>
      <Muted style={{ marginTop: 2 }}>Product orders · your cuts live under Appointments</Muted>

      {!orders?.length ? (
        <View style={{ marginTop: space.lg }}>
          <Empty
            icon="📦"
            title="No orders yet"
            hint="Products you buy will show up here."
            action={<Button title="Browse the shop" onPress={() => nav.navigate('Tabs', { screen: 'Shop' })} />}
          />
        </View>
      ) : (
        orders.map((o) => (
          <Card
            key={o.id}
            style={{ marginTop: space.md }}
            onPress={() => nav.navigate('OrderDetail', { id: o.id })}
          >
            <Between>
              <Badge label={label(o)} tone={o.isOpen ? 'gold' : 'dim'} />
              <Muted>{ago(o.createdAt)}</Muted>
            </Between>
            <Row style={{ marginTop: space.md }}>
              <Text style={{ fontSize: 26 }}>{o.fulfilment === 'pickup' ? '🛍️' : '🛵'}</Text>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '700' }} numberOfLines={1}>
                  {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                </Body>
                <Muted style={{ marginTop: 4 }}>
                  Order {o.code} · {o.fulfilment} · ${o.total}
                </Muted>
              </View>
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}

export function OrderDetailScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { data: order, loading, reload } = useApi<Order>(`/orders/${params.id}`);

  useSocketEvent('order:status', (updated: Order) => {
    if (updated.id === params.id) reload(true);
  });

  if (loading && !order) return <Loading />;
  if (!order) return <Screen><Empty icon="📦" title="Order not found" /></Screen>;

  const steps = FLOW[order.fulfilment] ?? [];
  const at = steps.findIndex(([s]) => s === order.status);

  return (
    <Screen>
      {params.justPlaced && (
        <Card hero style={{ alignItems: 'center', marginBottom: space.lg }}>
          <Text style={{ fontSize: 46 }}>{order.fulfilment === 'pickup' ? '🛍️' : '🛵'}</Text>
          <Title style={{ marginTop: 8 }}>Order placed</Title>
          <Muted style={{ marginTop: 6, textAlign: 'center' }}>
            {order.fulfilment === 'pickup'
              ? order.withAppointment
                ? 'We’ll have it bagged at your next cut. Show the code at the chair.'
                : 'Ready within the hour. Show the code at the shop.'
              : 'Same day if you ordered before 17:00. We’ll text you when the rider leaves.'}
          </Muted>
        </Card>
      )}

      <Between>
        <View>
          <Title>Order {order.code}</Title>
          <Muted style={{ marginTop: 2 }}>{ago(order.createdAt)} · {order.fulfilment}</Muted>
        </View>
        <Badge label={label(order)} tone={order.isOpen ? 'gold' : 'dim'} />
      </Between>

      <Card style={{ marginTop: space.lg }}>
        {steps.map(([status, title, hint], i) => (
          <Row key={status} style={{ alignItems: 'flex-start', paddingVertical: 9, opacity: i > at ? 0.4 : 1 }}>
            <View
              style={{
                width: 11,
                height: 11,
                borderRadius: 6,
                marginTop: 5,
                backgroundColor: i <= at ? c.accent : c.surface3,
              }}
            />
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }}>{title}</Body>
              <Muted style={{ marginTop: 2 }}>{hint}</Muted>
            </View>
            {i < at && <Badge label="✓" tone="ok" />}
          </Row>
        ))}
      </Card>

      {order.fulfilment === 'pickup' && order.isOpen && (
        <Card style={{ marginTop: space.md, alignItems: 'center', borderColor: c.accent }}>
          <Muted>Show this at the chair</Muted>
          <Text
            style={{
              color: c.text,
              fontWeight: '800',
              fontSize: 26,
              letterSpacing: 5,
              marginTop: 8,
              fontVariant: ['tabular-nums'],
            }}
          >
            {order.code}
          </Text>
          <View style={{ marginTop: space.md }}>
            <QRCode value={`FR1|O|${order.code}`} size={180} />
          </View>
        </Card>
      )}

      {order.address && (
        <Card style={{ marginTop: space.md }}>
          <Between><Muted>Deliver to</Muted><Body>{order.address.name}</Body></Between>
          <Between style={{ marginTop: space.sm, alignItems: 'flex-start' }}>
            <Muted>Address</Muted>
            <Body style={{ maxWidth: '62%', textAlign: 'right' }}>{order.address.line}</Body>
          </Between>
        </Card>
      )}

      <Heading style={{ marginTop: space.xl }}>Items</Heading>
      <Card style={{ marginTop: space.sm }}>
        {order.items.map((i) => (
          <Between key={i.product} style={{ paddingVertical: 6 }}>
            <Muted>{i.icon} {i.qty} × {i.name}</Muted>
            <Body>${i.price * i.qty}</Body>
          </Between>
        ))}
        <Divider />
        <Between><Muted>Subtotal</Muted><Body>${order.subtotal}</Body></Between>
        <Between style={{ marginTop: space.sm }}>
          <Muted>{order.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}</Muted>
          <Body>{order.fee ? `$${order.fee}` : 'Free'}</Body>
        </Between>
        <Between style={{ marginTop: space.md }}>
          <Body style={{ fontWeight: '700' }}>Total</Body>
          <Text style={{ color: c.accentInk, fontWeight: '800', fontSize: 18 }}>${order.total}</Text>
        </Between>
      </Card>

      <Button
        title="Back to my orders"
        variant="ghost"
        onPress={() => nav.navigate('Orders')}
        style={{ marginTop: space.lg }}
      />
    </Screen>
  );
}
