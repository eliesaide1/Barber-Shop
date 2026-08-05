import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
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
  Segmented,
  Title,
} from '../../components/ui';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { useColors } from '../../store/ThemeContext';
import { useDialog } from '../../store/DialogContext';
import { useToast } from '../../store/ToastContext';
import { api, ApiError } from '../../api/client';
import { space } from '../../theme';
import type { ManagedOrder } from '../../types';

const FLOW: Record<string, [string, string][]> = {
  pickup: [
    ['ready', 'Ready at the shop'],
    ['collected', 'Collected'],
  ],
  delivery: [
    ['packing', 'Packing'],
    ['out', 'Out for delivery'],
    ['delivered', 'Delivered'],
  ],
};

const nextStep = (o: ManagedOrder) => {
  const flow = FLOW[o.fulfilment] ?? [];
  const at = flow.findIndex(([s]) => s === o.status);
  return at >= 0 && at < flow.length - 1 ? flow[at + 1] : null;
};

const label = (o: ManagedOrder) =>
  FLOW[o.fulfilment]?.find(([s]) => s === o.status)?.[1] ??
  (o.status === 'cancelled' ? 'Cancelled' : o.status);

const isOpen = (o: ManagedOrder) => o.status !== 'cancelled' && Boolean(nextStep(o));

export function ArtistOrdersScreen() {
  const c = useColors();
  const { toast } = useToast();
  const { confirm, showError } = useDialog();
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: orders, loading, reload } = useApi<ManagedOrder[]>('/orders/manage/list');

  useSocketEvent('order:created', (o: ManagedOrder) => {
    reload(true);
    toast(`New order · $${o.total}`);
  });
  useSocketEvent('order:status', () => reload(true));

  const shown = useMemo(
    () => (orders ?? []).filter((o) => (tab === 'open' ? isOpen(o) : !isOpen(o))),
    [orders, tab],
  );
  const openCount = useMemo(() => (orders ?? []).filter(isOpen).length, [orders]);

  const advance = async (order: ManagedOrder) => {
    const step = nextStep(order);
    if (!step) return;

    /* Handing the bag over is the irreversible end of the flow — worth a beat. */
    if (step[0] === 'collected' || step[0] === 'delivered') {
      const ok = await confirm({
        title: `Mark order ${order.code} ${step[1].toLowerCase()}?`,
        message: `${order.user?.name ?? 'The client'} · $${order.total}. This closes the order.`,
        icon: '🛍️',
        confirmLabel: step[1],
        cancelLabel: 'Not yet',
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      await api.post(`/orders/${order.id}/status`, { status: step[0] });
      toast(step[1]);
      reload(true);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not update that order', {
        title: 'Couldn’t move that order on',
        icon: '🛍️',
      });
    } finally {
      setBusy(false);
    }
  };

  const lookup = async () => {
    const wanted = code.trim().toUpperCase();
    if (!wanted) return;
    setBusy(true);
    try {
      const order = await api.get<ManagedOrder>(
        `/orders/manage/by-code/${encodeURIComponent(wanted)}`,
      );
      setCode('');
      const step = nextStep(order);
      await confirm({
        title: `Order ${order.code}`,
        message:
          `${order.user?.name ?? 'Client'} · ${order.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}` +
          ` · $${order.total}${step ? '' : ' · already closed'}`,
        icon: order.fulfilment === 'pickup' ? '🛍️' : '🛵',
        confirmLabel: step ? step[1] : 'OK',
        cancelLabel: step ? 'Close' : undefined,
      }).then((ok) => {
        if (ok && step) advance(order);
      });
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'No order matches that code', {
        title: 'No order for that code',
        icon: '🛍️',
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading && !orders) return <Loading label="Loading orders…" />;

  return (
    <Screen>
      <Title>Orders</Title>
      <Muted style={{ marginTop: 2 }}>
        {openCount} waiting to be handed over
      </Muted>

      <Card style={{ marginTop: space.lg }}>
        <Body style={{ fontWeight: '700' }}>Find by pickup code</Body>
        <Muted style={{ marginTop: 6 }}>The 6 characters on the client’s screen.</Muted>
        <Row style={{ marginTop: space.md, gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              autoCapitalize="characters"
              maxLength={20}
              placeholder="PICKUP CODE"
              style={{ textAlign: 'center', letterSpacing: 4, fontWeight: '700', marginTop: 0 }}
            />
          </View>
          <Button title="Find" compact onPress={lookup} disabled={busy || !code.trim()} />
        </Row>
      </Card>

      <View style={{ marginTop: space.lg }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: `Open (${openCount})` },
            { value: 'done', label: 'Closed' },
          ]}
        />
      </View>

      {!shown.length ? (
        <View style={{ marginTop: space.lg }}>
          <Empty icon="🛍️" title={tab === 'open' ? 'Nothing waiting' : 'No closed orders'} />
        </View>
      ) : (
        shown.map((o) => {
          const step = nextStep(o);
          return (
            <Card key={o.id} style={{ marginTop: space.md }}>
              <Between>
                <Row style={{ gap: space.sm }}>
                  <Text style={{ fontSize: 22 }}>{o.fulfilment === 'pickup' ? '🛍️' : '🛵'}</Text>
                  <Text
                    style={{ color: c.accentInk, fontWeight: '800', fontSize: 16, letterSpacing: 2 }}
                  >
                    {o.code}
                  </Text>
                </Row>
                <Badge label={label(o)} tone={isOpen(o) ? 'gold' : 'dim'} />
              </Between>

              <Divider />

              <Body style={{ fontWeight: '700' }}>{o.user?.name ?? 'Client'}</Body>
              <Muted style={{ marginTop: 3 }}>
                {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
              </Muted>
              {!!o.address && <Muted style={{ marginTop: 3 }}>🛵 {o.address.line}</Muted>}
              {o.withAppointment && (
                <Muted style={{ marginTop: 3, color: c.accentInk }}>Hand over at their next cut</Muted>
              )}

              <Between style={{ marginTop: space.md }}>
                <Text style={{ fontWeight: '800', fontSize: 18, color: c.text }}>${o.total}</Text>
                <Muted>{o.payment === 'cash' ? 'Cash' : 'Card'} on {o.fulfilment}</Muted>
              </Between>

              {step && (
                <Button
                  title={step[1]}
                  compact
                  disabled={busy}
                  onPress={() => advance(o)}
                  style={{ marginTop: space.md }}
                />
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
