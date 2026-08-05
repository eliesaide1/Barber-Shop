/**
 * End-to-end API test: the real journeys, against a real MongoDB.
 *
 *   npm test
 *
 * Uses its own database (faderoom_test) and drops it on the way in, so it
 * never touches seeded development data.
 */
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/faderoom_test';
process.env.NODE_ENV = 'test';
process.env.CHECKIN_COOLDOWN_MS = '0'; /* let one test take five stamps in a row */
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.SHOP_SECRET = 'test-shop-secret';

import test, { after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { io as ioClient } from 'socket.io-client';

const { createApp } = await import('../src/app.js');
const { createSocketServer } = await import('../src/socket/index.js');
const { connectDb } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { Artist } = await import('../src/models/Artist.js');
const { Service } = await import('../src/models/Service.js');
const { Product } = await import('../src/models/Product.js');
const { Loyalty } = await import('../src/models/Loyalty.js');
const { checkinToken } = await import('../src/lib/codes.js');

let server;
let io;
let base;
const ctx = {};

const api = async (path, { token, method = 'GET', body, raw } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
    },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
};

const makeUser = async (name, email, role) => {
  const user = new User({ name, email, role });
  await user.setPassword('password1');
  await user.save();
  if (role === 'client') await Loyalty.create({ user: user._id });
  return user;
};

/* Top-level await rather than a before() hook: the test runner collects tests
   only after the module finishes evaluating, so every test is guaranteed to
   see a booted server. */
async function setup() {
  await connectDb();
  await mongoose.connection.dropDatabase();

  const app = createApp();
  server = http.createServer(app);
  io = createSocketServer(server);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const artistUser = await makeUser('Karim Nasr', 'karim@test.app', 'artist');
  ctx.artist = await Artist.create({
    user: artistUser._id,
    displayName: 'Karim Nasr',
    chair: 'Chair 1',
    daysOff: [],
    workingHours: { start: '10:00', end: '20:00' },
  });
  await makeUser('Shop Admin', 'admin@test.app', 'admin');
  await makeUser('Elie Saide', 'elie@test.app', 'client');
  await makeUser('Marc Aoun', 'marc@test.app', 'client');

  ctx.service = await Service.create({ name: 'Haircut', durationMin: 45, price: 25 });

  ctx.pomade = await Product.create({
    name: 'Matte Clay Pomade', category: 'Hair', price: 18, stock: 5, status: 'published',
    owner: ctx.artist._id,
  });
  ctx.razor = await Product.create({
    name: 'Straight Razor', category: 'Shave', price: 48, stock: 1, status: 'published',
  });
  ctx.draft = await Product.create({
    name: 'Unreleased Tonic', category: 'Aftercare', price: 20, stock: 5, status: 'draft',
  });

  const login = async (email) => (await api('/api/auth/login', { method: 'POST', body: { email, password: 'password1' } })).body;
  ctx.client = await login('elie@test.app');
  ctx.other = await login('marc@test.app');
  ctx.artistSession = await login('karim@test.app');
  ctx.admin = await login('admin@test.app');
}

await setup();

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  /* io.close() also closes the http server it was attached to. Without it,
     server.close() waits forever on any websocket still open. */
  await new Promise((resolve) => io.close(resolve));
});

describe('auth', () => {
  test('rejects a wrong password without revealing whether the email exists', async () => {
    const bad = await api('/api/auth/login', { method: 'POST', body: { email: 'elie@test.app', password: 'wrong1' } });
    const missing = await api('/api/auth/login', { method: 'POST', body: { email: 'nobody@test.app', password: 'wrong1' } });
    assert.equal(bad.status, 401);
    assert.equal(missing.status, 401);
    assert.equal(bad.body.error, missing.body.error);
  });

  test('protected routes need a token', async () => {
    assert.equal((await api('/api/orders')).status, 401);
  });

  test('a client cannot reach staff routes', async () => {
    const res = await api('/api/products/manage/list', { token: ctx.client.accessToken });
    assert.equal(res.status, 403);
  });

  test('refresh issues a new access token', async () => {
    const res = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: ctx.client.refreshToken } });
    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken);
  });
});

describe('catalogue', () => {
  test('lists only published products', async () => {
    const res = await api('/api/products');
    assert.equal(res.status, 200);
    const names = res.body.map((p) => p.name);
    assert.ok(names.includes('Matte Clay Pomade'));
    assert.ok(!names.includes('Unreleased Tonic'), 'a draft leaked into the public catalogue');
  });

  test('hides an unpublished product from clients but shows it to staff', async () => {
    assert.equal((await api(`/api/products/${ctx.draft._id}`, { token: ctx.client.accessToken })).status, 404);
    assert.equal((await api(`/api/products/${ctx.draft._id}`, { token: ctx.admin.accessToken })).status, 200);
  });

  test('an artist only manages their own shelf', async () => {
    const res = await api('/api/products/manage/list', { token: ctx.artistSession.accessToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'Matte Clay Pomade');
  });
});

describe('orders', () => {
  test('prices the order on the server, ignoring anything the client sends', async () => {
    const res = await api('/api/orders', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: {
        items: [{ product: String(ctx.pomade._id), qty: 2, price: 0 }],
        fulfilment: 'pickup',
        subtotal: 0,
        total: 0, /* a client trying to pay nothing */
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.subtotal, 36, 'server took the price from the request');
    assert.equal(res.body.total, 36);
    assert.equal(res.body.status, 'ready');
    assert.match(res.body.code, /^[A-Z2-9]{6}$/);
    ctx.order = res.body;
  });

  test('decrements stock', async () => {
    const product = await Product.findById(ctx.pomade._id);
    assert.equal(product.stock, 3);
  });

  test('charges delivery under the threshold and waives it over', async () => {
    const small = await api('/api/orders', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: {
        items: [{ product: String(ctx.pomade._id), qty: 1 }],
        fulfilment: 'delivery',
        address: { name: 'Elie', phone: '+9617012345', line: 'Rue Gouraud, Bldg 12' },
      },
    });
    assert.equal(small.status, 201);
    assert.equal(small.body.fee, 4);
    assert.equal(small.body.total, 22);
  });

  test('refuses a delivery with no address', async () => {
    const res = await api('/api/orders', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { items: [{ product: String(ctx.pomade._id), qty: 1 }], fulfilment: 'delivery' },
    });
    assert.equal(res.status, 422);
  });

  test('will not oversell the last unit', async () => {
    const first = await api('/api/orders', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { items: [{ product: String(ctx.razor._id), qty: 1 }], fulfilment: 'pickup' },
    });
    assert.equal(first.status, 201);

    const second = await api('/api/orders', {
      token: ctx.other.accessToken,
      method: 'POST',
      body: { items: [{ product: String(ctx.razor._id), qty: 1 }], fulfilment: 'pickup' },
    });
    assert.equal(second.status, 409);
    assert.equal((await Product.findById(ctx.razor._id)).stock, 0);
  });

  test('a client cannot read another client’s order', async () => {
    const res = await api(`/api/orders/${ctx.order.id}`, { token: ctx.other.accessToken });
    assert.equal(res.status, 403);
  });

  test('a client cannot move their own order along', async () => {
    const res = await api(`/api/orders/${ctx.order.id}/status`, {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { status: 'collected' },
    });
    assert.equal(res.status, 403);
  });

  test('an artist collects it, and it cannot go backwards', async () => {
    const ok = await api(`/api/orders/${ctx.order.id}/status`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { status: 'collected' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, 'collected');

    const back = await api(`/api/orders/${ctx.order.id}/status`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { status: 'ready' },
    });
    assert.equal(back.status, 409);
  });

  test('rejects a status that does not belong to the fulfilment type', async () => {
    const res = await api(`/api/orders/${ctx.order.id}/status`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { status: 'delivered' },
    });
    assert.equal(res.status, 400);
  });

  test('looks an order up by its pickup code', async () => {
    const res = await api(`/api/orders/manage/by-code/FR1|O|${ctx.order.code}`, {
      token: ctx.artistSession.accessToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, ctx.order.id);
  });
});

describe('loyalty', () => {
  test('a client cannot mint their own check-in token', async () => {
    assert.equal((await api('/api/loyalty/check-in-token', { token: ctx.client.accessToken })).status, 403);
  });

  test('rejects a forged code', async () => {
    const res = await api('/api/loyalty/check-in', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { code: `FR1|C|${ctx.artist._id}|${Math.floor(Date.now() / 60000)}|ABCDEF` },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /isn’t from FadeRoom/);
  });

  test('rejects an expired code', async () => {
    const stale = checkinToken(String(ctx.artist._id), Math.floor(Date.now() / 60000) - 10);
    const res = await api('/api/loyalty/check-in', {
      token: ctx.client.accessToken, method: 'POST', body: { code: stale },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /expired/);
  });

  test('a real scan takes a stamp', async () => {
    const { body: qr } = await api('/api/loyalty/check-in-token', { token: ctx.artistSession.accessToken });
    assert.ok(qr.token.startsWith('FR1|C|'));

    const res = await api('/api/loyalty/check-in', {
      token: ctx.client.accessToken, method: 'POST', body: { code: qr.token },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.stamps, 1);
    assert.equal(res.body.reward, null);
  });

  test('the six-character fallback works too', async () => {
    const { body: qr } = await api('/api/loyalty/check-in-token', { token: ctx.artistSession.accessToken });
    const res = await api('/api/loyalty/check-in', {
      token: ctx.client.accessToken, method: 'POST', body: { code: qr.code },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.stamps, 2);
  });

  test('the fifth stamp mints a free cut and resets the card', async () => {
    let last;
    for (let i = 0; i < 3; i += 1) {
      const { body: qr } = await api('/api/loyalty/check-in-token', { token: ctx.artistSession.accessToken });
      last = await api('/api/loyalty/check-in', {
        token: ctx.client.accessToken, method: 'POST', body: { code: qr.token },
      });
      assert.equal(last.status, 200);
    }
    assert.ok(last.body.reward, 'no reward after five check-ins');
    assert.equal(last.body.stamps, 0, 'card did not reset');
    assert.match(last.body.reward.code, /^[A-Z2-9]{6}$/);
    ctx.reward = last.body.reward;
  });

  test('the cooldown blocks a second stamp in one visit', async () => {
    /* This is the rule the demo turns off; prove it works when it is on. */
    const { env } = await import('../src/config/env.js');
    const original = env.checkinCooldownMs;
    env.checkinCooldownMs = 4 * 60 * 60 * 1000;
    try {
      const { body: qr } = await api('/api/loyalty/check-in-token', { token: ctx.artistSession.accessToken });
      const res = await api('/api/loyalty/check-in', {
        token: ctx.client.accessToken, method: 'POST', body: { code: qr.token },
      });
      assert.equal(res.status, 429);
    } finally {
      env.checkinCooldownMs = original;
    }
  });

  test('a client has no route to burn their own reward', async () => {
    const res = await api(`/api/loyalty/rewards/${ctx.reward.code}/redeem`, {
      token: ctx.client.accessToken, method: 'POST',
    });
    assert.equal(res.status, 403);
  });

  test('the artist redeems it, and it cannot be used twice', async () => {
    const look = await api(`/api/loyalty/rewards/${ctx.reward.code}`, { token: ctx.artistSession.accessToken });
    assert.equal(look.status, 200);
    assert.equal(look.body.client.name, 'Elie Saide');

    const first = await api(`/api/loyalty/rewards/${ctx.reward.code}/redeem`, {
      token: ctx.artistSession.accessToken, method: 'POST',
    });
    assert.equal(first.status, 200);

    const second = await api(`/api/loyalty/rewards/${ctx.reward.code}/redeem`, {
      token: ctx.artistSession.accessToken, method: 'POST',
    });
    assert.equal(second.status, 409);
  });
});

describe('appointments', () => {
  test('offers slots and refuses a double booking', async () => {
    const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const avail = await api(
      `/api/appointments/availability?artist=${ctx.artist._id}&date=${date}&service=${ctx.service._id}`,
    );
    assert.equal(avail.status, 200);
    const slot = avail.body.slots.find((s) => s.available);
    assert.ok(slot, 'no slots offered');

    const first = await api('/api/appointments', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { artist: String(ctx.artist._id), service: String(ctx.service._id), startsAt: slot.startsAt },
    });
    assert.equal(first.status, 201);
    ctx.appointment = first.body;

    const clash = await api('/api/appointments', {
      token: ctx.other.accessToken,
      method: 'POST',
      body: { artist: String(ctx.artist._id), service: String(ctx.service._id), startsAt: slot.startsAt },
    });
    assert.equal(clash.status, 409);
  });

  test('that slot is no longer offered', async () => {
    const date = new Date(ctx.appointment.startsAt).toISOString().slice(0, 10);
    const avail = await api(
      `/api/appointments/availability?artist=${ctx.artist._id}&date=${date}&service=${ctx.service._id}`,
    );
    const taken = avail.body.slots.find(
      (s) => new Date(s.startsAt).getTime() === new Date(ctx.appointment.startsAt).getTime(),
    );
    assert.equal(taken.available, false);
  });

  test('refuses a booking in the past', async () => {
    const res = await api('/api/appointments', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: {
        artist: String(ctx.artist._id),
        service: String(ctx.service._id),
        startsAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    });
    assert.equal(res.status, 400);
  });

  test('cancelling returns a held free cut to the card', async () => {
    const card = await Loyalty.findOne({ user: ctx.client.user.id });
    card.rewards.push({ code: 'TESTCD', status: 'available', earnedAt: new Date() });
    await card.save();

    const date = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
    const avail = await api(
      `/api/appointments/availability?artist=${ctx.artist._id}&date=${date}&service=${ctx.service._id}`,
    );
    const slot = avail.body.slots.find((s) => s.available);

    const booked = await api('/api/appointments', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: {
        artist: String(ctx.artist._id),
        service: String(ctx.service._id),
        startsAt: slot.startsAt,
        useReward: true,
      },
    });
    assert.equal(booked.status, 201);
    assert.equal(booked.body.free, true);

    const held = await Loyalty.findOne({ user: ctx.client.user.id });
    assert.equal(held.rewards.find((r) => r.code === booked.body.rewardCode).status, 'reserved');

    const cancelled = await api(`/api/appointments/${booked.body.id}/cancel`, {
      token: ctx.client.accessToken, method: 'POST',
    });
    assert.equal(cancelled.status, 200);

    const after = await Loyalty.findOne({ user: ctx.client.user.id });
    assert.equal(
      after.rewards.find((r) => r.code === booked.body.rewardCode).status,
      'available',
      'the free cut was lost when the booking was cancelled',
    );
  });
});

describe('realtime', () => {
  test('rejects an unauthenticated socket', async () => {
    const socket = ioClient(base, { transports: ['websocket'], reconnection: false });
    const error = await new Promise((resolve) => {
      socket.on('connect_error', resolve);
      socket.on('connect', () => resolve(null));
    });
    socket.close();
    assert.ok(error, 'an anonymous socket was allowed to connect');
  });

  test('a CMS notification reaches the client’s socket', async () => {
    const socket = ioClient(base, {
      transports: ['websocket'],
      reconnection: false,
      auth: { token: ctx.client.accessToken },
    });
    await new Promise((resolve, reject) => {
      socket.on('ready', resolve);
      socket.on('connect_error', reject);
    });

    const received = new Promise((resolve) => socket.on('notification:new', resolve));

    const sent = await api('/api/notifications', {
      token: ctx.admin.accessToken,
      method: 'POST',
      body: { title: 'New in the shop', body: 'Blade oil just landed.', audience: 'clients' },
    });
    assert.equal(sent.status, 201);

    const push = await Promise.race([
      received,
      new Promise((_, reject) => setTimeout(() => reject(new Error('no push within 3s')), 3000)),
    ]);
    assert.equal(push.title, 'New in the shop');

    socket.close();
  });

  test('an order status change reaches the buyer', async () => {
    const socket = ioClient(base, {
      transports: ['websocket'], reconnection: false, auth: { token: ctx.client.accessToken },
    });
    await new Promise((resolve) => socket.on('ready', resolve));

    const orders = await api('/api/orders', { token: ctx.client.accessToken });
    const open = orders.body.find((o) => o.status === 'packing');
    const received = new Promise((resolve) => socket.on('order:status', resolve));

    await api(`/api/orders/${open.id}/status`, {
      token: ctx.artistSession.accessToken, method: 'POST', body: { status: 'out' },
    });

    const update = await Promise.race([
      received,
      new Promise((_, reject) => setTimeout(() => reject(new Error('no push within 3s')), 3000)),
    ]);
    assert.equal(update.status, 'out');

    socket.close();
  });

  test('an artist may not broadcast to the whole shop', async () => {
    const res = await api('/api/notifications', {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { title: 'Everyone', body: 'Hello', audience: 'all' },
    });
    assert.equal(res.status, 403);
  });
});
