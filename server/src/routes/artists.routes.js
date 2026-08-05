import { Router } from 'express';
import { z } from 'zod';
import { Artist } from '../models/Artist.js';
import { User } from '../models/User.js';
import { Service } from '../models/Service.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist } from '../middleware/auth.js';
import { emitTo, rooms } from '../lib/realtime.js';

export const artistsRouter = Router();

const artistBody = z.object({
  displayName: z.string().min(2, 'Give the artist a name'),
  specialty: z.string().optional(),
  bio: z.string().optional(),
  chair: z.string().optional(),
  priceFrom: z.coerce.number().min(0).optional(),
  daysOff: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  workingHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
      end: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
    })
    .optional(),
  active: z.coerce.boolean().optional(),
});

artistsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = req.query.all === 'true' ? {} : { active: true };
    const artists = await Artist.find(filter).populate('user', 'name email phone').sort({ createdAt: 1 });
    res.json(artists);
  }),
);

artistsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const artist = await Artist.findById(req.params.id).populate('user', 'name email phone');
    if (!artist) throw new ApiError(404, 'Artist not found');
    const services = await Service.find({
      active: true,
      $or: [{ artist: artist._id }, { artist: null }],
    });
    res.json({ ...artist.toJSON(), services });
  }),
);

/** Admin creates the artist and the login that goes with it, in one step. */
artistsRouter.post(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = artistBody
      .extend({
        email: z.string().email('Enter a valid email'),
        password: z.string().min(6, 'Password must be at least 6 characters'),
        phone: z.string().optional(),
      })
      .parse(req.body);

    if (await User.exists({ email: body.email.toLowerCase() })) {
      throw new ApiError(409, 'That email already has an account');
    }

    const user = new User({
      name: body.displayName,
      email: body.email,
      phone: body.phone || '',
      role: 'artist',
    });
    await user.setPassword(body.password);
    await user.save();

    const artist = await Artist.create({
      user: user._id,
      displayName: body.displayName,
      specialty: body.specialty || '',
      bio: body.bio || '',
      chair: body.chair || '',
      priceFrom: body.priceFrom ?? 20,
      daysOff: body.daysOff || [],
      workingHours: body.workingHours || { start: '10:00', end: '20:00' },
    });

    emitTo(rooms.staff(), 'artist:changed', artist.toJSON());
    res.status(201).json(artist);
  }),
);

artistsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    /* An artist can edit their own chair and nobody else's. */
    if (req.user.role === 'artist' && String(req.artist._id) !== req.params.id) {
      throw new ApiError(403, 'You can only edit your own profile');
    }

    const body = artistBody.partial().parse(req.body);
    const artist = await Artist.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!artist) throw new ApiError(404, 'Artist not found');

    emitTo(rooms.staff(), 'artist:changed', artist.toJSON());
    res.json(artist);
  }),
);

artistsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    /* Deactivate rather than delete — appointments and products point here. */
    const artist = await Artist.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!artist) throw new ApiError(404, 'Artist not found');
    await User.findByIdAndUpdate(artist.user, { active: false });

    emitTo(rooms.staff(), 'artist:changed', artist.toJSON());
    res.status(204).end();
  }),
);
