import { Router } from 'express';
import { z } from 'zod';
import { Appointment, HOLDS_SLOT } from '../models/Appointment.js';
import { Artist } from '../models/Artist.js';
import { Service } from '../models/Service.js';
import { Loyalty, notExpired, rewardIsLive } from '../models/Loyalty.js';
import { HaircutRecord } from '../models/HaircutRecord.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist } from '../middleware/auth.js';
import { emitTo, rooms } from '../lib/realtime.js';
import { notify, whenLabel, timeLabel } from '../lib/notify.js';
import { lapsedLeads } from '../lib/reminders.js';
import { env } from '../config/env.js';

export const appointmentsRouter = Router();

/* Fallback length when a client browses times without naming a service. The
   real rhythm of the day comes from the service duration plus the artist's own
   turnaround — see the walk in /availability. */
const SLOT_STEP_MIN = 45;

/* Bounds on the length an artist may set. Wide on purpose: a beard trim is a
   quarter of an hour and a full colour is most of an afternoon. */
const MIN_DURATION = 5;
const MAX_DURATION = 240;

const minutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const label = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOf = (appointment) =>
  new Date(appointment.startsAt.getTime() + appointment.durationMin * 60_000);

/**
 * A filter for everything on this chair that runs across [startsAt, endsAt),
 * widened by the artist's turnaround.
 *
 * `gapMs` is applied on *both* sides, because turnaround is needed whichever
 * way round the two bookings fall — five minutes to clear down after this cut,
 * and five minutes before the next one starts are the same five minutes.
 *
 * `statuses` defaults to the ones that hold the chair, so a pending request
 * never blocks anybody — including the person who made it. Pass
 * `statuses: ['pending']` to find the requests a decision has just made
 * impossible.
 */
function overlapping(
  artistId,
  startsAt,
  endsAt,
  { statuses = HOLDS_SLOT, exclude = null, gapMs = 0 } = {},
) {
  const filter = {
    artist: artistId,
    status: { $in: statuses },
    /* existing.start < newEnd + gap */
    startsAt: { $lt: new Date(endsAt.getTime() + gapMs) },
    /* existing.end + gap > newStart. The stored end is startsAt + durationMin,
       which only the database can work out per row — hence $expr. */
    $expr: {
      $gt: [
        { $add: ['$startsAt', { $multiply: ['$durationMin', 60_000] }, gapMs] },
        startsAt,
      ],
    },
  };
  if (exclude) filter._id = { $ne: exclude };
  return filter;
}

/** Do two bookings collide? The in-memory twin of `overlapping`, for slot maths. */
const collides = (booking, startsAt, endsAt, gapMs = 0) =>
  startsAt.getTime() < endOf(booking).getTime() + gapMs &&
  endsAt.getTime() + gapMs > booking.startsAt.getTime();

/**
 * Puts a held free cut back on the client's card and clears it off the booking.
 *
 * A reward must survive a booking that never happened, whichever side ended it
 * — the client withdrawing, or the artist turning the time down.
 */
async function releaseReward(appointment) {
  if (!appointment.rewardCode) return;
  await Loyalty.updateOne(
    {
      user: appointment.user,
      rewards: { $elemMatch: { code: appointment.rewardCode, status: 'reserved' } },
    },
    { $set: { 'rewards.$.status': 'available' } },
  );
  appointment.rewardCode = null;
  appointment.free = false;
}

/**
 * A booking as the chair should see it — with no sign that it is a free one.
 *
 * An artist who knows before they start that this cut earns nothing is being
 * handed a reason, however small and however unintended, to give it less than
 * the last one. The shop's promise is that a free cut is the same cut, and the
 * simplest way to keep that promise is for the person holding the clippers not
 * to know until it is over.
 *
 * They find out at the end, when the client shows the claim code and the artist
 * redeems it — by which point the work is done. Nothing is hidden from the
 * client, who chose it, or from the redemption record afterwards.
 */
export function forChair(appointment) {
  const json = typeof appointment.toJSON === 'function' ? appointment.toJSON() : { ...appointment };
  delete json.free;
  delete json.rewardCode;
  return json;
}

/**
 * Tell the client, the chair and every CMS seat at once.
 *
 * Two payloads, not one: the client's own booking says it is free because they
 * chose that, and the same object going to the artist's room would undo the
 * whole point of `forChair`.
 */
function announce(appointment, event = 'appointment:status') {
  const mine = appointment.toJSON();
  const theirs = forChair(appointment);
  /* Ids may already be populated documents depending on the caller. */
  const userId = appointment.user?._id ?? appointment.user;
  const artistId = appointment.artist?._id ?? appointment.artist;
  emitTo(rooms.user(userId), event, mine);
  emitTo(rooms.artist(artistId), event, theirs);
  emitTo(rooms.staff(), event, theirs);
}

/** Shared guard for the artist-side decisions. */
function loadForChair(appointment, req) {
  if (!appointment) throw new ApiError(404, 'Appointment not found');
  if (req.user.role === 'artist' && String(appointment.artist) !== String(req.artist._id)) {
    throw new ApiError(403, 'That booking is on another chair');
  }
  return appointment;
}

/**
 * Slots for one artist on one day.
 *
 * `available` means nothing confirmed stands in the way — a slot several people
 * have asked for is still available, because a request is not a hold. `requested`
 * says how many are already in the queue for it, so a client can see they are
 * competing before they ask rather than after.
 */
appointmentsRouter.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const { artist: artistId, date, service: serviceId } = z
      .object({
        artist: z.string(),
        date: z.string(),
        service: z.string().optional(),
      })
      .parse(req.query);

    const artist = await Artist.findById(artistId);
    if (!artist || !artist.active) throw new ApiError(404, 'Artist not found');

    const day = startOfDay(date);
    if (Number.isNaN(day.getTime())) throw new ApiError(400, 'Bad date');

    if (artist.daysOff.includes(day.getDay())) {
      return res.json({ dayOff: true, artist: artist.displayName, slots: [] });
    }

    const service = serviceId ? await Service.findById(serviceId) : null;
    const duration = service?.durationMin ?? SLOT_STEP_MIN;

    const dayEnd = new Date(day.getTime() + 86_400_000);
    const onTheDay = await Appointment.find({
      artist: artist._id,
      status: { $in: [...HOLDS_SLOT, 'pending'] },
      startsAt: { $gte: day, $lt: dayEnd },
    });
    const held = onTheDay.filter((a) => HOLDS_SLOT.includes(a.status));
    const asked = onTheDay.filter((a) => a.status === 'pending');

    const open = minutes(artist.workingHours.start);
    const close = minutes(artist.workingHours.end);
    const now = Date.now();
    const gap = artist.gapMin ?? 0;
    const gapMs = gap * 60_000;

    /**
     * Walk the day rather than stamping a fixed grid on it.
     *
     * Times run one cut plus one turnaround apart — a 15-minute service with a
     * 5-minute gap gives 10:00, 10:20, 10:40 — so what is offered is what the
     * artist can actually work, not a tidy division of the clock.
     *
     * When a slot is blocked, the walk resumes from the end of whatever blocked
     * it rather than carrying on from the old rhythm. Otherwise one booking that
     * does not sit on the grid throws off the entire rest of the day, and times
     * the chair is genuinely free never get offered.
     */
    const slots = [];
    let t = open;
    /* The walk always moves forward, but belt and braces against a pathological
       clash set making it stand still. */
    for (let guard = 0; t + duration <= close && guard < 300; guard += 1) {
      const startsAt = new Date(day.getTime() + t * 60_000);
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);

      const blocking = held.find((a) => collides(a, startsAt, endsAt, gapMs));
      slots.push({
        time: label(t),
        startsAt,
        available: !blocking && startsAt.getTime() > now,
        /* Requests are counted without the gap: this is "who else asked for
           this time", not "what would be in the way if they got it". */
        requested: asked.filter((a) => collides(a, startsAt, endsAt)).length,
      });

      if (blocking) {
        const resumesAt = endOf(blocking).getTime() + gapMs;
        const resumesMin = Math.ceil((resumesAt - day.getTime()) / 60_000);
        t = Math.max(t + 1, resumesMin);
      } else {
        t += duration + gap;
      }
    }

    return res.json({
      dayOff: false,
      artist: artist.displayName,
      durationMin: duration,
      gapMin: gap,
      slots,
    });
  }),
);

appointmentsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const appointments = await Appointment.find({ user: req.user._id })
      .populate('artist', 'displayName chair specialty rating')
      /* A client who chose "this again" should be able to see that it stuck.
         A choice you make and can never see afterwards is one you end up
         making twice. */
      .populate('reference', 'images notes serviceName takenAt')
      .sort({ startsAt: -1 })
      .limit(50);
    res.json(appointments);
  }),
);

/**
 * Ask for a time. This creates a *request*, not a booking.
 *
 * Nothing is held until the artist accepts, which is what stops one client
 * taking the whole week out of circulation, and what lets the artist choose
 * between two people who both want five o'clock.
 */
appointmentsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        artist: z.string(),
        service: z.string(),
        startsAt: z.string(),
        notes: z.string().optional(),
        useReward: z.boolean().optional(),
        /* A past cut of their own, chosen as "this again". */
        reference: z.string().optional(),
      })
      .parse(req.body);

    const [artist, service] = await Promise.all([
      Artist.findById(body.artist),
      Service.findById(body.service),
    ]);
    if (!artist || !artist.active) throw new ApiError(404, 'Artist not found');
    if (!service || !service.active) throw new ApiError(404, 'Service not found');

    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new ApiError(400, 'Bad start time');
    if (startsAt.getTime() < Date.now()) throw new ApiError(400, 'That time is in the past');
    if (artist.daysOff.includes(startsAt.getDay())) {
      throw new ApiError(409, `${artist.displayName.split(' ')[0]} is off that day`);
    }

    const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);

    /* Only a confirmed booking closes a time off. Another client's request for
       the same slot is not an obstacle — that is the point of the queue. The
       artist's turnaround counts as booked too: the chair is not free the
       instant the clippers stop. */
    const taken = await Appointment.findOne(
      overlapping(artist._id, startsAt, endsAt, { gapMs: (artist.gapMin ?? 0) * 60_000 }),
    );
    if (taken) throw new ApiError(409, 'That time is booked — pick another');

    /* Asking twice for the same time is never intentional, and it would put the
       artist in front of a choice between a client and themselves. */
    const duplicate = await Appointment.findOne({
      user: req.user._id,
      artist: artist._id,
      startsAt,
      status: 'pending',
    });
    if (duplicate) throw new ApiError(409, 'You have already asked for that time');

    /* A request costs nothing to make, so the number that can be open at once
       is capped. Without it, the thing a holding request used to prevent —
       one client papering the whole week — just moves into the inbox. */
    const openRequests = await Appointment.countDocuments({
      user: req.user._id,
      status: 'pending',
      startsAt: { $gte: new Date() },
    });
    if (openRequests >= env.maxOpenRequests) {
      throw new ApiError(
        429,
        `You already have ${openRequests} requests waiting — hear back on one before asking for another`,
      );
    }

    /* Reserve, never redeem: the artist still has to confirm the free cut in
       person, so a booking can hold a reward but cannot spend it. Reserved last,
       so a request that gets turned away above never ties one up. */
    let rewardCode = null;
    if (body.useReward) {
      /* Choose which reward first, then claim that exact one.
       *
       * Reserving with `$elemMatch: { status: 'available' }` and then reading
       * back "the first reserved one" looks equivalent and is not: a client who
       * already has a reward reserved against another booking gets *that* code
       * handed to this booking, and cancelling either one releases a reward the
       * other still depends on. Naming the code in the guard also keeps the step
       * atomic — two devices booking at once, one wins, the other is told.
       *
       * Soonest-expiring first, so a birthday gift with a deadline is used
       * before a stamped-for cut that never lapses. Spending the perishable one
       * first is simply what a person would do with two vouchers. */
      const card = await Loyalty.findOne({ user: req.user._id });
      const usable = (card?.rewards ?? [])
        .filter((r) => r.status === 'available' && rewardIsLive(r))
        .sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity));

      if (!usable.length) throw new ApiError(409, 'You have no reward available');

      /* A lapsed gift must not be reservable. This is the third place a reward
         can be claimed and the easiest to forget — an expiry enforced at the
         chair but bypassed at booking is worse than none, because the client is
         told the cut is free and finds out otherwise once they are sitting down. */
      const claimed = await Loyalty.findOneAndUpdate(
        {
          user: req.user._id,
          rewards: { $elemMatch: { code: usable[0].code, status: 'available', $or: notExpired() } },
        },
        { $set: { 'rewards.$.status': 'reserved' } },
      );
      if (!claimed) throw new ApiError(409, 'That reward was just used — try again');
      rewardCode = usable[0].code;
    }

    /* Their own, and approved. A reference is shown to an artist, so pointing a
       booking at somebody else's record — or at one still pending its owner's
       answer — would be a way to publish a photograph past its consent. */
    let reference = null;
    if (body.reference) {
      const record = await HaircutRecord.findOne({
        _id: body.reference,
        user: req.user._id,
        status: 'approved',
      });
      if (!record) throw new ApiError(404, 'That haircut is not one you can use as a reference');
      reference = record._id;
    }

    const appointment = await Appointment.create({
      user: req.user._id,
      artist: artist._id,
      service: service._id,
      serviceName: service.name,
      reference,
      startsAt,
      /* Kept as asked, so a booking the artist moves can say so. */
      requestedStartsAt: startsAt,
      /* The catalogue's estimate, until the artist sets the real length. */
      durationMin: service.durationMin,
      price: service.price,
      notes: body.notes || '',
      free: Boolean(rewardCode),
      rewardCode,
      status: 'pending',
    });

    const payload = await appointment.populate('artist', 'displayName chair');
    emitTo(rooms.artist(artist._id), 'appointment:created', forChair(payload));
    emitTo(rooms.staff(), 'appointment:created', forChair(payload));

    /* The inbox is where the artist's day now starts, so a request landing in it
       has to reach them rather than wait to be found. */
    /**
     * The reference goes into the notification, not just onto the record.
     *
     * "They want this again" is a picture, and an artist deciding how long to
     * give a booking wants to have seen it — a notification that made them open
     * the app to find out what was attached has told them only that something
     * was. The photograph rides along, and the body says so for anywhere an
     * image cannot be drawn.
     */
    const wanted = reference
      ? await HaircutRecord.findById(reference).select('images serviceName')
      : null;

    await notify(artist.user, {
      title: `${req.user.name.split(' ')[0]} wants a chair`,
      body:
        `${service.name} · ${whenLabel(startsAt)}. ` +
        (wanted ? 'They’ve picked a past cut to match. ' : '') +
        'Accept it to set the time and how long to give it.',
      kind: 'booking',
      data: { screen: 'Today' },
      actor: req.user,
      image: wanted?.images?.[0] ?? '',
    });

    res.status(201).json(payload);
  }),
);

appointmentsRouter.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) throw new ApiError(404, 'Appointment not found');

    const isStaff = ['artist', 'admin'].includes(req.user.role);
    if (!isStaff && String(appointment.user) !== String(req.user._id)) {
      throw new ApiError(403, 'Not your appointment');
    }
    if (['completed', 'cancelled', 'declined'].includes(appointment.status)) {
      throw new ApiError(409, `That booking is already ${appointment.status}`);
    }

    const wasConfirmed = appointment.status === 'confirmed';
    const heldReward = Boolean(appointment.rewardCode);

    /* Withdrawing puts a held free cut straight back in the client's card —
       a reward must never be lost to a cancellation. */
    await releaseReward(appointment);

    appointment.status = 'cancelled';
    await appointment.save();

    /* Whoever did not do it is the one who needs telling. */
    const chair = await Artist.findById(appointment.artist).select('user displayName');
    if (isStaff) {
      /* The shop calling off a chair somebody was promised is the single
         message a client most needs to receive, and the one they are least
         likely to be holding the app open for. */
      await notify(appointment.user, {
        title: `${chair?.displayName.split(' ')[0] ?? 'Your artist'} had to cancel`,
        body:
          `${appointment.serviceName} · ${whenLabel(appointment.startsAt)} is off` +
          `${heldReward ? '. Your free cut is back in your card' : ''}. Book another time.`,
        kind: 'booking',
        data: { screen: 'Book' },
        actor: req.user,
      });
    } else {
      /* A client dropping out frees the chair, which the artist can only act on
         if they hear about it. */
      await notify(chair?.user, {
        title: wasConfirmed
          ? `${req.user.name.split(' ')[0]} cancelled`
          : `${req.user.name.split(' ')[0]} withdrew their request`,
        body: `${appointment.serviceName} · ${whenLabel(appointment.startsAt)}. That time is free again.`,
        kind: 'booking',
        data: { screen: 'Today' },
        actor: req.user,
      });
    }

    announce(appointment);
    /* Staff cancelling somebody else's booking must not learn from the reply
       what the board is careful not to show them. */
    res.json(isStaff ? forChair(appointment) : appointment.toJSON());
  }),
);

/* ---------------- artist chair ---------------- */

/**
 * The requests waiting on an answer. Separate from the agenda because they are
 * a different job: the agenda is the day as it stands, this is the decisions
 * still to make, and they may be spread across the week.
 */
appointmentsRouter.get(
  '/requests',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const filter = { status: 'pending', startsAt: { $gte: new Date() } };
    if (req.user.role === 'artist') filter.artist = req.artist._id;
    else if (req.query.artist) filter.artist = req.query.artist;

    const requests = await Appointment.find(filter)
      .populate('user', 'name phone preferences dateOfBirth visitFrequencyWeeks')
      .populate('artist', 'displayName chair')
      /* "This again" — the picture is worth more than the service name when
         deciding how long to give the cut. */
      .populate('reference', 'images notes serviceName takenAt')
      .sort({ startsAt: 1 })
      .limit(60);

    res.json(requests.map(forChair));
  }),
);

/** The artist's day, used by the CMS schedule board and the portal. */
appointmentsRouter.get(
  '/agenda',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const day = startOfDay(req.query.date || new Date());
    const filter = {
      startsAt: { $gte: day, $lt: new Date(day.getTime() + 86_400_000) },
      status: { $nin: ['cancelled', 'declined'] },
    };
    if (req.user.role === 'artist') filter.artist = req.artist._id;
    else if (req.query.artist) filter.artist = req.query.artist;

    const agenda = await Appointment.find(filter)
      .populate('user', 'name phone preferences dateOfBirth visitFrequencyWeeks')
      .populate('artist', 'displayName chair')
      /* At the chair, this is the thing being worked from. */
      .populate('reference', 'images notes serviceName takenAt')
      .sort({ startsAt: 1 });

    res.json(agenda.map(forChair));
  }),
);

/**
 * Accept a request: when it starts, and how long it runs.
 *
 * This is the moment the chair is actually reserved, and both halves of the
 * booking are the artist's to set. The length, because "hair and beard" is
 * twenty-five minutes for one client and forty for another and only the person
 * holding the clippers knows which. The start, because the answer to "can you
 * do five?" is so often "not five, but I can do quarter to six" — and making
 * that a decline the client has to re-ask for loses the appointment.
 *
 * Accepting also closes out everybody else who asked for that time. Leaving
 * them pending would be a promise nobody can keep — the client waits on an
 * answer that can never come, and the artist keeps looking at requests they
 * cannot fulfil.
 */
appointmentsRouter.post(
  '/:id/confirm',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        durationMin: z.coerce
          .number()
          .int()
          .min(MIN_DURATION, `Give it at least ${MIN_DURATION} minutes`)
          .max(MAX_DURATION, `That is longer than ${MAX_DURATION / 60} hours`)
          .optional(),
        startsAt: z.string().optional(),
      })
      .parse(req.body);

    const appointment = loadForChair(await Appointment.findById(req.params.id), req);
    if (appointment.status !== 'pending') {
      throw new ApiError(409, `That booking is already ${appointment.status}`);
    }

    const length = body.durationMin ?? appointment.durationMin;

    /* Moving it is optional; leaving it alone keeps the time the client asked
       for. The artist's own days off are not checked here — unlike a client
       picking from the board, an artist naming a time has chosen it. */
    const originalStart = appointment.startsAt;
    let startsAt = originalStart;
    if (body.startsAt) {
      const moved = new Date(body.startsAt);
      if (Number.isNaN(moved.getTime())) throw new ApiError(400, 'Bad start time');
      if (moved.getTime() < Date.now()) throw new ApiError(400, 'That time has already passed');
      startsAt = moved;
    }

    const endsAt = new Date(startsAt.getTime() + length * 60_000);

    const chair = await Artist.findById(appointment.artist).select('displayName user gapMin');
    const gapMs = (chair?.gapMin ?? 0) * 60_000;

    /* Nothing was held while this sat in the inbox, so the chair has to be
       checked now — against the length the artist just chose, which may run
       further than the catalogue's estimate did, and against their own
       turnaround either side of it. */
    const clash = await Appointment.findOne(
      overlapping(appointment.artist, startsAt, endsAt, { exclude: appointment._id, gapMs }),
    );
    if (clash) {
      throw new ApiError(
        409,
        `${length} minutes leaves no room before your ${clash.serviceName} at ` +
          `${timeLabel(clash.startsAt)} — give it less time or move one of them`,
      );
    }

    const moved = startsAt.getTime() !== originalStart.getTime();

    appointment.startsAt = startsAt;
    appointment.durationMin = length;
    appointment.status = 'confirmed';
    appointment.respondedAt = new Date();
    /* Reminders whose moment has already gone are written off now, so a cut
       accepted an hour beforehand is never announced as being "tomorrow". */
    appointment.remindersSent = lapsedLeads(startsAt);
    await appointment.save();

    /* This is the message the request flow exists to deliver. A client who asked
       for a time and heard nothing has been given a worse experience than one
       who was simply refused, so it goes out before anything else. */
    const firstName = chair?.displayName.split(' ')[0] ?? 'Your artist';
    await notify(appointment.user, {
      title: `${firstName} confirmed your cut`,
      body: moved
        ? `Moved to ${whenLabel(startsAt)} · ${length} minutes. You asked for ${whenLabel(originalStart)}.`
        : `${whenLabel(startsAt)} · ${length} minutes in the chair.`,
      kind: 'booking',
      data: { screen: 'Appointments' },
      actor: req.user,
    });

    /* Everyone else who wanted *this* window — the one just taken, not the one
       originally asked for. Move a booking out of five o'clock and the requests
       sitting at five o'clock are back in play rather than collateral. */
    const superseded = await Appointment.find(
      overlapping(appointment.artist, startsAt, endsAt, {
        statuses: ['pending'],
        exclude: appointment._id,
        /* Including the turnaround: a request that now leaves no room to clear
           down is just as unfulfillable as one that overlaps outright. */
        gapMs,
      }),
    );
    for (const other of superseded) {
      /* Read before releasing — releaseReward clears the flag it is asking about. */
      const heldReward = Boolean(other.rewardCode);
      await releaseReward(other);
      other.status = 'declined';
      other.respondedAt = new Date();
      other.declineReason = 'That time was given to someone else';
      await other.save();
      announce(other);
      /* Being quietly dropped is the worst outcome of a queue, so the people
         who did not get the slot are told as plainly as the one who did. */
      await notify(other.user, {
        title: `${firstName} couldn’t take that time`,
        body:
          `${whenLabel(other.startsAt)} went to someone else` +
          `${heldReward ? '. Your free cut is back in your card' : ''}. Pick another time.`,
        kind: 'booking',
        data: { screen: 'Book' },
        actor: req.user,
      });
    }

    announce(appointment);

    res.json({ appointment: forChair(appointment), declined: superseded.length });
  }),
);

/** Turn a request down. The slot was never held, so nothing but the reward moves. */
appointmentsRouter.post(
  '/:id/decline',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const { reason } = z
      .object({ reason: z.string().max(140).optional() })
      .parse(req.body ?? {});

    const appointment = loadForChair(await Appointment.findById(req.params.id), req);
    if (appointment.status !== 'pending') {
      throw new ApiError(409, `That booking is already ${appointment.status}`);
    }

    /* Read before releasing — releaseReward clears the flag it is asking about. */
    const heldReward = Boolean(appointment.rewardCode);
    await releaseReward(appointment);
    appointment.status = 'declined';
    appointment.respondedAt = new Date();
    appointment.declineReason = reason || '';
    await appointment.save();

    const chair = await Artist.findById(appointment.artist).select('displayName');
    const firstName = chair?.displayName.split(' ')[0] ?? 'Your artist';
    await notify(appointment.user, {
      title: `${firstName} couldn’t take that time`,
      body:
        (reason || `${whenLabel(appointment.startsAt)} isn’t free`) +
        `${heldReward ? '. Your free cut is back in your card' : ''}. Pick another time.`,
      kind: 'booking',
      data: { screen: 'Book' },
      actor: req.user,
    });

    announce(appointment);
    res.json(forChair(appointment));
  }),
);

/** Close a booking out once the client has been in the chair — or hasn't. */
appointmentsRouter.post(
  '/:id/status',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['completed', 'noshow']) })
      .parse(req.body);

    const appointment = loadForChair(await Appointment.findById(req.params.id), req);
    /* A request is not a booking — accept it first, so the length that gets
       recorded against the day is one the artist actually chose. */
    if (appointment.status !== 'confirmed') {
      throw new ApiError(
        409,
        appointment.status === 'pending'
          ? 'Accept the request before closing it out'
          : `That booking is already ${appointment.status}`,
      );
    }

    appointment.status = status;
    await appointment.save();

    announce(appointment);
    res.json(forChair(appointment));
  }),
);
