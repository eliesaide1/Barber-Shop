import React, { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
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
  Stepper,
  Title,
} from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { Icon } from '../components/Icon';
import { useApi } from '../hooks/useApi';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../store/ToastContext';
import { useDialog } from '../store/DialogContext';
import { useColors } from '../store/ThemeContext';
import { api, ApiError } from '../api/client';
import { absoluteUrl } from '../config';
import { radius, space } from '../theme';
import type { Fulfilment, Order, Product } from '../types';

const CATEGORIES = ['All', 'Hair', 'Beard', 'Shave', 'Tools', 'Aftercare'];

/* ---------------- Shop ---------------- */

export function ShopScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const cart = useCart();
  const { toast } = useToast();
  const { showError } = useDialog();
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');

  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (category !== 'All') params.set('category', category);
    if (query.trim()) params.set('q', query.trim());
    const qs = params.toString();
    return `/products${qs ? `?${qs}` : ''}`;
  }, [category, query]);

  const { data: products, loading } = useApi<Product[]>(path);

  const add = (p: Product) => {
    const res = cart.add(p);
    if (res.ok) toast(res.message);
    else showError(res.message, { title: 'Not enough stock', icon: '🛍️' });
  };

  return (
    <Screen>
      <Between>
        <View style={{ flex: 1 }}>
          <Title>Shop</Title>
          <Muted style={{ marginTop: 2 }}>What our artists actually use at the chair</Muted>
        </View>
        <CartButton />
      </Between>

      <Field
        placeholder="Search products, brands, artists…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        style={{ marginTop: 0 }}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
        {CATEGORIES.map((cat) => {
          const active = cat === category;
          return (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: active ? c.accent : c.surface2,
                borderColor: active ? c.accent : c.line,
                borderWidth: 1,
              }}
            >
              <Text style={{ color: active ? c.onAccent : c.text, fontWeight: active ? '700' : '500', fontSize: 13 }}>
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && !products ? (
        <Loading />
      ) : !products?.length ? (
        <Empty icon="🔍" title="Nothing matches that" hint="Try another category or search." />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.lg }}>
          {products.map((p) => (
            <View key={p.id} style={{ width: '48%' }}>
              <ProductCard
                product={p}
                inCart={cart.qtyOf(p.id)}
                onPress={() => nav.navigate('Product', { id: p.id })}
                onAdd={() => add(p)}
              />
            </View>
          ))}
        </View>
      )}

      <Card style={{ marginTop: space.lg }}>
        <Muted>🛍️  Free pickup at the shop — we can hand it over at your next cut.</Muted>
        <Muted style={{ marginTop: 8 }}>🛵  Delivery inside Beirut, free over the threshold.</Muted>
        <Muted style={{ marginTop: 8 }}>↩️  Unopened returns within 14 days with your order code.</Muted>
      </Card>
    </Screen>
  );
}

export function CartButton() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { count } = useCart();
  return (
    <Pressable
      onPress={() => nav.navigate('Cart')}
      accessibilityRole="button"
      accessibilityLabel={`Cart, ${count} items`}
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
      <Icon name="bag" color={c.text} size={21} />
      {count > 0 && (
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
          <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ---------------- Product ---------------- */

export function ProductScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const cart = useCart();
  const { toast } = useToast();
  const { showError } = useDialog();
  const [qty, setQty] = useState(1);

  const { data: product, loading } = useApi<Product>(`/products/${params.id}`);
  const { user } = useAuth();

  if (loading && !product) return <Loading />;
  if (!product) return <Screen><Empty icon="📦" title="That product is no longer listed" /></Screen>;

  const inCart = cart.qtyOf(product.id);
  const canAdd = product.stock - inCart > 0;
  const image = absoluteUrl(product.images?.[0]);
  /* A small, real personalisation: flag products that match a saved note. */
  const matchesNote =
    !!user?.preferences?.notes &&
    /alcohol/i.test(user.preferences.notes) &&
    /alcohol-free/i.test(product.name);

  const add = () => {
    const res = cart.add(product, qty);
    if (!res.ok) {
      showError(res.message, { title: 'Not enough stock', icon: '🛍️' });
      return;
    }
    toast(res.message);
    setQty(1);
  };

  return (
    <Screen>
      <View
        style={{
          height: 220,
          borderRadius: radius.lg,
          backgroundColor: c.surface3,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {image ? (
          <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: 76 }}>{product.icon}</Text>
        )}
        {!!product.tag && product.stock > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: radius.pill,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{product.tag}</Text>
          </View>
        )}
      </View>

      <Between style={{ marginTop: space.lg }}>
        <View>
          <Row style={{ gap: 8 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: c.text }}>${product.price}</Text>
            {!!product.compareAtPrice && (
              <Text style={{ color: c.muted, fontSize: 15, textDecorationLine: 'line-through' }}>
                ${product.compareAtPrice}
              </Text>
            )}
          </Row>
          <Muted style={{ marginTop: 2 }}>{product.category} · {product.size}</Muted>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: c.accentInk, fontWeight: '700' }}>★ {product.rating}</Text>
          <Muted style={{ fontSize: 11 }}>{product.reviewsCount} reviews</Muted>
        </View>
      </Between>

      {product.stock <= 0 ? (
        <Card style={{ marginTop: space.md, alignItems: 'center' }}>
          <Body style={{ fontWeight: '700' }}>Out of stock</Body>
          <Muted style={{ marginTop: 6 }}>We restock the house label every Tuesday.</Muted>
        </Card>
      ) : product.stock <= 3 ? (
        <Text style={{ color: c.danger, fontWeight: '700', marginTop: space.md }}>
          Only {product.stock} left in stock
        </Text>
      ) : null}

      {matchesNote && (
        <Card style={{ marginTop: space.md, borderColor: c.accent, backgroundColor: c.accentSoft }}>
          <Row>
            <Text style={{ fontSize: 22 }}>✅</Text>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }}>Matches your saved preference</Body>
              <Muted style={{ marginTop: 2 }}>“{user!.preferences.notes}”</Muted>
            </View>
          </Row>
        </Card>
      )}

      {product.owner ? (
        <Card style={{ marginTop: space.md }}>
          <Row>
            <Text style={{ fontSize: 22 }}>💈</Text>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }}>From {product.owner.displayName}’s shelf</Body>
              <Muted style={{ marginTop: 2 }}>{product.owner.specialty} · ★ {product.owner.rating}</Muted>
            </View>
          </Row>
        </Card>
      ) : (
        <Card style={{ marginTop: space.md }}>
          <Row>
            <Text style={{ fontSize: 22 }}>✂</Text>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }}>FadeRoom house label</Body>
              <Muted style={{ marginTop: 2 }}>Stocked by the shop · used at every chair</Muted>
            </View>
          </Row>
        </Card>
      )}

      <Muted style={{ marginTop: space.lg, fontSize: 13.5, lineHeight: 21 }}>{product.description}</Muted>

      {!!product.howToUse && (
        <>
          <Heading style={{ marginTop: space.xl }}>How to use it</Heading>
          <Card style={{ marginTop: space.sm }}>
            <Muted style={{ lineHeight: 20 }}>{product.howToUse}</Muted>
          </Card>
        </>
      )}

      {product.stock > 0 && (
        <View style={{ marginTop: space.xl }}>
          <Row>
            <View>
              <Muted style={{ marginBottom: 7, fontWeight: '600' }}>Quantity</Muted>
              <Stepper qty={qty} max={Math.max(1, product.stock - inCart)} onChange={(n) => setQty(Math.max(1, n))} />
            </View>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Button
                title={canAdd ? `Add to cart · $${product.price * qty}` : 'All of it is in your cart'}
                disabled={!canAdd}
                onPress={add}
              />
            </View>
          </Row>
          {inCart > 0 && (
            <Button
              title={`View cart · ${cart.count}`}
              variant="secondary"
              onPress={() => nav.navigate('Cart')}
              style={{ marginTop: space.md }}
            />
          )}
        </View>
      )}
    </Screen>
  );
}

/* ---------------- Cart ---------------- */

export function CartScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const cart = useCart();
  const { config } = useAuth();
  const [fulfilment, setFulfilment] = useState<Fulfilment>('pickup');

  const deliveryFee = config?.deliveryFee ?? 4;
  const freeOver = config?.freeDeliveryOver ?? 50;
  const fee = fulfilment === 'delivery' && cart.subtotal < freeOver ? deliveryFee : 0;

  if (!cart.lines.length) {
    return (
      <Screen>
        <Title>Cart</Title>
        <View style={{ marginTop: space.lg }}>
          <Empty
            icon="🛍️"
            title="Your cart is empty"
            hint="Everything here is stocked by an artist you can book."
            action={<Button title="Browse the shop" onPress={() => nav.navigate('Tabs', { screen: 'Shop' })} />}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Cart</Title>
      <Muted style={{ marginTop: 2 }}>
        {cart.count} item{cart.count === 1 ? '' : 's'} · ${cart.subtotal}
      </Muted>

      <Card style={{ marginTop: space.lg, paddingVertical: space.sm }}>
        {cart.lines.map((line, i) => {
          const image = absoluteUrl(line.product.images?.[0]);
          return (
            <View
              key={line.product.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingVertical: space.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.line,
              }}
            >
              <Pressable
                onPress={() => nav.navigate('Product', { id: line.product.id })}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: radius.md,
                  backgroundColor: c.surface3,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {image ? (
                  <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={{ fontSize: 26 }}>{line.product.icon}</Text>
                )}
              </Pressable>

              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '700' }} >{line.product.name}</Body>
                <Muted style={{ marginTop: 2 }}>{line.product.size}</Muted>
                <Text style={{ color: c.text, fontWeight: '800', marginTop: 6 }}>
                  ${line.product.price * line.qty}
                </Text>
              </View>

              <Stepper
                qty={line.qty}
                max={line.product.stock}
                onChange={(n) => cart.setQty(line.product.id, n)}
              />
            </View>
          );
        })}
      </Card>

      <Heading style={{ marginTop: space.xl }}>How do you want it?</Heading>
      <View style={{ marginTop: space.sm }}>
        <Segmented
          value={fulfilment}
          onChange={setFulfilment}
          options={[
            { value: 'pickup', label: '💈 Pick up' },
            { value: 'delivery', label: '🛵 Delivery' },
          ]}
        />
      </View>
      <Muted style={{ marginTop: space.sm }}>
        {fulfilment === 'pickup'
          ? 'Free · collect it at the shop, or at your next cut'
          : `Inside Beirut · $${deliveryFee}, free over $${freeOver}`}
      </Muted>

      <Card style={{ marginTop: space.lg }}>
        <Between>
          <Muted>Subtotal</Muted>
          <Body>${cart.subtotal}</Body>
        </Between>
        <Between style={{ marginTop: space.sm }}>
          <Muted>{fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}</Muted>
          <Body>{fee ? `$${fee}` : 'Free'}</Body>
        </Between>
        <Divider />
        <Between>
          <Body style={{ fontWeight: '700' }}>Total</Body>
          <Text style={{ color: c.accentInk, fontWeight: '800', fontSize: 20 }}>${cart.subtotal + fee}</Text>
        </Between>
      </Card>

      <Button
        title={`Checkout · $${cart.subtotal + fee}`}
        onPress={() => nav.navigate('Checkout', { fulfilment })}
        style={{ marginTop: space.lg }}
      />
      <Button
        title="Keep shopping"
        variant="ghost"
        onPress={() => nav.navigate('Tabs', { screen: 'Shop' })}
        style={{ marginTop: space.md }}
      />
    </Screen>
  );
}

/* ---------------- Checkout ---------------- */

export function CheckoutScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const cart = useCart();
  const { user, config } = useAuth();
  const { toast } = useToast();
  const { showError } = useDialog();

  const [fulfilment, setFulfilment] = useState<Fulfilment>(route.params?.fulfilment ?? 'pickup');
  const [payment, setPayment] = useState<'cash' | 'card'>('cash');
  const [withAppointment, setWithAppointment] = useState(false);
  const [address, setAddress] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    line: '',
    note: '',
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const deliveryFee = config?.deliveryFee ?? 4;
  const freeOver = config?.freeDeliveryOver ?? 50;
  const fee = fulfilment === 'delivery' && cart.subtotal < freeOver ? deliveryFee : 0;
  const total = cart.subtotal + fee;

  const place = async () => {
    if (fulfilment === 'delivery') {
      const next: Record<string, string> = {};
      if (address.name.trim().length < 2) next.name = 'Please enter your name';
      if (address.phone.replace(/\D/g, '').length < 7) next.phone = 'Enter a valid phone number';
      if (address.line.trim().length < 6) next.line = 'We need an address to deliver to';
      setFields(next);
      if (Object.keys(next).length) return;
    }

    setBusy(true);
    try {
      const order = await api.post<Order>('/orders', {
        items: cart.lines.map((l) => ({ product: l.product.id, qty: l.qty })),
        fulfilment,
        payment,
        withAppointment: fulfilment === 'pickup' && withAppointment,
        address: fulfilment === 'delivery' ? address : undefined,
      });
      cart.clear();
      toast('Order placed');
      nav.replace('OrderDetail', { id: order.id, justPlaced: true });
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not place the order', {
        title: 'Order not placed',
        icon: '🛍️',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Checkout</Title>
      <Muted style={{ marginTop: 2 }}>
        {cart.count} item{cart.count === 1 ? '' : 's'} · ${total}
      </Muted>

      <Heading style={{ marginTop: space.xl }}>Fulfilment</Heading>
      <View style={{ marginTop: space.sm }}>
        <Segmented
          value={fulfilment}
          onChange={setFulfilment}
          options={[
            { value: 'pickup', label: '💈 Pick up' },
            { value: 'delivery', label: '🛵 Delivery' },
          ]}
        />
      </View>

      {fulfilment === 'pickup' ? (
        <>
          <Card style={{ marginTop: space.md }}>
            <Between><Muted>Collect from</Muted><Body>{config?.shop.name} · {config?.shop.area}</Body></Between>
            <Between style={{ marginTop: space.sm }}><Muted>Hours</Muted><Body>{config?.shop.hours}</Body></Between>
            <Between style={{ marginTop: space.sm }}>
              <Muted>Ready</Muted>
              <Text style={{ color: c.accentInk, fontWeight: '600' }}>Today, within the hour</Text>
            </Between>
          </Card>
          <Pressable
            onPress={() => setWithAppointment((v) => !v)}
            style={{
              marginTop: space.md,
              borderRadius: radius.lg,
              borderWidth: 1,
              padding: space.lg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              borderColor: withAppointment ? c.accent : c.line,
              backgroundColor: withAppointment ? c.accentSoft : c.surface,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: withAppointment ? c.accent : c.line,
                backgroundColor: withAppointment ? c.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {withAppointment && <Text style={{ color: c.onAccent, fontWeight: '800', fontSize: 13 }}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }}>Hand it to me at my next cut</Body>
              <Muted style={{ marginTop: 2 }}>We’ll have it bagged and waiting at the chair</Muted>
            </View>
          </Pressable>
        </>
      ) : (
        <Card style={{ marginTop: space.md }}>
          <Field
            label="Full name"
            value={address.name}
            onChangeText={(v) => setAddress((a) => ({ ...a, name: v }))}
            error={fields.name}
            style={{ marginTop: 0 }}
          />
          <Field
            label="Phone"
            value={address.phone}
            onChangeText={(v) => setAddress((a) => ({ ...a, phone: v }))}
            keyboardType="phone-pad"
            error={fields.phone}
          />
          <Field
            label="Address"
            value={address.line}
            onChangeText={(v) => setAddress((a) => ({ ...a, line: v }))}
            placeholder="Street, building, floor"
            multiline
            style={{ minHeight: 74, textAlignVertical: 'top' }}
            error={fields.line}
          />
          <Field
            label="Rider notes (optional)"
            value={address.note}
            onChangeText={(v) => setAddress((a) => ({ ...a, note: v }))}
            placeholder="e.g. ring the top bell"
          />
        </Card>
      )}

      <Heading style={{ marginTop: space.xl }}>Payment</Heading>
      <View style={{ marginTop: space.sm }}>
        <Segmented
          value={payment}
          onChange={setPayment}
          options={[
            { value: 'cash', label: 'Cash' },
            { value: 'card', label: 'Card' },
          ]}
        />
      </View>
      <Muted style={{ marginTop: space.sm }}>
        Paid on {fulfilment === 'pickup' ? 'collection at the shop' : 'delivery, to the rider'} — no card is stored.
      </Muted>

      <Heading style={{ marginTop: space.xl }}>Your order</Heading>
      <Card style={{ marginTop: space.sm }}>
        {cart.lines.map((l) => (
          <Between key={l.product.id} style={{ paddingVertical: 6 }}>
            <Muted>{l.qty} × {l.product.name}</Muted>
            <Body>${l.product.price * l.qty}</Body>
          </Between>
        ))}
        <Divider />
        <Between><Muted>Subtotal</Muted><Body>${cart.subtotal}</Body></Between>
        <Between style={{ marginTop: space.sm }}>
          <Muted>{fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}</Muted>
          <Body>{fee ? `$${fee}` : 'Free'}</Body>
        </Between>
        <Between style={{ marginTop: space.md }}>
          <Body style={{ fontWeight: '700' }}>Total</Body>
          <Text style={{ color: c.accentInk, fontWeight: '800', fontSize: 20 }}>${total}</Text>
        </Between>
      </Card>

      <Button title={`Place order · $${total}`} onPress={place} loading={busy} style={{ marginTop: space.lg }} />
      <Button title="Back to cart" variant="ghost" onPress={() => nav.goBack()} style={{ marginTop: space.md }} />
    </Screen>
  );
}
