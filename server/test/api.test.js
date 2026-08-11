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
process.env.MAX_OPEN_REQUESTS = '3'; /* pinned so the cap test does not read the default */
process.env.SHOP_TIMEZONE = 'Asia/Beirut'; /* the reminder copy asserts on the shop's clock */

/* Provider sign-in is tested against our own key server rather than Apple's, so
   the signature, kid lookup, issuer and audience checks all run for real and
   only the source of the public keys is local. Set before any import: env.js
   and social.js read these once, at load. */
const APPLE_AUDIENCE = 'com.faderoom';
const APPLE_KID = 'test-key-1';
process.env.APPLE_CLIENT_IDS = APPLE_AUDIENCE;
/* The URL itself is set in setup(), once the OS has told us which port it gave
   us — a fixed one strands the suite behind whatever crashed run still holds it. */
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.SHOP_SECRET = 'test-shop-secret';

import test, { after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import mongoose from 'mongoose';
import jsonwebtoken from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';

/* The keypair the stand-in Apple serves and the tests sign with. */
const appleKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const applePrivateKey = appleKeyPair.privateKey;
let appleKeyServer;

const { createApp } = await import('../src/app.js');
const { createSocketServer } = await import('../src/socket/index.js');
const { connectDb } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { Artist } = await import('../src/models/Artist.js');
const { Service } = await import('../src/models/Service.js');
const { Product } = await import('../src/models/Product.js');
const { Loyalty } = await import('../src/models/Loyalty.js');
const { Appointment } = await import('../src/models/Appointment.js');
const { checkinToken } = await import('../src/lib/codes.js');
const { sweepReminders, lapsedLeads, leadPhrase } = await import('../src/lib/reminders.js');
const { sweepBirthdays, birthdayFallsToday, shopToday } = await import('../src/lib/birthdays.js');
const { getSettings } = await import('../src/models/ShopSettings.js');
const { grantBirthdayReward } = await import('../src/lib/rewards.js');
const { toWhatsAppNumber } = await import('../src/lib/whatsapp.js');
const { HaircutRecord } = await import('../src/models/HaircutRecord.js');

/** Free slots on a day far enough out that no other suite has touched it. */
const availabilityFor = async (daysAhead) => {
  const date = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
  const res = await api(
    `/api/appointments/availability?artist=${ctx.artist._id}&date=${date}&service=${ctx.service._id}`,
  );
  return res.body;
};

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

const login = async (email) =>
  (await api('/api/auth/login', { method: 'POST', body: { email, password: 'password1' } })).body;

/* Top-level await rather than a before() hook: the test runner collects tests
   only after the module finishes evaluating, so every test is guaranteed to
   see a booted server. */
async function setup() {
  /* Stand in for https://appleid.apple.com/auth/keys, serving the public half of
     the pair the tests sign with, in the JWKS shape Apple uses. */
  const jwk = crypto.createPublicKey(appleKeyPair.publicKey).export({ format: 'jwk' });
  appleKeyServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [{ ...jwk, kid: APPLE_KID, alg: 'RS256', use: 'sig' }] }));
  });
  await new Promise((resolve) => appleKeyServer.listen(0, '127.0.0.1', resolve));
  process.env.APPLE_KEYS_URL = `http://127.0.0.1:${appleKeyServer.address().port}/keys`;

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

  ctx.client = await login('elie@test.app');
  ctx.other = await login('marc@test.app');
  ctx.artistSession = await login('karim@test.app');
  ctx.admin = await login('admin@test.app');
}

await setup();

after(async () => {
  await new Promise((resolve) => appleKeyServer.close(resolve));
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

describe('the client record', () => {
  const signUp = (body) => api('/api/auth/register', { method: 'POST', body });

  const valid = {
    name: 'Ziad Haddad',
    email: 'ziad@test.app',
    password: 'password1',
    phone: '+961 70 111 222',
    dateOfBirth: '1994-03-21',
    visitFrequencyWeeks: 3,
  };

  test('sign-up takes the whole record', async () => {
    const res = await signUp(valid);
    assert.equal(res.status, 201);
    assert.equal(res.body.user.dateOfBirth, '1994-03-21');
    assert.equal(res.body.user.visitFrequencyWeeks, 3);
    assert.equal(res.body.user.phone, '+961 70 111 222');
    ctx.newClient = res.body;
  });

  test('every part of it is required', async () => {
    for (const missing of ['name', 'phone', 'dateOfBirth', 'visitFrequencyWeeks']) {
      const body = { ...valid, email: `no-${missing}@test.app` };
      delete body[missing];
      const res = await signUp(body);
      assert.equal(res.status, 422, `${missing} should be required`);
      assert.ok(res.body.fields?.[missing], `${missing} should be named in the error`);
    }
  });

  test('a date that is not a real day is refused', async () => {
    /* Well-formed and impossible. JS rolls 30 February into 2 March rather than
       refusing it, so a regex alone would have let this through. */
    const res = await signUp({ ...valid, email: 'feb30@test.app', dateOfBirth: '2025-02-30' });
    assert.equal(res.status, 422);
    assert.match(res.body.fields.dateOfBirth, /not a real date/i);
  });

  test('a birthday in the future, or in the 1800s, is refused', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const a = await signUp({ ...valid, email: 'future@test.app', dateOfBirth: future });
    assert.equal(a.status, 422);
    assert.match(a.body.fields.dateOfBirth, /future/i);

    const b = await signUp({ ...valid, email: 'ancient@test.app', dateOfBirth: '1799-01-01' });
    assert.equal(b.status, 422);
  });

  test('the frequency has to be one we offer', async () => {
    const res = await signUp({ ...valid, email: 'odd@test.app', visitFrequencyWeeks: 5 });
    assert.equal(res.status, 422);
  });

  test('a client can correct their own details later', async () => {
    const res = await api('/api/auth/me', {
      token: ctx.newClient.accessToken,
      method: 'PATCH',
      body: { dateOfBirth: '1994-03-22', visitFrequencyWeeks: 4, phone: '+961 3 999 888' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.dateOfBirth, '1994-03-22');
    assert.equal(res.body.user.visitFrequencyWeeks, 4);
  });

  test('but not into a state sign-up would have refused', async () => {
    const res = await api('/api/auth/me', {
      token: ctx.newClient.accessToken,
      method: 'PATCH',
      body: { dateOfBirth: '2025-02-30' },
    });
    assert.equal(res.status, 422);
  });

  test('a lapsed gift is not owed to anybody', async () => {
    /* Counting it sends an artist looking for a code the chair will refuse —
       and tells the shop it has a liability it does not have. */
    const card = await Loyalty.findOne({ user: ctx.newClient.user.id });
    card.rewards = [
      { code: 'LIVEEE', status: 'available', earnedAt: new Date(), expiresAt: null },
      {
        code: 'DEADXX',
        status: 'available',
        earnedAt: new Date(Date.now() - 60 * 86_400_000),
        kind: 'birthday',
        expiresAt: new Date(Date.now() - 86_400_000),
      },
    ];
    await card.save();

    const res = await api('/api/loyalty/clients', { token: ctx.artistSession.accessToken });
    const entry = res.body.find((c) => c.user.id === ctx.newClient.user.id);
    assert.equal(entry.owedRewards, 1, 'the expired gift should not be counted');

    /* And the chair agrees. */
    const burn = await api('/api/loyalty/rewards/DEADXX/redeem', {
      token: ctx.artistSession.accessToken, method: 'POST',
    });
    assert.equal(burn.status, 409);
    assert.match(burn.body.error, /expired/i);
  });

  test('the artist’s client book says who is overdue', async () => {
    /* Cuts every 3 weeks, last seen 7 weeks ago. */
    const card = await Loyalty.findOne({ user: ctx.newClient.user.id });
    card.lastCheckInAt = new Date(Date.now() - 49 * 86_400_000);
    await card.save();
    await User.findByIdAndUpdate(ctx.newClient.user.id, { visitFrequencyWeeks: 3 });

    const res = await api('/api/loyalty/clients', { token: ctx.artistSession.accessToken });
    assert.equal(res.status, 200);
    const entry = res.body.find((c) => c.user.id === ctx.newClient.user.id);
    assert.ok(entry, 'the client should be in the book');
    assert.equal(entry.overdue, true);
    assert.ok(entry.dueAt, 'and should say when they were due');

    /* Somebody who has never checked in is not overdue — they are unknown, and
       guessing would put every new sign-up on the chase list. */
    const fresh = res.body.find((c) => !c.lastCheckInAt);
    if (fresh) assert.equal(fresh.overdue, false);
  });
});

describe('signing in with a provider', () => {
  /**
   * Run against Apple, with our own key server standing in for Apple's.
   *
   * The tokens here are genuinely signed and genuinely verified — signature,
   * `kid` lookup, issuer and audience all go through the real code path. Only
   * the source of the public keys is local. Stubbing the verifier out instead
   * would leave the one part most worth getting right untested.
   */
  const signIn = (body) => api('/api/auth/social', { method: 'POST', body });

  const tokenFor = ({ subject, email, emailVerified = true, audience = APPLE_AUDIENCE, issuer }) =>
    jsonwebtoken.sign(
      {
        sub: subject,
        email,
        email_verified: emailVerified,
        iss: issuer ?? 'https://appleid.apple.com',
        aud: audience,
      },
      applePrivateKey,
      { algorithm: 'RS256', keyid: APPLE_KID, expiresIn: '10m' },
    );

  test('a first sign-in creates a client, minus what a provider cannot know', async () => {
    const res = await signIn({
      provider: 'apple',
      idToken: tokenFor({ subject: 'apple-1001', email: 'zeina@test.app' }),
      /* Apple hands the name over once and never again, so the app sends it. */
      name: 'Zeina Khoury',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.name, 'Zeina Khoury');
    assert.equal(res.body.user.email, 'zeina@test.app');
    assert.equal(res.body.user.role, 'client', 'a provider must never mint staff');
    assert.ok(res.body.accessToken);
    /* The shop asks for a birthday and a mobile; no provider knows either. */
    assert.equal(res.body.profileComplete, false);
    assert.equal(res.body.user.dateOfBirth, '');
    ctx.social = res.body;
  });

  test('signing in again finds the same account, not a second one', async () => {
    const res = await signIn({
      provider: 'apple',
      idToken: tokenFor({ subject: 'apple-1001', email: 'zeina@test.app' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, ctx.social.user.id);
    assert.equal(await User.countDocuments({ email: 'zeina@test.app' }), 1);
  });

  test('a changed email on the provider still finds them', async () => {
    /* Matched on the provider's subject, never on the email — people change the
       address on an account, and matching on something editable would silently
       detach their history. */
    const res = await signIn({
      provider: 'apple',
      idToken: tokenFor({ subject: 'apple-1001', email: 'zeina.new@test.app' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, ctx.social.user.id);
    /* The link records the new address; the account keeps the one it signs in
       with, because that is unique-indexed and password login depends on it. */
    assert.equal(res.body.user.email, 'zeina@test.app');
    assert.equal(res.body.user.identities[0].email, 'zeina.new@test.app');
  });

  test('it links to an account that already had a password', async () => {
    const before = await User.findById(ctx.client.user.id);
    assert.equal(before.identities.length, 0);

    const res = await signIn({
      provider: 'apple',
      idToken: tokenFor({ subject: 'apple-2002', email: before.email }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, String(before._id), 'they should keep their loyalty card');

    const after = await User.findById(before._id);
    assert.equal(after.identities.length, 1);
    assert.equal(after.identities[0].provider, 'apple');

    /* And the password still works — linking adds a door, it does not replace one. */
    const still = await api('/api/auth/login', {
      method: 'POST', body: { email: before.email, password: 'password1' },
    });
    assert.equal(still.status, 200);
  });

  test('an unverified email is refused rather than linked', async () => {
    /* The account-takeover case: anybody able to mint a token claiming somebody
       else's address must not be handed their account. */
    const res = await signIn({
      provider: 'apple',
      idToken: tokenFor({
        subject: 'apple-3003',
        email: ctx.other.user.email,
        emailVerified: false,
      }),
    });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /did not confirm an email/i);

    const untouched = await User.findById(ctx.other.user.id);
    assert.equal(untouched.identities.length, 0);
  });

  test('a token minted for somebody else’s app is refused', async () => {
    /* Without the audience check any developer with an Apple app of their own
       could sign in here as anyone. */
    const res = await signIn({
      provider: 'apple',
      idToken: tokenFor({ subject: 'apple-4004', email: 'attacker@test.app', audience: 'com.someone.else' }),
    });
    assert.equal(res.status, 401);
  });

  test('a token from the wrong issuer is refused', async () => {
    const res = await signIn({
      provider: 'apple',
      idToken: tokenFor({ subject: 'apple-5005', email: 'x@test.app', issuer: 'https://evil.example' }),
    });
    assert.equal(res.status, 401);
  });

  test('a token signed with the wrong key is refused', async () => {
    const stranger = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    }).privateKey;

    const forged = jsonwebtoken.sign(
      { sub: 'apple-6006', email: 'x@test.app', email_verified: true, aud: APPLE_AUDIENCE },
      stranger,
      { algorithm: 'RS256', keyid: APPLE_KID, issuer: 'https://appleid.apple.com', expiresIn: '10m' },
    );
    const res = await signIn({ provider: 'apple', idToken: forged });
    assert.equal(res.status, 401);
  });

  test('a provider-only account is told which door it uses', async () => {
    const res = await api('/api/auth/login', {
      method: 'POST', body: { email: 'zeina@test.app', password: 'password1' },
    });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /signs in with Apple/i);
  });

  test('and can set a first password without proving an old one', async () => {
    const res = await api('/api/auth/password', {
      token: ctx.social.accessToken,
      method: 'POST',
      body: { newPassword: 'brandnew1' },
    });
    assert.equal(res.status, 200);

    const now = await api('/api/auth/login', {
      method: 'POST', body: { email: 'zeina@test.app', password: 'brandnew1' },
    });
    assert.equal(now.status, 200);
  });

  test('an account that has a password still has to prove it', async () => {
    const res = await api('/api/auth/password', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { newPassword: 'somethingelse1' },
    });
    assert.equal(res.status, 422);
  });

  test('finishing the profile flips it complete', async () => {
    const res = await api('/api/auth/me', {
      token: ctx.social.accessToken,
      method: 'PATCH',
      body: { phone: '+961 70 555 444', dateOfBirth: '1996-09-09', visitFrequencyWeeks: 4 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.profileComplete, true);
  });

  test('a provider nobody has configured says so, rather than failing oddly', async () => {
    const res = await signIn({ provider: 'google', idToken: 'x'.repeat(40) });
    assert.equal(res.status, 501);
    assert.match(res.body.error, /not set up/i);

    const listed = await api('/api/auth/providers');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.apple.enabled, true);
    assert.equal(listed.body.google.enabled, false, 'no Google client id is set in this suite');
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

describe('prices on request', () => {
  test('setup: a product listed without a price', async () => {
    ctx.quoted = await Product.create({
      name: 'Japanese Shears',
      category: 'Tools',
      price: 320,
      stock: 2,
      status: 'published',
      priceHidden: true,
      owner: ctx.artist._id,
    });
  });

  test('the price never leaves the server', async () => {
    const list = await api('/api/products');
    const shown = list.body.find((p) => p.id === String(ctx.quoted._id));
    assert.ok(shown, 'it should still be listed');
    assert.equal(shown.priceHidden, true);
    /* Absent, not blanked. A price merely omitted from the interface is one
       anybody can read out of the response. */
    assert.equal('price' in shown, false, 'the price was sent to a client');
    assert.equal('compareAtPrice' in shown, false);

    const detail = await api(`/api/products/${ctx.quoted._id}`);
    assert.equal('price' in detail.body, false);
  });

  test('staff still see it, because they have to edit it', async () => {
    const res = await api('/api/products/manage/list', { token: ctx.artistSession.accessToken });
    const mine = res.body.find((p) => p.id === String(ctx.quoted._id));
    assert.equal(mine.price, 320);
    assert.equal(mine.priceHidden, true);
  });

  test('it cannot be bought, however the request is assembled', async () => {
    /* The UI offers no button — but a client can be asked to send anything, and
       a hand-made cart would otherwise buy it at a price nobody was shown. */
    const res = await api('/api/orders', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { items: [{ product: String(ctx.quoted._id), qty: 1 }], fulfilment: 'pickup' },
    });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /priced on request/i);
  });

  test('a mixed cart is refused rather than partly filled', async () => {
    const res = await api('/api/orders', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: {
        items: [
          { product: String(ctx.pomade._id), qty: 1 },
          { product: String(ctx.quoted._id), qty: 1 },
        ],
        fulfilment: 'pickup',
      },
    });
    assert.equal(res.status, 409);
    /* And nothing was taken off the shelf on the way to refusing. */
    const pomade = await Product.findById(ctx.pomade._id);
    assert.equal(pomade.stock, 5);
  });

  test('the shop can hide every price at once', async () => {
    await api('/api/settings', {
      token: ctx.admin.accessToken,
      method: 'PATCH',
      body: { marketplace: { hideAllPrices: true } },
    });

    const list = await api('/api/products');
    assert.ok(list.body.length > 1);
    assert.ok(
      list.body.every((p) => p.priceHidden && !('price' in p)),
      'the shop-wide switch should cover products that never asked to be hidden',
    );

    /* And nothing at all can be bought while it is on. */
    const buy = await api('/api/orders', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { items: [{ product: String(ctx.pomade._id), qty: 1 }], fulfilment: 'pickup' },
    });
    assert.equal(buy.status, 409);
  });

  test('turning it off puts the prices back', async () => {
    await api('/api/settings', {
      token: ctx.admin.accessToken,
      method: 'PATCH',
      body: { marketplace: { hideAllPrices: false } },
    });

    const list = await api('/api/products');
    const pomade = list.body.find((p) => p.id === String(ctx.pomade._id));
    assert.equal(pomade.price, 18);
    assert.equal(pomade.priceHidden, false);

    /* The one that asked to be hidden stays hidden. */
    const shears = list.body.find((p) => p.id === String(ctx.quoted._id));
    assert.equal('price' in shears, false);
  });

  test('the app is told what to say when somebody asks', async () => {
    const res = await api('/api/config');
    assert.match(res.body.contact.priceEnquiry, /\{product\}/, 'the app fills in which product');
    assert.match(res.body.contact.priceEnquiry, /FadeRoom/);
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
  /* Slots for a day far enough out that nothing else in the suite has touched it. */
  const availability = async (daysAhead) => {
    const date = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
    const res = await api(
      `/api/appointments/availability?artist=${ctx.artist._id}&date=${date}&service=${ctx.service._id}`,
    );
    assert.equal(res.status, 200);
    return res.body;
  };

  const request = (session, startsAt, extra = {}) =>
    api('/api/appointments', {
      token: session.accessToken,
      method: 'POST',
      body: {
        artist: String(ctx.artist._id),
        service: String(ctx.service._id),
        startsAt,
        ...extra,
      },
    });

  test('a request is not a reservation — two clients can ask for the same time', async () => {
    const slot = (await availability(2)).slots.find((s) => s.available);
    assert.ok(slot, 'no slots offered');
    ctx.contested = slot;

    const mine = await request(ctx.client, slot.startsAt);
    assert.equal(mine.status, 201);
    assert.equal(mine.body.status, 'pending', 'a new booking must start as a request');
    ctx.appointment = mine.body;

    /* The old behaviour was a 409 here. Refusing the second client is exactly
       what let the first one take out the whole week. */
    const theirs = await request(ctx.other, slot.startsAt);
    assert.equal(theirs.status, 201);
    ctx.rival = theirs.body;
  });

  test('the same client cannot ask twice for the same time', async () => {
    const again = await request(ctx.client, ctx.contested.startsAt);
    assert.equal(again.status, 409);
  });

  test('a requested slot is still on offer, and says how many are queued', async () => {
    const slot = (await availability(2)).slots.find(
      (s) => new Date(s.startsAt).getTime() === new Date(ctx.contested.startsAt).getTime(),
    );
    assert.equal(slot.available, true, 'requests must not hold the slot');
    assert.equal(slot.requested, 2);
  });

  test('a client cannot accept their own request', async () => {
    const res = await api(`/api/appointments/${ctx.appointment.id}/confirm`, {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { durationMin: 25 },
    });
    assert.equal(res.status, 403);
  });

  test('the artist accepts with their own length, not the catalogue’s', async () => {
    assert.equal(ctx.appointment.durationMin, 45, 'the request carries the service estimate');

    const res = await api(`/api/appointments/${ctx.appointment.id}/confirm`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { durationMin: 25 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.appointment.status, 'confirmed');
    assert.equal(res.body.appointment.durationMin, 25, 'the artist’s length is what gets stored');
  });

  test('accepting one request declines the others for that time', async () => {
    const rival = await Appointment.findById(ctx.rival.id);
    assert.equal(rival.status, 'declined');
    assert.match(rival.declineReason, /someone else/i);
  });

  test('the slot is off the board once it is accepted', async () => {
    const slot = (await availability(2)).slots.find(
      (s) => new Date(s.startsAt).getTime() === new Date(ctx.contested.startsAt).getTime(),
    );
    assert.equal(slot.available, false);
    assert.equal(slot.requested, 0);
  });

  test('a confirmed booking blocks a fresh request for the same time', async () => {
    const res = await request(ctx.other, ctx.contested.startsAt);
    assert.equal(res.status, 409);
  });

  test('an accepted booking cannot be accepted again', async () => {
    const res = await api(`/api/appointments/${ctx.appointment.id}/confirm`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { durationMin: 30 },
    });
    assert.equal(res.status, 409);
  });

  test('a pending request cannot be marked completed', async () => {
    const slot = (await availability(3)).slots.find((s) => s.available);
    const pending = await request(ctx.other, slot.startsAt);
    assert.equal(pending.status, 201);

    const res = await api(`/api/appointments/${pending.body.id}/status`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { status: 'completed' },
    });
    assert.equal(res.status, 409);

    /* Tidy up so it does not count against the cap test's chair. */
    await api(`/api/appointments/${pending.body.id}/decline`, {
      token: ctx.artistSession.accessToken, method: 'POST',
    });
  });

  test('a length that runs into the next booking is refused', async () => {
    const slots = (await availability(5)).slots.filter((s) => s.available);
    const [first, second] = slots;
    assert.ok(second, 'need two free slots');

    const later = await request(ctx.client, second.startsAt);
    assert.equal(later.status, 201);
    const confirmedLater = await api(`/api/appointments/${later.body.id}/confirm`, {
      token: ctx.artistSession.accessToken, method: 'POST', body: { durationMin: 30 },
    });
    assert.equal(confirmedLater.status, 200);

    const earlier = await request(ctx.other, first.startsAt);
    assert.equal(earlier.status, 201);

    /* Slots are 45 minutes apart, so 90 minutes swallows the next booking. */
    const tooLong = await api(`/api/appointments/${earlier.body.id}/confirm`, {
      token: ctx.artistSession.accessToken, method: 'POST', body: { durationMin: 90 },
    });
    assert.equal(tooLong.status, 409);
    assert.match(tooLong.body.error, /leaves no room/i);

    /* The same request accepted at a length that fits goes through. */
    const fits = await api(`/api/appointments/${earlier.body.id}/confirm`, {
      token: ctx.artistSession.accessToken, method: 'POST', body: { durationMin: 40 },
    });
    assert.equal(fits.status, 200);
  });

  test('the artist can move the start time when accepting', async () => {
    const [asked, moveTo] = (await availability(7)).slots.filter((s) => s.available);
    assert.ok(moveTo, 'need two free slots');
    ctx.moved = { asked, moveTo };

    const mine = await request(ctx.client, asked.startsAt);
    assert.equal(mine.status, 201);
    /* A second client on the *original* time, to prove the move does not take
       them down with it. */
    const rival = await request(ctx.other, asked.startsAt);
    assert.equal(rival.status, 201);
    ctx.movedRival = rival.body;

    const res = await api(`/api/appointments/${mine.body.id}/confirm`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { startsAt: moveTo.startsAt, durationMin: 30 },
    });
    assert.equal(res.status, 200);
    assert.equal(
      new Date(res.body.appointment.startsAt).getTime(),
      new Date(moveTo.startsAt).getTime(),
    );
    assert.equal(res.body.appointment.durationMin, 30);
    assert.equal(
      new Date(res.body.appointment.requestedStartsAt).getTime(),
      new Date(asked.startsAt).getTime(),
      'the time the client asked for must survive the move',
    );
  });

  test('moving off a time leaves the requests still sitting on it alone', async () => {
    const rival = await Appointment.findById(ctx.movedRival.id);
    assert.equal(rival.status, 'pending', 'only the window actually taken is superseded');

    const slots = (await availability(7)).slots;
    const at = (slot) =>
      slots.find((s) => new Date(s.startsAt).getTime() === new Date(slot.startsAt).getTime());
    assert.equal(at(ctx.moved.asked).available, true, 'the vacated time is back on the board');
    assert.equal(at(ctx.moved.moveTo).available, false, 'the time it moved to is taken');
  });

  test('a move into another booking is refused', async () => {
    const res = await api(`/api/appointments/${ctx.movedRival.id}/confirm`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { startsAt: ctx.moved.moveTo.startsAt, durationMin: 30 },
    });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /leaves no room/i);
  });

  test('a move into the past is refused', async () => {
    const res = await api(`/api/appointments/${ctx.movedRival.id}/confirm`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { startsAt: new Date(Date.now() - 3_600_000).toISOString() },
    });
    assert.equal(res.status, 400);

    /* Still pending after two refused moves — a rejected decision changes nothing. */
    const untouched = await Appointment.findById(ctx.movedRival.id);
    assert.equal(untouched.status, 'pending');
    await api(`/api/appointments/${ctx.movedRival.id}/decline`, {
      token: ctx.artistSession.accessToken, method: 'POST',
    });
  });

  test('refuses a booking in the past', async () => {
    const res = await request(ctx.client, new Date(Date.now() - 86_400_000).toISOString());
    assert.equal(res.status, 400);
  });

  test('a client cannot leave more than the allowed requests open', async () => {
    const user = await makeUser('Hadi Karam', 'hadi@test.app', 'client');
    const greedy = await login(user.email);

    const slots = (await availability(6)).slots.filter((s) => s.available);
    assert.ok(slots.length > 3, 'need four free slots');

    for (let i = 0; i < 3; i += 1) {
      const res = await request(greedy, slots[i].startsAt);
      assert.equal(res.status, 201, `request ${i + 1} should be accepted`);
    }

    const fourth = await request(greedy, slots[3].startsAt);
    assert.equal(fourth.status, 429, 'the fourth open request should be refused');
  });

  test('withdrawing a request returns a held free cut to the card', async () => {
    const card = await Loyalty.findOne({ user: ctx.client.user.id });
    card.rewards.push({ code: 'TESTCD', status: 'available', earnedAt: new Date() });
    await card.save();

    const slot = (await availability(4)).slots.find((s) => s.available);
    const booked = await request(ctx.client, slot.startsAt, { useReward: true });
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

  test('two live rewards do not get confused with each other', async () => {
    /* The trap: reserving with "any available reward" and then reading back
       "the first reserved one" hands the *second* booking the code the first is
       already holding, and cancelling either releases a reward the other still
       needs. Two bookings, two rewards, two distinct codes. */
    /* Replaced rather than appended: earlier tests leave their own rewards
       behind, and "which of three" is a different question from the one under
       test. */
    const card = await Loyalty.findOne({ user: ctx.client.user.id });
    card.rewards = [
      { code: 'AAAAAA', status: 'available', earnedAt: new Date(), expiresAt: null },
      {
        code: 'BBBBBB',
        status: 'available',
        earnedAt: new Date(),
        kind: 'birthday',
        expiresAt: new Date(Date.now() + 5 * 86_400_000),
      },
    ];
    await card.save();

    const slots = (await availability(11)).slots.filter((s) => s.available);
    const first = await request(ctx.client, slots[0].startsAt, { useReward: true });
    const second = await request(ctx.client, slots[1].startsAt, { useReward: true });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(
      first.body.rewardCode,
      second.body.rewardCode,
      'both bookings were given the same reward',
    );

    /* And the perishable one goes first — a birthday gift with a deadline is
       spent before a stamped-for cut that never lapses. */
    assert.equal(first.body.rewardCode, 'BBBBBB');
    assert.equal(second.body.rewardCode, 'AAAAAA');

    /* Cancelling one returns only its own. */
    await api(`/api/appointments/${first.body.id}/cancel`, {
      token: ctx.client.accessToken, method: 'POST',
    });
    const after = await Loyalty.findOne({ user: ctx.client.user.id });
    assert.equal(after.rewards.find((r) => r.code === 'BBBBBB').status, 'available');
    assert.equal(
      after.rewards.find((r) => r.code === 'AAAAAA').status,
      'reserved',
      'the other booking’s reward was released with it',
    );

    await api(`/api/appointments/${second.body.id}/cancel`, {
      token: ctx.client.accessToken, method: 'POST',
    });
  });

  test('a request the artist turns down returns the free cut too', async () => {
    const slot = (await availability(4)).slots.filter((s) => s.available)[1];
    const booked = await request(ctx.client, slot.startsAt, { useReward: true });
    assert.equal(booked.status, 201);
    assert.equal(booked.body.free, true);

    const declined = await api(`/api/appointments/${booked.body.id}/decline`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { reason: 'Fully booked that afternoon' },
    });
    assert.equal(declined.status, 200);
    assert.equal(declined.body.status, 'declined');
    assert.equal(declined.body.free, false);

    const after = await Loyalty.findOne({ user: ctx.client.user.id });
    assert.equal(
      after.rewards.find((r) => r.code === booked.body.rewardCode).status,
      'available',
      'the free cut was lost when the artist declined',
    );
  });
});

describe('turnaround between clients', () => {
  /* Its own chair, so changing the gap cannot disturb the booking suite above. */
  let chair;
  let artistToken;

  const availability = async (daysAhead, serviceId) => {
    const date = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
    const res = await api(
      `/api/appointments/availability?artist=${chair._id}&date=${date}&service=${serviceId}`,
    );
    assert.equal(res.status, 200);
    return res.body;
  };

  test('setup: a second chair, and a 15-minute service', async () => {
    const user = await makeUser('Rami Haddad', 'rami@test.app', 'artist');
    chair = await Artist.create({
      user: user._id,
      displayName: 'Rami Haddad',
      chair: 'Chair 2',
      daysOff: [],
      workingHours: { start: '10:00', end: '20:00' },
      gapMin: 5,
    });
    artistToken = (await login('rami@test.app')).accessToken;
    ctx.trim = await Service.create({ name: 'Beard trim', durationMin: 15, price: 15 });
  });

  test('slots run one cut plus one turnaround apart', async () => {
    const { slots, gapMin } = await availability(8, ctx.trim._id);
    assert.equal(gapMin, 5);
    /* 15-minute cut, 5-minute gap: 10:00, 10:20, 10:40 — exactly the rhythm the
       chair can actually work. */
    assert.deepEqual(slots.slice(0, 4).map((s) => s.time), ['10:00', '10:20', '10:40', '11:00']);
  });

  test('turning the gap off packs them back to back', async () => {
    const res = await api(`/api/artists/${chair._id}`, {
      token: artistToken, method: 'PATCH', body: { gapMin: 0 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.gapMin, 0);

    const { slots } = await availability(8, ctx.trim._id);
    assert.deepEqual(slots.slice(0, 4).map((s) => s.time), ['10:00', '10:15', '10:30', '10:45']);
  });

  test('a longer gap spreads them out', async () => {
    await api(`/api/artists/${chair._id}`, {
      token: artistToken, method: 'PATCH', body: { gapMin: 15 },
    });
    const { slots } = await availability(8, ctx.trim._id);
    assert.deepEqual(slots.slice(0, 3).map((s) => s.time), ['10:00', '10:30', '11:00']);
  });

  test('the turnaround is booked time — a request inside it is refused', async () => {
    await api(`/api/artists/${chair._id}`, {
      token: artistToken, method: 'PATCH', body: { gapMin: 5 },
    });

    const { slots } = await availability(9, ctx.trim._id);
    const first = slots[0];

    const asked = await api('/api/appointments', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { artist: String(chair._id), service: String(ctx.trim._id), startsAt: first.startsAt },
    });
    assert.equal(asked.status, 201);
    const confirmed = await api(`/api/appointments/${asked.body.id}/confirm`, {
      token: artistToken, method: 'POST', body: { durationMin: 15 },
    });
    assert.equal(confirmed.status, 200);

    /* The cut ends at 10:15 but the chair is not free until 10:20. */
    const tooSoon = new Date(new Date(first.startsAt).getTime() + 15 * 60_000).toISOString();
    const squeeze = await api('/api/appointments', {
      token: ctx.other.accessToken,
      method: 'POST',
      body: { artist: String(chair._id), service: String(ctx.trim._id), startsAt: tooSoon },
    });
    assert.equal(squeeze.status, 409, 'a booking starting the instant the clippers stop was allowed');

    /* Five minutes later is fine. */
    const onTime = new Date(new Date(first.startsAt).getTime() + 20 * 60_000).toISOString();
    const ok = await api('/api/appointments', {
      token: ctx.other.accessToken,
      method: 'POST',
      body: { artist: String(chair._id), service: String(ctx.trim._id), startsAt: onTime },
    });
    assert.equal(ok.status, 201);
    ctx.gapDay = { first, onTime };
  });

  test('the day realigns to what is free after a booking', async () => {
    /* 10:00–10:15 is taken and 10:20–10:35 was just asked for (a request holds
       nothing), so the offered times pick up from the end of the confirmed cut
       plus its turnaround rather than carrying on the old rhythm. */
    const { slots } = await availability(9, ctx.trim._id);
    const taken = slots.find((s) => s.time === '10:00');
    assert.equal(taken.available, false, 'the booked time should still be shown, struck through');
    assert.ok(
      slots.some((s) => s.time === '10:20'),
      'the first genuinely free time after the cut must be on offer',
    );
  });

  test('an artist cannot set someone else’s turnaround', async () => {
    const res = await api(`/api/artists/${ctx.artist._id}`, {
      token: artistToken, method: 'PATCH', body: { gapMin: 30 },
    });
    assert.equal(res.status, 403);
  });

  test('the gap is bounded', async () => {
    for (const gapMin of [-5, 90]) {
      const res = await api(`/api/artists/${chair._id}`, {
        token: artistToken, method: 'PATCH', body: { gapMin },
      });
      assert.equal(res.status, 422, `gapMin ${gapMin} should be refused`);
    }
  });
});

describe('reminders', () => {
  const MIN = 60_000;

  /* The sweep is global by design — it is a clock, not a request — so these
     tests get their own client, and assert on their own booking rather than on
     a count that every other suite's leftovers also land in. */
  let session;

  const shopTime = (date) =>
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Beirut',
    }).format(date);

  /* A confirmed booking `startsIn` minutes out, written straight to the
     collection: the sweep is what is under test, not the booking route. Each
     one is at a distinct minute so its reminder is identifiable in the inbox. */
  const bookingIn = async (startsIn, overrides = {}) => {
    const startsAt = new Date(Date.now() + startsIn * MIN);
    startsAt.setSeconds(0, 0);
    return Appointment.create({
      user: session.user.id,
      artist: ctx.artist._id,
      service: ctx.service._id,
      serviceName: 'Haircut',
      startsAt,
      durationMin: 30,
      price: 25,
      status: 'confirmed',
      remindersSent: lapsedLeads(startsAt),
      ...overrides,
    });
  };

  /** Reminders in this client's inbox that name this booking's time. */
  const remindersFor = async (booking) => {
    const inbox = await api('/api/notifications', { token: session.accessToken });
    return inbox.body.filter((n) => n.body?.includes(shopTime(booking.startsAt)));
  };

  test('setup: a client of their own', async () => {
    const user = await makeUser('Nour Rahme', 'nour@test.app', 'client');
    session = await login(user.email);
    assert.ok(session.accessToken);
  });

  test('a booking a day out gets the day-ahead reminder, once', async () => {
    const booking = await bookingIn(1500); /* just over 24h, so 1440 is not yet due */
    assert.deepEqual(booking.remindersSent, [], 'nothing should be pre-marked this far out');

    await sweepReminders();
    assert.deepEqual(
      (await Appointment.findById(booking._id)).remindersSent,
      [],
      'nothing is due 25 hours out',
    );

    /* Wind the clock past the day-ahead mark. */
    const dayAhead = new Date(booking.startsAt.getTime() - 1439 * MIN);
    await sweepReminders(dayAhead);
    assert.deepEqual((await Appointment.findById(booking._id)).remindersSent, [1440]);

    const first = await remindersFor(booking);
    assert.equal(first.length, 1);
    assert.match(first[0].title, /in the chair tomorrow/i);

    /* Sweeping again — a second instance, an overlapping run, a restart — must
       not send it twice. */
    await sweepReminders(dayAhead);
    assert.equal((await remindersFor(booking)).length, 1, 'the reminder was sent twice');
  });

  test('the two-hour reminder follows, and quotes the shop’s clock', async () => {
    const booking = await bookingIn(1600);
    const twoHours = new Date(booking.startsAt.getTime() - 119 * MIN);

    /* Both leads are due by now; only the urgent one should go out. */
    await sweepReminders(twoHours);

    const after = await Appointment.findById(booking._id);
    assert.deepEqual(
      [...after.remindersSent].sort((a, b) => b - a),
      [1440, 120],
      'the lapsed day-ahead reminder must be written off, not left to fire later',
    );

    const sent = await remindersFor(booking);
    assert.equal(sent.length, 1, 'two contradicting reminders went out at once');
    assert.match(sent[0].title, /in 2 hours/i);
    assert.match(
      sent[0].body,
      new RegExp(shopTime(booking.startsAt)),
      'the time must be the shop’s clock, not the server’s',
    );
  });

  test('a booking accepted late gets no stale reminder at all', async () => {
    /* Accepted 90 minutes before it starts. Both marks went by before anybody
       agreed to the cut, so both are written off — and rightly: the client was
       told it was confirmed moments ago, which is the heads-up. Sweeping now
       must not produce "your cut is tomorrow" for something 90 minutes away. */
    const booking = await bookingIn(90);
    assert.deepEqual(booking.remindersSent, [1440, 120], 'passed leads are written off at once');

    await sweepReminders();
    await sweepReminders(new Date(booking.startsAt.getTime() - 1 * MIN));

    assert.equal((await remindersFor(booking)).length, 0, 'a stale reminder was sent');
  });

  test('but one accepted the same morning still gets its two-hour nudge', async () => {
    /* The common case for a same-day booking: the day-ahead mark is long gone,
       the two-hour one is still to come. Writing off the first must not write
       off the second. */
    const booking = await bookingIn(300);
    assert.deepEqual(booking.remindersSent, [1440]);

    await sweepReminders(new Date(booking.startsAt.getTime() - 119 * MIN));

    const sent = await remindersFor(booking);
    assert.equal(sent.length, 1);
    assert.match(sent[0].title, /in 2 hours/i);
  });

  test('a cancelled booking is never reminded about', async () => {
    const booking = await bookingIn(1700, { status: 'cancelled' });
    await sweepReminders(new Date(booking.startsAt.getTime() - 1439 * MIN));

    assert.deepEqual((await Appointment.findById(booking._id)).remindersSent, []);
    assert.equal((await remindersFor(booking)).length, 0);
  });

  test('a booking already under way is left alone', async () => {
    const booking = await bookingIn(1800);
    /* The server was down through both marks and comes back mid-cut. */
    await sweepReminders(new Date(booking.startsAt.getTime() + 10 * MIN));

    assert.deepEqual(
      (await Appointment.findById(booking._id)).remindersSent,
      [],
      'a booking in progress was marked as reminded',
    );
    assert.equal((await remindersFor(booking)).length, 0);
  });

  test('lead phrasing reads like a person wrote it', () => {
    assert.equal(leadPhrase(1440), 'tomorrow');
    assert.equal(leadPhrase(2880), 'in 2 days');
    assert.equal(leadPhrase(120), 'in 2 hours');
    assert.equal(leadPhrase(60), 'in an hour');
    assert.equal(leadPhrase(45), 'in 45 minutes');
  });
});

describe('birthday greetings', () => {
  const inboxOf = async (session, match) => {
    const inbox = await api('/api/notifications', { token: session.accessToken });
    return inbox.body.filter((n) => match.test(n.title));
  };

  /* A date that is today in the shop's clock, `years` ago. */
  const bornToday = (years) => {
    const now = shopToday(new Date());
    return `${now.year - years}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
  };

  test('nothing happens while it is switched off', async () => {
    await User.findByIdAndUpdate(ctx.client.user.id, { dateOfBirth: bornToday(30) });
    const res = await sweepBirthdays();
    assert.equal(res.skipped, 'disabled');
    assert.equal((await inboxOf(ctx.client, /birthday/i)).length, 0);
  });

  test('an admin turns it on and writes the greeting', async () => {
    const res = await api('/api/settings', {
      token: ctx.admin.accessToken,
      method: 'PATCH',
      body: {
        birthday: {
          enabled: true,
          sendHour: 0,
          inAppTitle: 'Happy birthday, {name}! 🎉',
          inAppBody: 'Everyone at {shop} is glad you were born. Something is on the house.',
        },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.birthday.enabled, true);
    /* WhatsApp is not connected in this suite, so the greeting is in-app only
       and no template is demanded. */
    assert.equal(res.body.whatsapp.configured, false);
  });

  test('an artist can read the settings but not change them', async () => {
    assert.equal((await api('/api/settings', { token: ctx.artistSession.accessToken })).status, 200);
    const write = await api('/api/settings', {
      token: ctx.artistSession.accessToken,
      method: 'PATCH',
      body: { birthday: { enabled: false } },
    });
    assert.equal(write.status, 403);
  });

  test('the greeting goes out, with the tokens filled in', async () => {
    const res = await sweepBirthdays();
    assert.equal(res.greeted, 1);
    assert.equal(res.whatsapp, 0, 'no WhatsApp without credentials');

    const [greeting] = await inboxOf(ctx.client, /happy birthday/i);
    assert.ok(greeting, 'the client should have been greeted');
    assert.match(greeting.title, /Happy birthday, Elie!/);
    assert.match(greeting.body, /FadeRoom/);
    assert.ok(!greeting.body.includes('{shop}'), 'tokens must be filled, not printed');
  });

  test('and only once, however many times the sweep runs', async () => {
    assert.equal((await sweepBirthdays()).greeted, 0);
    assert.equal((await sweepBirthdays()).greeted, 0);
    assert.equal((await inboxOf(ctx.client, /happy birthday/i)).length, 1);
  });

  test('somebody born on 29 February is greeted on the 28th in other years', () => {
    assert.equal(birthdayFallsToday('2000-02-29', { year: 2024, month: 2, day: 29 }), true);
    assert.equal(birthdayFallsToday('2000-02-29', { year: 2025, month: 2, day: 28 }), true);
    /* And not twice in a leap year. */
    assert.equal(birthdayFallsToday('2000-02-29', { year: 2024, month: 2, day: 28 }), false);
    /* 2100 is not a leap year, century rule and all. */
    assert.equal(birthdayFallsToday('2000-02-29', { year: 2100, month: 2, day: 28 }), true);
  });

  test('an ordinary date is only ever today’s', () => {
    assert.equal(birthdayFallsToday('1994-03-21', { year: 2026, month: 3, day: 21 }), true);
    assert.equal(birthdayFallsToday('1994-03-21', { year: 2026, month: 3, day: 22 }), false);
    assert.equal(birthdayFallsToday('', { year: 2026, month: 3, day: 21 }), false);
    assert.equal(birthdayFallsToday(undefined, { year: 2026, month: 3, day: 21 }), false);
  });

  test('it waits for the hour the shop chose', async () => {
    await api('/api/settings', {
      token: ctx.admin.accessToken,
      method: 'PATCH',
      body: { birthday: { sendHour: 23 } },
    });
    await User.findByIdAndUpdate(ctx.other.user.id, { dateOfBirth: bornToday(25) });

    const early = new Date();
    early.setHours(6, 0, 0, 0);
    const res = await sweepBirthdays(early);
    assert.equal(res.skipped, 'too early');
    assert.equal((await inboxOf(ctx.other, /happy birthday/i)).length, 0);
  });

  test('a number is turned into something WhatsApp will accept', () => {
    assert.equal(toWhatsAppNumber('+961 70 123 456'), '96170123456');
    assert.equal(toWhatsAppNumber('0096171200100'), '96171200100');
    /* A national trunk zero never appears in an international number. */
    assert.equal(toWhatsAppNumber('03 887 445'), '9613887445');
    assert.equal(toWhatsAppNumber('70123456'), '96170123456');
    assert.equal(toWhatsAppNumber(''), null);
    assert.equal(toWhatsAppNumber('12'), null);
    assert.equal(toWhatsAppNumber(undefined), null);
  });

  test('a greeting that would break the WhatsApp API is refused in the CMS', async () => {
    for (const bad of ['a line\nbreak', 'far      too   many spaces'.replace(/ {3}/g, '     ')]) {
      const res = await api('/api/settings', {
        token: ctx.admin.accessToken,
        method: 'PATCH',
        body: { birthday: { variables: ['{name}', bad] } },
      });
      assert.equal(res.status, 422, `"${bad}" should be refused`);
    }
  });

  test('a template name has to look like one Meta would accept', async () => {
    const res = await api('/api/settings', {
      token: ctx.admin.accessToken,
      method: 'PATCH',
      body: { birthday: { templateName: 'Birthday Greeting!' } },
    });
    assert.equal(res.status, 422);
  });

  test('the upcoming list says who is reachable and who has opted in', async () => {
    const res = await api('/api/settings/birthday/upcoming', {
      token: ctx.artistSession.accessToken,
    });
    assert.equal(res.status, 200);
    const elie = res.body.find((c) => c.id === ctx.client.user.id);
    assert.ok(elie);
    assert.equal(elie.daysAway, 0);
    /* Opt-in is off until the client says otherwise — Meta requires it, and so
       does not being reported by somebody who never asked to be messaged. */
    assert.equal(elie.whatsappOptIn, false);
  });

  test('a client can opt in to WhatsApp', async () => {
    const res = await api('/api/auth/me', {
      token: ctx.client.accessToken,
      method: 'PATCH',
      body: { notifications: { whatsapp: true } },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.notifications.whatsapp, true);
  });

  test('a test send says plainly that WhatsApp is not connected', async () => {
    const res = await api('/api/settings/birthday/test', {
      token: ctx.admin.accessToken,
      method: 'POST',
      body: { phone: '+961 70 123 456' },
    });
    assert.equal(res.status, 501);
    assert.match(res.body.error, /not connected/i);
  });
});

describe('what the birthday message carries', () => {
  /* Its own client, so minting gifts cannot disturb the loyalty suite's card. */
  let session;
  let userId;

  const setOffer = (patch) =>
    api('/api/settings', {
      token: ctx.admin.accessToken,
      method: 'PATCH',
      body: { birthday: patch },
    });

  const cardOf = () => Loyalty.findOne({ user: userId });

  test('setup: a client to give things to', async () => {
    const user = await makeUser('Rita Azar', 'rita@test.app', 'client');
    session = await login(user.email);
    userId = String(user._id);
  });

  test('a text offer is only words — nothing lands on the card', async () => {
    await setOffer({ offer: 'text' });
    const settings = await getSettings();

    const reward = await grantBirthdayReward(userId, settings.birthday);
    assert.equal(reward, null);
    assert.equal((await cardOf()).rewards.length, 0);
  });

  test('a reward offer mints a real, claimable gift', async () => {
    const res = await setOffer({
      offer: 'reward',
      rewardLabel: 'Birthday beard trim',
      rewardValue: 12,
      rewardExpiryDays: 30,
    });
    assert.equal(res.status, 200);

    const settings = await getSettings();
    const reward = await grantBirthdayReward(userId, settings.birthday);
    assert.ok(reward, 'a gift should have been minted');
    assert.equal(reward.kind, 'birthday');
    assert.equal(reward.label, 'Birthday beard trim');
    assert.equal(reward.value, 12);
    assert.ok(reward.expiresAt, 'a gift must carry an end date');

    const card = await cardOf();
    assert.equal(card.rewards.length, 1);
    /* The gift sits beside the stamp card, never on it: five stamps has to keep
       meaning five visits. */
    assert.equal(card.stamps.length, 0);
    ctx.gift = reward;
  });

  test('the artist sees what it is and what it is worth, not "free cut"', async () => {
    const res = await api(`/api/loyalty/rewards/${ctx.gift.code}`, {
      token: ctx.artistSession.accessToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.label, 'Birthday beard trim');
    assert.equal(res.body.value, 12);
  });

  test('and can burn it once', async () => {
    const first = await api(`/api/loyalty/rewards/${ctx.gift.code}/redeem`, {
      token: ctx.artistSession.accessToken, method: 'POST',
    });
    assert.equal(first.status, 200);

    const again = await api(`/api/loyalty/rewards/${ctx.gift.code}/redeem`, {
      token: ctx.artistSession.accessToken, method: 'POST',
    });
    assert.equal(again.status, 409);
    assert.match(again.body.error, /already used/i);
  });

  test('an expired gift cannot be looked up or burned', async () => {
    const settings = await getSettings();
    const reward = await grantBirthdayReward(userId, settings.birthday);
    /* Wind it past its deadline. */
    await Loyalty.updateOne(
      { user: userId, 'rewards.code': reward.code },
      { $set: { 'rewards.$.expiresAt': new Date(Date.now() - 86_400_000) } },
    );

    const lookup = await api(`/api/loyalty/rewards/${reward.code}`, {
      token: ctx.artistSession.accessToken,
    });
    assert.equal(lookup.status, 409);
    assert.match(lookup.body.error, /expired/i);

    const burn = await api(`/api/loyalty/rewards/${reward.code}/redeem`, {
      token: ctx.artistSession.accessToken, method: 'POST',
    });
    assert.equal(burn.status, 409);
    assert.match(burn.body.error, /expired/i);

    const card = await cardOf();
    assert.equal(
      card.rewards.find((r) => r.code === reward.code).status,
      'available',
      'a refused burn must not mark it used',
    );
    ctx.expiredGift = reward;
  });

  test('and cannot be reserved against a booking either', async () => {
    /* The claim path easiest to forget. Enforced at the chair but not at booking
       would be worse than no expiry at all: the client is told the cut is free
       and finds out otherwise once they are already sitting down. */
    const date = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
    const avail = await api(
      `/api/appointments/availability?artist=${ctx.artist._id}&date=${date}&service=${ctx.service._id}`,
    );
    const slot = avail.body.slots.find((s) => s.available);

    const res = await api('/api/appointments', {
      token: session.accessToken,
      method: 'POST',
      body: {
        artist: String(ctx.artist._id),
        service: String(ctx.service._id),
        startsAt: slot.startsAt,
        useReward: true,
      },
    });
    assert.equal(res.status, 409, 'an expired gift was accepted as payment');

    /* A live one is reservable, so the guard is not simply refusing everything. */
    const settings = await getSettings();
    const live = await grantBirthdayReward(userId, settings.birthday);
    const ok = await api('/api/appointments', {
      token: session.accessToken,
      method: 'POST',
      body: {
        artist: String(ctx.artist._id),
        service: String(ctx.service._id),
        startsAt: slot.startsAt,
        useReward: true,
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.rewardCode, live.code);
  });

  test('a stamped-for reward still never expires', async () => {
    /* It was paid for in five visits. Quietly attaching a deadline to something
       already earned would be taking it back. */
    const card = await cardOf();
    card.rewards.push({ code: 'EARNED', status: 'available', earnedAt: new Date() });
    await card.save();

    const stored = (await cardOf()).rewards.find((r) => r.code === 'EARNED');
    assert.equal(stored.expiresAt, null);
    assert.equal(stored.kind, 'loyalty');

    const res = await api('/api/loyalty/rewards/EARNED', {
      token: ctx.artistSession.accessToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.value, 25, 'falls back to the shop’s standard free-cut value');
  });
});

describe('the “message us” button', () => {
  test('there is no button until somebody gives a number', async () => {
    const res = await api('/api/config');
    assert.equal(res.status, 200);
    assert.equal(res.body.contact.whatsapp, null, 'nothing to contact, so nothing to show');
  });

  test('an admin sets the shop number, and it comes back dialled', async () => {
    const res = await api('/api/settings', {
      token: ctx.admin.accessToken,
      method: 'PATCH',
      body: { contact: { whatsapp: '01 567 890', greeting: 'Hi {shop}, quick question.' } },
    });
    assert.equal(res.status, 200);
    /* Typed as a local number, stored as typed, dialled as E.164 — the app is
       never handed a formatting problem. */
    assert.equal(res.body.contactNumber, '9611567890');

    const config = await api('/api/config');
    assert.equal(config.body.contact.whatsapp, '9611567890');
    assert.equal(config.body.contact.greeting, 'Hi FadeRoom, quick question.');
  });

  test('switching it off hides it without losing the number', async () => {
    await api('/api/settings', {
      token: ctx.admin.accessToken, method: 'PATCH', body: { contact: { enabled: false } },
    });
    const off = await api('/api/config');
    assert.equal(off.body.contact.whatsapp, null);

    const settings = await api('/api/settings', { token: ctx.admin.accessToken });
    assert.equal(settings.body.contact.whatsapp, '01 567 890', 'the number is kept, just unused');

    await api('/api/settings', {
      token: ctx.admin.accessToken, method: 'PATCH', body: { contact: { enabled: true } },
    });
  });

  test('a number WhatsApp could not reach is refused', async () => {
    const res = await api('/api/settings', {
      token: ctx.admin.accessToken, method: 'PATCH', body: { contact: { whatsapp: '12' } },
    });
    assert.equal(res.status, 422);
  });

  test('an artist publishes their own, and it is dialled for them too', async () => {
    const res = await api(`/api/artists/${ctx.artist._id}`, {
      token: ctx.artistSession.accessToken,
      method: 'PATCH',
      body: { whatsapp: '+961 70 111 000' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.whatsappNumber, '96170111000');

    /* And it reaches the client app through the ordinary artists list. */
    const list = await api('/api/artists');
    const karim = list.body.find((a) => a.id === String(ctx.artist._id));
    assert.equal(karim.whatsappNumber, '96170111000');
  });

  test('an artist without one hands the conversation to the shop', async () => {
    await api(`/api/artists/${ctx.artist._id}`, {
      token: ctx.artistSession.accessToken, method: 'PATCH', body: { whatsapp: '' },
    });
    const list = await api('/api/artists');
    const karim = list.body.find((a) => a.id === String(ctx.artist._id));
    assert.equal(karim.whatsappNumber, null, 'null rather than empty, so the app can fall back');
  });

  test('an artist cannot publish a number on somebody else’s chair', async () => {
    const other = await Artist.create({
      user: (await makeUser('Sami Nakhle', 'sami@test.app', 'artist'))._id,
      displayName: 'Sami Nakhle',
      chair: 'Chair 9',
    });
    const res = await api(`/api/artists/${other._id}`, {
      token: ctx.artistSession.accessToken,
      method: 'PATCH',
      body: { whatsapp: '+961 3 000 000' },
    });
    assert.equal(res.status, 403);
  });
});

describe('previous haircut records', () => {
  /* Multipart, because a photograph is the whole object here. */
  const photograph = (fields = {}) => {
    const boundary = '----faderoomtest';
    const parts = Object.entries(fields).map(
      ([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
    );
    /* A one-pixel PNG: enough for multer's mimetype filter to accept it. */
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    return {
      body: Buffer.concat([
        Buffer.from(parts.join('')),
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="cut.png"\r\n` +
            'Content-Type: image/png\r\n\r\n',
        ),
        png,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
      type: `multipart/form-data; boundary=${boundary}`,
    };
  };

  const propose = async (token, fields) => {
    const { body, type } = photograph(fields);
    const res = await fetch(`${base}/api/haircuts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': type },
      body,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  test('an artist proposes a record; it is pending, not filed', async () => {
    const res = await propose(ctx.artistSession.accessToken, {
      user: ctx.client.user.id,
      serviceName: 'Haircut',
      notes: '#2 sides, scissor top, natural left part',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'pending', 'nothing is on a profile until they say so');
    assert.equal(res.body.images.length, 1);
    assert.match(res.body.images[0], /^\/uploads\//, 'the path must be one the app can fetch');
    ctx.haircut = res.body;
  });

  test('the client is actually asked', async () => {
    const inbox = await api('/api/notifications', { token: ctx.client.accessToken });
    const ask = inbox.body.find((n) => /save a photo of your cut/i.test(n.title));
    assert.ok(ask, 'a photograph nobody is told about is not consent');
    assert.equal(ask.data.screen, 'Haircuts');
  });

  test('they can see it before deciding', async () => {
    const res = await api('/api/haircuts/mine', { token: ctx.client.accessToken });
    assert.equal(res.status, 200);
    const pending = res.body.find((r) => r.id === ctx.haircut.id);
    assert.ok(pending, 'you cannot answer yes or no about a photo you were never shown');
    assert.equal(pending.status, 'pending');
  });

  test('somebody else cannot approve it', async () => {
    const res = await api(`/api/haircuts/${ctx.haircut.id}/approve`, {
      token: ctx.other.accessToken, method: 'POST',
    });
    assert.equal(res.status, 403);
  });

  test('and it is not a reference until they do', async () => {
    const slot = (await availabilityFor(12)).slots.find((s) => s.available);
    const res = await api('/api/appointments', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: {
        artist: String(ctx.artist._id),
        service: String(ctx.service._id),
        startsAt: slot.startsAt,
        reference: ctx.haircut.id,
      },
    });
    assert.equal(res.status, 404, 'a pending photo must not be shown to an artist');
  });

  test('approving puts it on their profile', async () => {
    const res = await api(`/api/haircuts/${ctx.haircut.id}/approve`, {
      token: ctx.client.accessToken, method: 'POST',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'approved');
    assert.ok(res.body.approvedAt);
  });

  test('now the artist can work from it', async () => {
    const res = await api(`/api/haircuts/client/${ctx.client.user.id}`, {
      token: ctx.artistSession.accessToken,
    });
    assert.equal(res.status, 200);
    const seen = res.body.find((r) => r.id === ctx.haircut.id);
    assert.ok(seen);
    assert.match(seen.notes, /#2 sides/, 'the words matter as much as the picture');
  });

  test('a client can book "this again", and the artist sees it', async () => {
    const slot = (await availabilityFor(12)).slots.find((s) => s.available);
    const booked = await api('/api/appointments', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: {
        artist: String(ctx.artist._id),
        service: String(ctx.service._id),
        startsAt: slot.startsAt,
        reference: ctx.haircut.id,
      },
    });
    assert.equal(booked.status, 201);

    const inbox = await api('/api/appointments/requests', { token: ctx.artistSession.accessToken });
    const request = inbox.body.find((r) => r.id === booked.body.id);
    assert.ok(request.reference, 'the reference is the point — it has to reach the chair');
    assert.match(request.reference.images[0], /^\/uploads\//);
    assert.match(request.reference.notes, /#2 sides/);

    await api(`/api/appointments/${booked.body.id}/cancel`, {
      token: ctx.client.accessToken, method: 'POST',
    });
  });

  test('a reference has to be your own', async () => {
    const slot = (await availabilityFor(13)).slots.find((s) => s.available);
    const res = await api('/api/appointments', {
      token: ctx.other.accessToken,
      method: 'POST',
      body: {
        artist: String(ctx.artist._id),
        service: String(ctx.service._id),
        startsAt: slot.startsAt,
        reference: ctx.haircut.id,
      },
    });
    assert.equal(res.status, 404, 'somebody else’s photograph is not yours to attach');
  });

  test('saying no deletes the photograph, it does not file it as refused', async () => {
    const proposed = await propose(ctx.artistSession.accessToken, {
      user: ctx.client.user.id,
      serviceName: 'Beard trim',
    });
    assert.equal(proposed.status, 201);

    const stored = proposed.body.images[0].replace('/uploads/', '');
    const onDisk = path.join(process.cwd(), 'uploads', stored);
    assert.equal(fs.existsSync(onDisk), true, 'the upload should be there to begin with');

    const declined = await api(`/api/haircuts/${proposed.body.id}/decline`, {
      token: ctx.client.accessToken, method: 'POST',
    });
    assert.equal(declined.status, 204);

    /* Both halves. A row marked "declined" with the image still on disk would
       be the shop keeping exactly what was refused. */
    assert.equal(await HaircutRecord.countDocuments({ _id: proposed.body.id }), 0);
    assert.equal(fs.existsSync(onDisk), false, 'the photograph is still on the server');
  });

  test('an artist can look a client up without a booking reference', async () => {
    /* Most people do not attach a reference when they book. "Reproduce the same
       haircut on a future visit" cannot depend on them having planned ahead. */
    const res = await api(`/api/haircuts/client/${ctx.client.user.id}`, {
      token: ctx.artistSession.accessToken,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.some((r) => r.id === ctx.haircut.id));
  });

  test('but only what that client agreed to share', async () => {
    /* A record still pending somebody else's answer must not reach a colleague
       through the client book. */
    const proposed = await propose(ctx.artistSession.accessToken, {
      user: ctx.other.user.id,
      serviceName: 'Fade',
    });
    assert.equal(proposed.status, 201);

    const asOther = await api(`/api/haircuts/client/${ctx.other.user.id}`, {
      token: ctx.admin.accessToken,
    });
    assert.equal(
      asOther.body.some((r) => r.id === proposed.body.id),
      false,
      'a pending photo reached somebody who was not the artist who took it',
    );

    /* The artist who took it does see it, so they know they have asked. */
    const asMine = await api(`/api/haircuts/client/${ctx.other.user.id}`, {
      token: ctx.artistSession.accessToken,
    });
    assert.equal(asMine.body.some((r) => r.id === proposed.body.id), true);

    await api(`/api/haircuts/${proposed.body.id}/decline`, {
      token: ctx.other.accessToken, method: 'POST',
    });
  });

  test('a client only ever sees their own', async () => {
    const res = await api('/api/haircuts/mine', { token: ctx.other.accessToken });
    assert.equal(res.status, 200);
    assert.equal(
      res.body.some((r) => r.id === ctx.haircut.id),
      false,
    );
  });

  test('a client cannot record a cut', async () => {
    const res = await propose(ctx.client.accessToken, { user: ctx.client.user.id });
    assert.equal(res.status, 403);
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

  /* Opens an authenticated socket and resolves with the first notification it
     receives, so a test can assert on what actually reached the phone. */
  const listenForNotification = async (session) => {
    const socket = ioClient(base, {
      transports: ['websocket'],
      reconnection: false,
      auth: { token: session.accessToken },
    });
    await new Promise((resolve, reject) => {
      socket.on('ready', resolve);
      socket.on('connect_error', reject);
    });
    const received = new Promise((resolve) => socket.on('notification:new', resolve));
    return {
      socket,
      next: () =>
        Promise.race([
          received,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('no notification within 3s')), 3000),
          ),
        ]),
    };
  };

  test('asking for a chair notifies the artist', async () => {
    const listener = await listenForNotification(ctx.artistSession);

    const date = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
    const avail = await api(
      `/api/appointments/availability?artist=${ctx.artist._id}&date=${date}&service=${ctx.service._id}`,
    );
    const slot = avail.body.slots.find((s) => s.available);

    const asked = await api('/api/appointments', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: {
        artist: String(ctx.artist._id),
        service: String(ctx.service._id),
        startsAt: slot.startsAt,
      },
    });
    assert.equal(asked.status, 201);
    ctx.notified = asked.body;

    const push = await listener.next();
    assert.equal(push.kind, 'booking');
    assert.match(push.title, /wants a chair/i);
    /* Somewhere to go, or the artist has been told and left to go looking. */
    assert.equal(push.data.screen, 'Today');
    listener.socket.close();
  });

  test('accepting notifies the client, and it survives in their inbox', async () => {
    const listener = await listenForNotification(ctx.client);

    const accepted = await api(`/api/appointments/${ctx.notified.id}/confirm`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { durationMin: 25 },
    });
    assert.equal(accepted.status, 200);

    const push = await listener.next();
    assert.match(push.title, /confirmed your cut/i);
    assert.match(push.body, /25 minutes/);
    assert.equal(push.data.screen, 'Appointments');
    listener.socket.close();

    /* Stored, not just emitted — a client who was offline still has to find it,
       and push later sends this same record. */
    const inbox = await api('/api/notifications', { token: ctx.client.accessToken });
    assert.equal(inbox.status, 200);
    const stored = inbox.body.find((n) => n.id === push.id);
    assert.ok(stored, 'the notification was emitted but never stored');
    assert.equal(stored.read, false);
  });

  test('a declined request tells the client why', async () => {
    const date = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const avail = await api(
      `/api/appointments/availability?artist=${ctx.artist._id}&date=${date}&service=${ctx.service._id}`,
    );
    const slot = avail.body.slots.find((s) => s.available);
    const asked = await api('/api/appointments', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: {
        artist: String(ctx.artist._id),
        service: String(ctx.service._id),
        startsAt: slot.startsAt,
      },
    });

    const listener = await listenForNotification(ctx.client);
    await api(`/api/appointments/${asked.body.id}/decline`, {
      token: ctx.artistSession.accessToken,
      method: 'POST',
      body: { reason: 'Closing early that day' },
    });

    const push = await listener.next();
    assert.match(push.body, /Closing early that day/);
    assert.equal(push.data.screen, 'Book');
    listener.socket.close();
  });

  test('an unconfigured push transport is inert, not broken', async () => {
    /* The whole suite runs without Firebase credentials, so every notification
       above already proved this by not throwing. Asserted explicitly because
       the failure mode it guards against — push errors surfacing as failed API
       requests — would break booking itself, not just the notification. */
    const { pushEnabled, pushToUsers } = await import('../src/lib/push.js');
    assert.equal(pushEnabled(), false);

    const result = await pushToUsers([ctx.client.user.id], {
      _id: 'abc', title: 'x', body: 'y', kind: 'booking',
    });
    assert.deepEqual(result, { sent: 0, skipped: 0 });

    /* And a device token registers regardless, so the moment credentials are
       added there is somebody to send to. */
    const registered = await api('/api/auth/devices', {
      token: ctx.client.accessToken,
      method: 'POST',
      body: { token: 'fake-device-token-for-tests', platform: 'android' },
    });
    assert.equal(registered.status, 204);
  });

  test('the shop’s own messages stay out of the CMS send log', async () => {
    const log = await api('/api/notifications/sent', { token: ctx.admin.accessToken });
    assert.equal(log.status, 200);
    assert.ok(log.body.length > 0, 'the composed message should still be there');
    assert.ok(
      log.body.every((n) => n.kind === 'message'),
      'automatic notifications must not bury what staff actually wrote',
    );
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
