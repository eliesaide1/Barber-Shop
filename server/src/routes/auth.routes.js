import { Router } from 'express';
import { z } from 'zod';
import { User, VISIT_FREQUENCIES } from '../models/User.js';
import { Artist } from '../models/Artist.js';
import { Loyalty } from '../models/Loyalty.js';
import { Appointment } from '../models/Appointment.js';
import { CheckIn } from '../models/CheckIn.js';
import { HaircutRecord } from '../models/HaircutRecord.js';
import { Order } from '../models/Order.js';
import { Notification } from '../models/Notification.js';
import { Style } from '../models/Style.js';
import { issueTokens, verifyRefreshToken, signAccessToken } from '../lib/tokens.js';
import { verificationRequired, verificationChannel, verifiedFrom } from './verification.routes.js';
import { toWhatsAppNumber } from '../lib/whatsapp.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { providerConfigured, verifyIdentityToken } from '../lib/social.js';
import { env } from '../config/env.js';

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

/**
 * A birth date, as a calendar date.
 *
 * Checked for being a real day as well as well-formed — `2025-02-30` matches the
 * pattern and is not a date. Re-serialising the parsed date and comparing is the
 * cheapest way to catch that, because JS rolls overflow into the next month
 * rather than refusing it.
 */
const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'That is not a real date')
  .refine((v) => new Date(`${v}T00:00:00Z`) <= new Date(), 'A birthday cannot be in the future')
  .refine(
    (v) => new Date(`${v}T00:00:00Z`) > new Date(Date.now() - 120 * 365.25 * 86_400_000),
    'Please check the year',
  );

const visitFrequencyWeeks = z
  .coerce.number()
  .int()
  .refine((n) => VISIT_FREQUENCIES.includes(n), 'Pick how often you usually get cut');

const phone = z
  .string()
  .refine((v) => v.replace(/\D/g, '').length >= 7, 'Enter a valid phone number');

/* The client record the shop needs: who they are, how to reach them, and how
   often they sit down. Required at sign-up rather than nagged for later — an
   optional field on an intake form is a field nobody fills in. */
const registerBody = credentials.extend({
  name: z.string().min(2, 'Please enter your name'),
  phone,
  dateOfBirth,
  visitFrequencyWeeks,
  /* Proof that the number answered, from /auth/verify/check. Optional in the
     shape because a shop with verification switched off never issues one; the
     route below is what decides whether its absence is allowed. */
  verificationToken: z.string().optional(),
});

/**
 * Whether the shop has everything it asks a client for.
 *
 * Always true for an account made through the sign-up form, which refuses to
 * create one otherwise. False after a first Google or Apple sign-in: neither
 * provider knows a date of birth or a mobile number, and neither ever will.
 */
const profileComplete = (user) =>
  user.role !== 'client' ||
  Boolean(user.phone && user.dateOfBirth && user.visitFrequencyWeeks);

/** Everything the app needs about the signed-in user, in one shape. */
async function sessionPayload(user) {
  const artist = user.role === 'artist' ? await Artist.findOne({ user: user._id }) : null;
  return {
    user: user.toJSON(),
    artist: artist ? artist.toJSON() : null,
    profileComplete: profileComplete(user),
  };
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerBody.parse(req.body);

    /* Checked before anything is written. The whole point is that an unproven
       number does not get an account, so this cannot be a step somebody skips
       by calling the API directly — which is exactly what an app-side check
       alone would allow. */
    if (await verificationRequired()) {
      const channel = await verificationChannel();
      const field = channel === 'email' ? 'email' : 'phone';
      const proven = verifiedFrom(body.verificationToken);

      if (!proven) {
        throw new ApiError(
          422,
          channel === 'email' ? 'Verify your email first' : 'Verify your mobile number first',
          { fields: { [field]: 'Not verified yet' } },
        );
      }
      /* The proof names one thing, and it has to be *this* thing — otherwise
         one verified address would mint accounts on any address at all. The
         channel is checked too: a proof issued while the shop verified by
         WhatsApp must not be spent against an email once it switched. */
      const submitted =
        channel === 'email' ? body.email.trim().toLowerCase() : toWhatsAppNumber(body.phone);

      if (proven.channel !== channel || proven.target !== submitted) {
        throw new ApiError(
          422,
          channel === 'email'
            ? 'That is not the email you verified'
            : 'That is not the number you verified',
          { fields: { [field]: 'Verify this one' } },
        );
      }
    }

    const existing = await User.findOne({ email: body.email.toLowerCase() });
    if (existing) throw new ApiError(409, 'That email already has an account');

    const { email, password } = body;
    const user = new User({
      name: body.name,
      email,
      phone: body.phone,
      dateOfBirth: body.dateOfBirth,
      visitFrequencyWeeks: body.visitFrequencyWeeks,
      role: 'client',
    });
    await user.setPassword(password);
    await user.save();

    /* Every client gets a loyalty card the moment they sign up. */
    await Loyalty.create({ user: user._id });

    res.status(201).json({ ...issueTokens(user), ...(await sessionPayload(user)) });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = credentials.parse(req.body);

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

    /* An account that only ever signed in with Google or Apple has no password
       to be wrong. Saying so is not an information leak — they gave us this
       email and we are telling them which door it opens — and the alternative
       is somebody typing guesses at a password that was never set. */
    if (user && !user.passwordHash && user.identities.length) {
      const via = user.identities.map((i) => (i.provider === 'google' ? 'Google' : 'Apple'));
      throw new ApiError(409, `This account signs in with ${[...new Set(via)].join(' or ')}`);
    }

    /* Same message either way — don't reveal which emails exist. */
    if (!user?.passwordHash || !(await user.verifyPassword(password))) {
      throw new ApiError(401, 'Email or password is incorrect');
    }
    if (!user.active) throw new ApiError(403, 'This account has been disabled');

    res.json({ ...issueTokens(user), ...(await sessionPayload(user)) });
  }),
);

/**
 * Sign in with Google or Apple.
 *
 * The provider answers one question — is this really them — and the shop's own
 * account system takes it from there. Three outcomes, in order:
 *
 *  1. We have seen this provider account before → sign them in.
 *  2. We have not, but their **verified** email matches an existing account →
 *     link it, so somebody who signed up with a password in March and taps
 *     "Continue with Google" in June keeps their loyalty card rather than
 *     starting a second one beside it.
 *  3. Neither → make an account.
 *
 * A verified email is not a formality. Matching on an unverified one would let
 * anyone who can mint a token claiming `elie@…` walk into Elie's account, so a
 * provider that will not vouch for the address is refused outright.
 */
authRouter.post(
  '/social',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        provider: z.enum(['google', 'apple']),
        idToken: z.string().min(20, 'That sign-in did not complete'),
        /* Apple hands over the name at the very first authorisation and never
           again, so the app has to pass it on that one occasion. */
        name: z.string().min(2).optional(),
      })
      .parse(req.body);

    const identity = await verifyIdentityToken(body.provider, body.idToken);

    const known = await User.findOne({
      'identities.provider': identity.provider,
      'identities.subject': identity.subject,
    });
    if (known) {
      if (!known.active) throw new ApiError(403, 'This account has been disabled');

      /* Keep the provider's current address on the link, but never touch the
         account's own email: that is what a password sign-in is looked up by,
         and it is subject to a unique index. Following a Google address change
         could lock somebody out of their password, or collide with somebody
         else's account and fail the save. */
      const link = known.identities.find(
        (i) => i.provider === identity.provider && i.subject === identity.subject,
      );
      if (link && identity.email && link.email !== identity.email) {
        link.email = identity.email;
        await known.save();
      }

      return res.json({ ...issueTokens(known), ...(await sessionPayload(known)) });
    }

    if (!identity.email || !identity.emailVerified) {
      throw new ApiError(
        401,
        `${identity.provider === 'google' ? 'Google' : 'Apple'} did not confirm an email address for that account`,
      );
    }

    const existing = await User.findOne({ email: identity.email });
    if (existing) {
      if (!existing.active) throw new ApiError(403, 'This account has been disabled');
      existing.identities.push({
        provider: identity.provider,
        subject: identity.subject,
        email: identity.email,
      });
      await existing.save();
      return res.json({ ...issueTokens(existing), ...(await sessionPayload(existing)) });
    }

    /* Always a client. A provider sign-in must never be able to mint a chair or
       an admin seat — staff accounts are made by an admin, deliberately. */
    const user = new User({
      name: body.name?.trim() || identity.name || identity.email.split('@')[0],
      email: identity.email,
      role: 'client',
      identities: [
        { provider: identity.provider, subject: identity.subject, email: identity.email },
      ],
    });
    await user.save();
    await Loyalty.create({ user: user._id });

    /* 201, and `profileComplete: false` in the payload: the account exists but
       the shop's client card does not, because no provider knows a birthday or
       a mobile number. The app takes them straight to finish it. */
    return res.status(201).json({ ...issueTokens(user), ...(await sessionPayload(user)) });
  }),
);

/**
 * Which sign-in methods this deployment actually offers.
 *
 * The app asks before drawing the buttons, so one build serves a shop that has
 * set Google up and one that has not — and a client id never has to be edited
 * into the source. It is not a secret: the same value ships inside every copy
 * of the app already.
 */
authRouter.get('/providers', (_req, res) =>
  res.json({
    google: { enabled: providerConfigured('google'), webClientId: env.googleWebClientId },
    apple: { enabled: providerConfigured('apple') },
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(req.body);

    let claims;
    try {
      claims = verifyRefreshToken(refreshToken);
    } catch {
      throw new ApiError(401, 'Please sign in again');
    }

    const user = await User.findById(claims.sub);
    /* tokenVersion is bumped by logout-all and password changes, which
       retires every refresh token issued before it. */
    if (!user || !user.active || user.tokenVersion !== claims.v) {
      throw new ApiError(401, 'Please sign in again');
    }

    res.json({ accessToken: signAccessToken(user) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await sessionPayload(req.user));
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2, 'Please enter your name').optional(),
        phone: phone.optional(),
        /* Same rules as sign-up, so a record cannot be edited into a state it
           could never have been created in. */
        dateOfBirth: dateOfBirth.optional(),
        visitFrequencyWeeks: visitFrequencyWeeks.optional(),
        preferences: z
          .object({
            clipperGuard: z.string().optional(),
            beard: z.string().optional(),
            part: z.string().optional(),
            notes: z.string().optional(),
            preferredArtist: z.string().nullable().optional(),
          })
          .optional(),
        /* Only broadcasts can be silenced. There is deliberately no switch for
           the message telling you your booking was confirmed. */
        notifications: z
          .object({ broadcasts: z.boolean().optional(), whatsapp: z.boolean().optional() })
          .optional(),
      })
      .parse(req.body);

    if (body.name !== undefined) req.user.name = body.name;
    if (body.phone !== undefined) req.user.phone = body.phone;
    if (body.dateOfBirth !== undefined) req.user.dateOfBirth = body.dateOfBirth;
    if (body.visitFrequencyWeeks !== undefined) {
      req.user.visitFrequencyWeeks = body.visitFrequencyWeeks;
    }
    if (body.preferences) {
      req.user.preferences = { ...req.user.preferences.toObject(), ...body.preferences };
    }
    if (body.notifications) {
      req.user.notifications = { ...req.user.notifications, ...body.notifications };
    }
    await req.user.save();

    res.json(await sessionPayload(req.user));
  }),
);

/**
 * Close an account, at the account holder's own request.
 *
 * Everything keyed to the person goes with them. Leaving the rows behind would
 * not be a lighter touch — an appointment or an order still pointing at a user
 * that no longer exists renders as a blank name in the back office, and the
 * loyalty card would survive a deletion it was supposed to be part of.
 *
 * Staff cannot close their own account here. An artist owns a chair, bookings
 * other people are relying on, and products on the shelf; deciding what happens
 * to those is the shop's call, not a button in the client app.
 */
authRouter.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'client') {
      throw new ApiError(403, 'Ask the shop to close a staff account.');
    }

    const id = req.user._id;

    await Promise.all([
      Appointment.deleteMany({ user: id }),
      CheckIn.deleteMany({ user: id }),
      HaircutRecord.deleteMany({ user: id }),
      Order.deleteMany({ user: id }),
      Loyalty.deleteMany({ user: id }),
      /* Addressed to them, so it has no meaning without them. Broadcasts are
         untouched — they were sent to everyone. */
      Notification.deleteMany({ targetUser: id }),
      /* ...but a broadcast still remembers who read it, and a saved style still
         remembers who saved it. Those are references to drop, not documents. */
      Notification.updateMany({ readBy: id }, { $pull: { readBy: id } }),
      Style.updateMany({ savedBy: id }, { $pull: { savedBy: id } }),
    ]);

    await req.user.deleteOne();

    res.status(204).end();
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({
        /* Optional, because an account that has only ever used Google or Apple
           has no current password to prove. Setting a first one is how somebody
           stops depending on a provider they may lose access to. */
        currentPassword: z.string().min(6).optional(),
        newPassword: z.string().min(6, 'Password must be at least 6 characters'),
      })
      .parse(req.body);

    const user = await User.findById(req.user._id).select('+passwordHash');

    if (user.passwordHash) {
      if (!currentPassword) throw new ApiError(422, 'Enter your current password');
      if (!(await user.verifyPassword(currentPassword))) {
        throw new ApiError(401, 'Current password is incorrect');
      }
    }

    await user.setPassword(newPassword);
    user.tokenVersion += 1; /* sign every other device out */
    await user.save();

    res.json(issueTokens(user));
  }),
);

/**
 * Records this install — its push address, and what it is running.
 *
 * Called on sign-in and whenever the app comes back to the foreground, so the
 * version the shop sees is the version in somebody's hand rather than the one
 * they installed months ago.
 *
 * Everything but the platform is optional. An older build sends only a token
 * and must keep working; a device that declined notifications sends everything
 * except one, and is still worth recording.
 */
authRouter.post(
  '/devices',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        deviceId: z.string().min(1).max(200).optional(),
        token: z.string().min(10).optional(),
        platform: z.enum(['android', 'ios']),
        appVersion: z.string().max(40).optional(),
        buildNumber: z.string().max(40).optional(),
        osVersion: z.string().max(40).optional(),
        model: z.string().max(120).optional(),
      })
      /* One of the two has to identify the row, or every call would append a
         new device and the list would be five copies of the same phone. */
      .refine((b) => b.deviceId || b.token, {
        message: 'Send a deviceId or a token',
      })
      .parse(req.body);

    /* Matched on deviceId first: a token rotates, the install does not. Falling
       back to the token is what lets a row written by an older build — which
       had no deviceId to send — be recognised and upgraded in place rather than
       left behind as a duplicate. */
    const isSame = (d) =>
      body.deviceId && d.deviceId
        ? d.deviceId === body.deviceId
        : Boolean(body.token) && d.token === body.token;

    const existing = req.user.devices.find(isSame);
    const rest = req.user.devices.filter((d) => !isSame(d));

    /* Merged, not replaced. A foreground ping carrying no token must not wipe
       the push address this device already registered. */
    const merged = {
      deviceId: body.deviceId || existing?.deviceId || '',
      token: body.token || existing?.token || '',
      platform: body.platform,
      appVersion: body.appVersion || existing?.appVersion || '',
      buildNumber: body.buildNumber || existing?.buildNumber || '',
      osVersion: body.osVersion || existing?.osVersion || '',
      model: body.model || existing?.model || '',
      lastSeenAt: new Date(),
    };

    req.user.devices = [...rest, merged].slice(-5); /* keep the five most recent */
    await req.user.save();

    res.status(204).end();
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    req.user.tokenVersion += 1;
    await req.user.save();
    res.status(204).end();
  }),
);
