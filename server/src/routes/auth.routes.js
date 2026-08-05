import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Artist } from '../models/Artist.js';
import { Loyalty } from '../models/Loyalty.js';
import { issueTokens, verifyRefreshToken, signAccessToken } from '../lib/tokens.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerBody = credentials.extend({
  name: z.string().min(2, 'Please enter your name'),
  phone: z.string().min(7, 'Enter a valid phone number').optional().or(z.literal('')),
});

/** Everything the app needs about the signed-in user, in one shape. */
async function sessionPayload(user) {
  const artist = user.role === 'artist' ? await Artist.findOne({ user: user._id }) : null;
  return { user: user.toJSON(), artist: artist ? artist.toJSON() : null };
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password, phone } = registerBody.parse(req.body);

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) throw new ApiError(409, 'That email already has an account');

    const user = new User({ name, email, phone: phone || '', role: 'client' });
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
    /* Same message either way — don't reveal which emails exist. */
    if (!user || !(await user.verifyPassword(password))) {
      throw new ApiError(401, 'Email or password is incorrect');
    }
    if (!user.active) throw new ApiError(403, 'This account has been disabled');

    res.json({ ...issueTokens(user), ...(await sessionPayload(user)) });
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
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        preferences: z
          .object({
            clipperGuard: z.string().optional(),
            beard: z.string().optional(),
            part: z.string().optional(),
            notes: z.string().optional(),
            preferredArtist: z.string().nullable().optional(),
          })
          .optional(),
      })
      .parse(req.body);

    if (body.name !== undefined) req.user.name = body.name;
    if (body.phone !== undefined) req.user.phone = body.phone;
    if (body.preferences) {
      req.user.preferences = { ...req.user.preferences.toObject(), ...body.preferences };
    }
    await req.user.save();

    res.json(await sessionPayload(req.user));
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({
        currentPassword: z.string().min(6),
        newPassword: z.string().min(6, 'Password must be at least 6 characters'),
      })
      .parse(req.body);

    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await user.verifyPassword(currentPassword))) {
      throw new ApiError(401, 'Current password is incorrect');
    }

    await user.setPassword(newPassword);
    user.tokenVersion += 1; /* sign every other device out */
    await user.save();

    res.json(issueTokens(user));
  }),
);

/** Registers an FCM/APNs device token for push. */
authRouter.post(
  '/devices',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { token, platform } = z
      .object({ token: z.string().min(10), platform: z.enum(['android', 'ios']) })
      .parse(req.body);

    const devices = req.user.devices.filter((d) => d.token !== token);
    devices.push({ token, platform, lastSeenAt: new Date() });
    req.user.devices = devices.slice(-5); /* keep the five most recent */
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
