import { Router } from 'express';
import { z } from 'zod';
import { Appointment } from '../models/Appointment.js';
import { Artist } from '../models/Artist.js';
import { Service } from '../models/Service.js';
import { Loyalty } from '../models/Loyalty.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist } from '../middleware/auth.js';
import { emitTo, rooms } from '../lib/realtime.js';

export const appointmentsRouter = Router();

const SLOT_STEP_MIN = 45;

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

/** Slots for one artist on one day, with the taken ones marked. */
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
    const booked = await Appointment.find({
      artist: artist._id,
      status: { $in: ['pending', 'confirmed'] },
      startsAt: { $gte: day, $lt: dayEnd },
    });

    const open = minutes(artist.workingHours.start);
    const close = minutes(artist.workingHours.end);
    const now = Date.now();

    const slots = [];
    for (let t = open; t + duration <= close; t += SLOT_STEP_MIN) {
      const startsAt = new Date(day.getTime() + t * 60_000);
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);

      const clash = booked.some((a) => {
        const aStart = a.startsAt.getTime();
        const aEnd = aStart + a.durationMin * 60_000;
        return startsAt.getTime() < aEnd && endsAt.getTime() > aStart;
      });

      slots.push({
        time: label(t),
        startsAt,
        available: !clash && startsAt.getTime() > now,
      });
    }

    return res.json({ dayOff: false, artist: artist.displayName, durationMin: duration, slots });
  }),
);

appointmentsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const appointments = await Appointment.find({ user: req.user._id })
      .populate('artist', 'displayName chair specialty rating')
      .sort({ startsAt: -1 })
      .limit(50);
    res.json(appointments);
  }),
);

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

    /* Two clients racing for the same slot: whoever writes first wins, and the
       loser gets a clear error rather than a double booking. */
    const clash = await Appointment.findOne({
      artist: artist._id,
      status: { $in: ['pending', 'confirmed'] },
      startsAt: { $lt: endsAt },
      $expr: {
        $gt: [{ $add: ['$startsAt', { $multiply: ['$durationMin', 60_000] }] }, startsAt],
      },
    });
    if (clash) throw new ApiError(409, 'That slot was just taken — pick another time');

    /* Reserve, never redeem: the artist still has to confirm the free cut in
       person, so a booking can hold a reward but cannot spend it. */
    let rewardCode = null;
    if (body.useReward) {
      const card = await Loyalty.findOneAndUpdate(
        { user: req.user._id, rewards: { $elemMatch: { status: 'available' } } },
        { $set: { 'rewards.$.status': 'reserved' } },
        { new: true },
      );
      rewardCode = card?.rewards.find((r) => r.status === 'reserved')?.code ?? null;
      if (!rewardCode) throw new ApiError(409, 'You have no free cut available');
    }

    const appointment = await Appointment.create({
      user: req.user._id,
      artist: artist._id,
      service: service._id,
      serviceName: service.name,
      startsAt,
      durationMin: service.durationMin,
      price: service.price,
      notes: body.notes || '',
      free: Boolean(rewardCode),
      rewardCode,
      status: 'confirmed',
    });

    const payload = await appointment.populate('artist', 'displayName chair');
    emitTo(rooms.artist(artist._id), 'appointment:created', payload.toJSON());
    emitTo(rooms.staff(), 'appointment:created', payload.toJSON());

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
    if (['completed', 'cancelled'].includes(appointment.status)) {
      throw new ApiError(409, `That booking is already ${appointment.status}`);
    }

    /* Cancelling puts a held free cut straight back in the client's card —
       a reward must never be lost to a cancellation. */
    if (appointment.rewardCode) {
      await Loyalty.updateOne(
        { user: appointment.user, rewards: { $elemMatch: { code: appointment.rewardCode, status: 'reserved' } } },
        { $set: { 'rewards.$.status': 'available' } },
      );
      appointment.rewardCode = null;
      appointment.free = false;
    }

    appointment.status = 'cancelled';
    await appointment.save();

    emitTo(rooms.user(appointment.user), 'appointment:status', appointment.toJSON());
    emitTo(rooms.artist(appointment.artist), 'appointment:status', appointment.toJSON());
    emitTo(rooms.staff(), 'appointment:status', appointment.toJSON());

    res.json(appointment);
  }),
);

/* ---------------- artist chair ---------------- */

/** The artist's day, used by the CMS schedule board. */
appointmentsRouter.get(
  '/agenda',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const day = startOfDay(req.query.date || new Date());
    const filter = {
      startsAt: { $gte: day, $lt: new Date(day.getTime() + 86_400_000) },
      status: { $ne: 'cancelled' },
    };
    if (req.user.role === 'artist') filter.artist = req.artist._id;
    else if (req.query.artist) filter.artist = req.query.artist;

    const agenda = await Appointment.find(filter)
      .populate('user', 'name phone preferences')
      .populate('artist', 'displayName chair')
      .sort({ startsAt: 1 });

    res.json(agenda);
  }),
);

appointmentsRouter.post(
  '/:id/status',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['pending', 'confirmed', 'completed', 'noshow']) })
      .parse(req.body);

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) throw new ApiError(404, 'Appointment not found');
    if (req.user.role === 'artist' && String(appointment.artist) !== String(req.artist._id)) {
      throw new ApiError(403, 'That booking is on another chair');
    }

    appointment.status = status;
    await appointment.save();

    emitTo(rooms.user(appointment.user), 'appointment:status', appointment.toJSON());
    emitTo(rooms.staff(), 'appointment:status', appointment.toJSON());

    res.json(appointment);
  }),
);
