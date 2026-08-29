import { Router } from 'express';
import { z } from 'zod';
import { Loyalty, notExpired, rewardIsLive } from '../models/Loyalty.js';
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
import { pricesVisibleTo } from '../lib/prices.js';
import { notify } from '../lib/notify.js';
import { rewardLabel, rewardValue, dateLabel } from '../lib/rewards.js';
import { getSettings } from '../models/ShopSettings.js';
import { env } from '../config/env.js';

export const loyaltyRouter = Router();

const cardFor = async (userId) => {
  const card = await Loyalty.findOne({ user: userId });
  return card || Loyalty.create({ user: userId });
};

/**
 * `showPrices` false drops what the free cut is worth, and the value on each
 * reward — a shop that publishes no prices should not publish this one either,
 * and it is the same number a haircut costs.
 */
const cardJson = (card, loyalty, showPrices = true) => ({
  stamps: card.stamps.length,
  goal: loyalty.goal,
  totalCheckIns: card.totalCheckIns,
  lastCheckInAt: card.lastCheckInAt,
  history: card.stamps,
  rewards: showPrices
    ? card.rewards
    : card.rewards.map((r) => {
        const { value, ...rest } = r.toJSON ? r.toJSON() : r;
        return rest;
      }),
  ...(showPrices ? { freeCutValue: loyalty.freeCutValue } : {}),
});

/* ---------------- client ---------------- */

loyaltyRouter.get(
  '/card',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { loyalty } = await getSettings();
    res.json(cardJson(await cardFor(req.user._id), loyalty, await pricesVisibleTo(req.user)));
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

    /* The goal is the shop's setting, not the deployment's — an owner moving
       from every fifth cut to every eighth should not need a redeploy. */
    const { loyalty } = await getSettings();
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
    if (card.stamps.length >= loyalty.goal) {
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
        stampNumber: reward ? loyalty.goal : card.stamps.length,
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
    const showPrices = await pricesVisibleTo(null);
    emitTo(rooms.user(req.user._id), 'loyalty:updated', cardJson(card, loyalty, showPrices));

    /* The stamp itself says nothing — the client watched it land. Earning the
       free cut is worth a notification, because the claim code is a thing they
       will want to find again later. */
    if (reward) {
      await notify(req.user._id, {
        title: 'Your next cut is free 🎁',
        body: `${loyalty.goal} visits done. Claim code ${reward.code} — show it at the chair.`,
        kind: 'loyalty',
        data: { screen: 'Loyalty' },
      });
    }

    res.json({
      stamps: reward ? 0 : card.stamps.length,
      goal: loyalty.goal,
      artist: { id: artist._id, displayName: artist.displayName },
      reward,
      card: cardJson(card, loyalty, showPrices),
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
    if (reward.status === 'redeemed') {
      throw new ApiError(409, `That ${rewardLabel(reward)} was already used`);
    }
    /* A gift the shop put an end date on. Checked here as well as at the burn so
       an artist is told before they promise the client anything. */
    if (!rewardIsLive(reward)) {
      throw new ApiError(409, `That ${rewardLabel(reward)} expired on ${dateLabel(reward.expiresAt)}`);
    }

    res.json({
      reward,
      client: { id: card.user._id, name: card.user.name },
      value: rewardValue(reward),
      label: rewardLabel(reward),
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
    /* The expiry lives inside the guard rather than in a check before it. A
       separate read-then-write would let a reward lapse between the two, and
       would put the shop's one enforcement point outside the atomic step that
       actually decides whether it is spent. */
    const card = await Loyalty.findOneAndUpdate(
      {
        rewards: {
          $elemMatch: { code, status: { $ne: 'redeemed' }, $or: notExpired() },
        },
      },
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
      /* Say which of the three it was — already used, out of date, or never
         existed. "That did not work" sends an artist back to the client with
         nothing to tell them. */
      const owner = await Loyalty.findOne({ 'rewards.code': code });
      if (!owner) throw new ApiError(404, 'No reward matches that code');
      const reward = owner.rewards.find((r) => r.code === code);
      throw reward.status === 'redeemed'
        ? new ApiError(409, `That ${rewardLabel(reward)} was already used`)
        : new ApiError(409, `That ${rewardLabel(reward)} expired on ${dateLabel(reward.expiresAt)}`);
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
    const { loyalty } = await getSettings();
    emitTo(
      rooms.user(card.user._id),
      'loyalty:updated',
      cardJson(card, loyalty, await pricesVisibleTo(null)),
    );

    /* The reward's own worth when it has one — a birthday gift need not be the
       price of a standard cut. */
    res.json({
      ok: true,
      code,
      client: card.user.name,
      value: card.rewards.find((r) => r.code === code)?.value ?? loyalty.freeCutValue,
    });
  }),
);

/** Per-client loyalty state, for the artist's client book. */
loyaltyRouter.get(
  '/clients',
  requireAuth,
  requireRole('artist', 'admin'),
  asyncHandler(async (req, res) => {
    const cards = await Loyalty.find()
      .populate('user', 'name email phone dateOfBirth visitFrequencyWeeks')
      .sort({ updatedAt: -1 })
      .limit(100);

    const { loyalty } = await getSettings();
    const now = Date.now();
    res.json(
      cards
        .filter((c) => c.user)
        .map((c) => {
          /* The point of asking how often somebody cuts: knowing when they are
             overdue. A client who normally comes every three weeks and has not
             been seen in seven has not changed their habit — they have gone
             somewhere else, and that is worth noticing while it is still
             recoverable. Left null when either half is unknown rather than
             guessed at. */
          const weeks = c.user.visitFrequencyWeeks;
          const dueAt =
            weeks && c.lastCheckInAt
              ? new Date(c.lastCheckInAt.getTime() + weeks * 7 * 86_400_000)
              : null;

          return {
            user: c.user,
            stamps: c.stamps.length,
            goal: loyalty.goal,
            totalCheckIns: c.totalCheckIns,
            lastCheckInAt: c.lastCheckInAt,
            dueAt,
            overdue: Boolean(dueAt && dueAt.getTime() < now),
            /* Live only. A lapsed gift is not owed to anybody, and counting it
               sends an artist to look for a code the chair will refuse. */
            owedRewards: c.rewards.filter((r) => rewardIsLive(r)).length,
          };
        }),
    );
  }),
);
