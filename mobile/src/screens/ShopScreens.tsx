import React, { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Between,
  Body,
  Button,
  Card,
  Empty,
  Field,
  Heading,
  Loading,
  Muted,
  Row,
  Screen,
  Stepper,
  Title,
} from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { Icon } from '../components/Icon';
import { useApi, useSocketEvent } from '../hooks/useApi';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../store/ToastContext';
import { useDialog } from '../store/DialogContext';
import { useColors } from '../store/ThemeContext';
import { absoluteUrl } from '../config';
import { contactForProduct, openWhatsApp, priceEnquiry } from '../lib/whatsapp';
import { CartBar } from '../components/CartBar';
import { radius, space } from '../theme';
import type { Product } from '../types';
import { useT } from '../store/CopyContext';

const CATEGORIES = ['All', 'Hair', 'Beard', 'Shave', 'Tools', 'Aftercare'];

/* ---------------- Shop ---------------- */

export function ShopScreen() {
  const c = useColors();
  const t = useT();
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

  const { data: products, loading, reload: reloadProducts } = useApi<Product[]>(path);

  /* The server has broadcast this on every product change all along — nothing
     was listening, so a price or a photo edited in the back office reached the
     shelf only when somebody navigated away and came back. */
  useSocketEvent('catalogue:changed', () => reloadProducts(true));

  const add = (p: Product) => {
    const res = cart.add(p);
    if (res.ok) toast(res.message);
    else showError(res.message, { title: 'Not enough stock', icon: '🛍️' });
  };

  return (
    <Screen footer={<CartBar />}>
      <Between>
        <View style={{ flex: 1 }}>
          <Title>{t('shop.shop', 'Shop')}</Title>
          <Muted style={{ marginTop: 2 }}>{t('shop.whatOurArtistsActually', 'What our artists actually use at the chair')}</Muted>
        </View>
        <CartButton />
      </Between>

      <Field
        placeholder={t('shop.searchProductsBrandsArtists', 'Search products, brands, artists…')}
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
        <Empty icon="🔍" title={t('shop.nothingMatchesThat', 'Nothing matches that')} hint={t('shop.tryAnotherCategoryOr', 'Try another category or search.')} />
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
        <Muted style={{ marginTop: 8 }}>
          {t('shop.collectHint', '💈  Ask on WhatsApp and collect at the shop.')}
        </Muted>
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
  const t = useT();
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const cart = useCart();
  const { toast } = useToast();
  const { showError } = useDialog();
  const [qty, setQty] = useState(1);

  const { data: product, loading, reload: reloadProduct } = useApi<Product>(`/products/${params.id}`);

  /* Reloaded on any catalogue change rather than only its own: the event
     carries an id, but a page showing one product is cheap to re-read and
     comparing ids here would be a second place for them to drift apart. */
  useSocketEvent('catalogue:changed', () => reloadProduct(true));
  const { user, config } = useAuth();

  if (loading && !product) return <Loading />;
  if (!product) return <Screen><Empty icon="📦" title={t('shop.thatProductIsNo', 'That product is no longer listed')} /></Screen>;

  /* Whose shelf it is, falling back to the shop. Null when neither has published
     a number, in which case there is nothing to offer and we say so. */
  const enquiry = contactForProduct(product, config);
  const askPrice = async () => {
    if (!enquiry) return;
    const opened = await openWhatsApp(enquiry.number, priceEnquiry(product, config));
    if (!opened) {
      showError('Couldn’t open WhatsApp. Is it installed?', {
        title: 'Check price',
        icon: '💬',
      });
    }
  };

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
    <Screen footer={<CartBar />}>
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
            {product.priceHidden ? (
              <Text style={{ fontSize: 20, fontWeight: '800', color: c.accentInk }}>
                Price on request
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 24, fontWeight: '800', color: c.text }}>${product.price}</Text>
                {!!product.compareAtPrice && (
                  <Text style={{ color: c.muted, fontSize: 15, textDecorationLine: 'line-through' }}>
                    ${product.compareAtPrice}
                  </Text>
                )}
              </>
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
          <Body style={{ fontWeight: '700' }}>{t('shop.outOfStock', 'Out of stock')}</Body>
          <Muted style={{ marginTop: 6 }}>{t('shop.weRestockTheHouse', 'We restock the house label every Tuesday.')}</Muted>
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
              <Body style={{ fontWeight: '700' }}>{t('shop.matchesYourSavedPreference', 'Matches your saved preference')}</Body>
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
              <Body style={{ fontWeight: '700' }}>{t('shop.viaBarberHouseLabel', 'VIA Barber House label')}</Body>
              <Muted style={{ marginTop: 2 }}>{t('shop.stockedByTheShop', 'Stocked by the shop · used at every chair')}</Muted>
            </View>
          </Row>
        </Card>
      )}

      <Muted style={{ marginTop: space.lg, fontSize: 13.5, lineHeight: 21 }}>{product.description}</Muted>

      {!!product.howToUse && (
        <>
          <Heading style={{ marginTop: space.xl }}>{t('shop.howToUseIt', 'How to use it')}</Heading>
          <Card style={{ marginTop: space.sm }}>
            <Muted style={{ lineHeight: 20 }}>{product.howToUse}</Muted>
          </Card>
        </>
      )}

      {/* An enquiry rather than a purchase. The shop chose not to publish the
          figure, so there is no cart to add to and no total to show — the
          conversation is the checkout. */}
      {product.priceHidden && (
        <View style={{ marginTop: space.xl }}>
          {enquiry ? (
            <>
              <Button title={`Check price on WhatsApp`} onPress={askPrice} />
              <Muted style={{ textAlign: 'center', marginTop: space.sm }}>
                Opens a message to {enquiry.name} with this product in it.
              </Muted>
            </>
          ) : (
            <Card>
              <Body style={{ fontWeight: '700' }}>{t('shop.askInTheShop', 'Ask in the shop')}</Body>
              <Muted style={{ marginTop: 4 }}>{t('shop.thisOneIsPriced', 'This one is priced on request, and there is no number to message yet.')}</Muted>
            </Card>
          )}
        </View>
      )}

      {product.stock > 0 && (
        <View style={{ marginTop: space.xl }}>
          <Row>
            <View>
              <Muted style={{ marginBottom: 7, fontWeight: '600' }}>{t('shop.quantity', 'Quantity')}</Muted>
              <Stepper qty={qty} max={Math.max(1, product.stock - inCart)} onChange={(n) => setQty(Math.max(1, n))} />
            </View>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Button
                title={
                  canAdd
                    ? product.priceHidden
                      ? 'Add to cart'
                      : `Add to cart · $${(product.price ?? 0) * qty}`
                    : 'All of it is in your cart'
                }
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
  const t = useT();
  const nav = useNavigation<any>();
  const cart = useCart();
  const { config } = useAuth();

  if (!cart.lines.length) {
    return (
      <Screen>
        <Title>{t('shop.cart', 'Cart')}</Title>
        <View style={{ marginTop: space.lg }}>
          <Empty
            icon="🛍️"
            title={t('shop.yourCartIsEmpty', 'Your cart is empty')}
            hint={t('shop.everythingHereIsStocked', 'Everything here is stocked by an artist you can book.')}
            action={<Button title={t('shop.browseTheShop', 'Browse the shop')} onPress={() => nav.navigate('Tabs', { screen: 'Shop' })} />}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={<CartBar />}>
      <Title>{t('shop.cart', 'Cart')}</Title>
      <Muted style={{ marginTop: 2 }}>
        {cart.count} {cart.count === 1 ? t('shop.item', 'item') : t('shop.items', 'items')}
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
                {!line.product.priceHidden && (
                  <Text style={{ color: c.text, fontWeight: '800', marginTop: 6 }}>
                    ${(line.product.price ?? 0) * line.qty}
                  </Text>
                )}
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

      {/* No fulfilment choice and no total. Both were questions this screen
          could only ask because it was going to place an order; it now hands
          the list to the shop, and how it gets to you is part of the same
          conversation as what it costs. */}
      <Card style={{ marginTop: space.lg }}>
        <Body style={{ fontWeight: '700' }}>Sending this to {config?.shop.name ?? 'the shop'}</Body>
        <Muted style={{ marginTop: space.xs }}>
          Tap Finished and WhatsApp opens with your list ready to send. Nothing is charged in the
          app — the shop replies with the total and when to collect it.
        </Muted>
      </Card>

      <Button
        title={t('shop.keepShopping', 'Keep shopping')}
        variant="ghost"
        onPress={() => nav.navigate('Tabs', { screen: 'Shop' })}
        style={{ marginTop: space.lg }}
      />
    </Screen>
  );
}
