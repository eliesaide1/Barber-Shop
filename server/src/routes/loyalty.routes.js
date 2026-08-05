import { Router } from 'express';
import { z } from 'zod';
import { Loyalty } from '../models/Loyalty.js';
import { Artist } from '../models/Artist.js';
import { CheckIn } from '../models/CheckIn.js';
import { User } from '../models/User.js';
import { Appointment } from '../models/Appointment.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist } from '../middleware/auth.js';
import {
  checkinToken,
  checkinSignature,
  checkinWindow,
  checkinExpiresIn,
  verifyCheckin,
  rewardCode,
  readCode,
} from '../lib/codes.js';
import { emitTo, rooms } from '../lib/realtime.js';
import { env } from '../config/env.js';

export const loyaltyRouter = Router();

const cardFor = async (userId) => {
  const card = await Loyalty.findOne({ user: userId });
  return card || Loyalty.create({ user: userId });
};

const cardJson = (card) => ({
  stamps: card.stamps.length,
  goal: env.loyaltyGoal,
  totalCheckIns: card.totalCheckIns,
  lastCheckInAt: card.lastCheckInAt,
  history: card.stamps,
  rewards: card.rewards,
  freeCutValue: env.freeCutValue,
});

/* ---------------- client ---------------- */

loyaltyRouter.get(
  '/card',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(cardJson(await cardFor(req.user._id)));
  }),
);

/**
 * Redeem a scanned (or typed) check-in code for a stamp.
 * The heart of the programme — everything that keeps it honest lives here.
 */
loyaltyRouter.post(
  '/check-in',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(4) }).parse(req.body);

    /* Only active artists can hand out stamps. */
    const artists = await Artist.find({ active: true }).select('_id displayName');
    const verdict = verifyCheckin(
      code,
      artists.map((a) => String(a._id)),
    );
    if (!verdict.ok) throw new ApiError(400, verdict.reason);

    const artist = artists.find((a) => String(a._id) === String(verdict.artistId));
    if (!artist) throw new ApiError(400, 'That chair is not taking check-ins');

    const card = await cardFor(req.user._id);

    /* One stamp per visit. A valid code scanned five times in a row is still
       one visit — this is what stops a client farming the card at the chair. */
    const since = card.lastCheckInAt ? Date.now() - card.lastCheckInAt.getTime() : Infinity;
    if (since < env.checkinCooldownMs) {
      const mins = Math.ceil((env.checkinCooldownMs - since) / 60_000);
      throw new ApiError(429, `Already checked in for this visit — try again in ${mins} min`);
    }

    card.stamps.push({ at: new Date(), artist: artist._id });
    card.totalCheckIns += 1;
    card.lastCheckInAt = new Date();

    let reward = null;
    if (card.stamps.length >= env.loyaltyGoal) {
      card.stamps = []; /* card starts over at zero */
      reward = { code: rewardCode(req.user._id), earnedAt: new Date(), status: 'available' };
      card.rewards.push(reward);
    }
    await card.save();

    const events = [
      await CheckIn.create({
        user: req.user._id,
        userName: req.user.name,
        artist: artist._id,
        kind: 'stamp',
        stampNumber: reward ? env.loyaltyGoal : card.stamps.length,
      }),
    ];
    if (reward) {
      events.push(
        await CheckIn.create({
          user: req.user._id,
          userName: req.user.name,
          artist: artist._id,
          kind: 'earned',
          code: reward.code,
        }),
      );
    }

    /* The artist's portal and the CMS see this land live. */
    for (const event of events) {
      emitTo(rooms.artist(artist._id), 'checkin:new', event.toJSON());
      emitTo(rooms.staff(), 'checkin:new', event.toJSON());
    }
    emitTo(rooms.user(req.user._id), 'loyalty:updated', cardJson(card));

    res.json({
      stamps: reward ? 0 : card.stamps.length,
      goal: env.loyaltyGoal,
      artist: { id: artist._id, displayName: artist.displayName },
      reward,
      card: cardJson(card),
    });
  }),
);

/* ---------------- artist ---------------- */

/** The rotating QR the artist shows at the chair. */
loyaltyRouter.get(
  '/check-in-token',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    /* An artist always gets their own chair. An admin has no chair of their
       own, so they must name one — and it has to be a real, active chair,
       otherwise a token could be minted for an arbitrary id. */
    let artistId = req.artist?._id;
    if (!artistId) {
      if (!req.query.artist) throw new ApiError(400, 'Pick which chair the code is for');
      const target = await Artist.findOne({ _id: req.query.artist, active: true });
      if (!target) throw new ApiError(404, 'That chair is not taking check-ins');
      artistId = target._id;
    }

    const window = checkinWindow();
    res.json({
      token: checkinToken(artistId, window),
      code: checkinSignature(artistId, window),
      expiresInMs: checkinExpiresIn(),
      windowMs: env.checkinWindowMs,
    });
  }),
);

/** Live feed of stamps and redemptions for the CMS. */
loyaltyRouter.get(
  '/check-ins',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const filter = req.user.role === 'artist' ? { artist: req.artist._id } : {};
    const feed = await CheckIn.find(filter).sort({ at: -1 }).limit(60);
    res.json(feed);
  }),
);

/** Look a free cut up before burning it. */
loyaltyRouter.get(
  '/rewards/:code',
  requireAuth,
  requireRole('artist', 'admin'),
  asyncHandler(async (req, res) => {
    const code = readCode(req.params.code, 'R');
    const card = await Loyalty.findOne({ 'rewards.code': code }).populate('user', 'name email');
    if (!card) throw new ApiError(404, 'No free cut matches that code');

    const reward = card.rewards.find((r) => r.code === code);
    if (reward.status === 'redeemed') throw new ApiError(409, 'That free cut was already used');

    res.json({
      reward,
      client: { id: card.user._id, name: card.user.name },
      value: env.freeCutValue,
    });
  }),
);

/**
 * Burn a free cut. Artist-only by design: the client's app can display a claim
 * code but has no route that marks one used, so a client can never redeem
 * their own reward.
 */
loyaltyRouter.post(
  '/rewards/:code/redeem',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const code = readCode(req.params.code, 'R');

    /* Matching on status inside the query makes the burn idempotent: a double
       tap finds nothing the second time instead of redeeming twice. */
    const card = await Loyalty.findOneAndUpdate(
      { rewards: { $elemMatch: { code, status: { $ne: 'redeemed' } } } },
      {
        $set: {
          'rewards.$.status': 'redeemed',
          'rewards.$.redeemedAt': new Date(),
          'rewards.$.redeemedBy': req.artist?._id ?? null,
        },
      },
      { new: true },
    ).populate('user', 'name');

    if (!card) {
      const exists = await Loyalty.exists({ 'rewards.code': code });
      throw exists
        ? new ApiError(409, 'That free cut was already used')
        : new ApiError(404, 'No free cut matches that code');
    }

    /* Release the booking it was held against. */
    await Appointment.updateMany({ rewardCode: code }, { $set: { free: false, rewardCode: null } });

    const event = await CheckIn.create({
      user: card.user._id,
      userName: card.user.name,
      artist: req.artist?._id ?? null,
      kind: 'redeemed',
      code,
    });

    emitTo(rooms.staff(), 'checkin:new', event.toJSON());
    emitTo(rooms.user(card.user._id), 'loyalty:updated', cardJson(card));

    res.json({ ok: true, code, client: card.user.name, value: env.freeCutValue });
  }),
);

/** Per-client loyalty state, for the artist's client book. */
loyaltyRouter.get(
  '/clients',
  requireAuth,
  requireRole('artist', 'admin'),
  asyncHandler(async (req, res) => {
    const cards = await Loyalty.find().populate('user', 'name email phone').sort({ updatedAt: -1 }).limit(100);
    res.json(
      cards
        .filter((c) => c.user)
        .map((c) => ({
          user: c.user,
          stamps: c.stamps.length,
          goal: env.loyaltyGoal,
          totalCheckIns: c.totalCheckIns,
          lastCheckInAt: c.lastCheckInAt,
          owedRewards: c.rewards.filter((r) => r.status !== 'redeemed').length,
        })),
    );
  }),
);
