import { Router } from 'express';
import { z } from 'zod';
import { Appointment } from '../models/Appointment.js';
import { Artist } from '../models/Artist.js';
import { CheckIn } from '../models/CheckIn.js';
import { HaircutRecord } from '../models/HaircutRecord.js';
import { Loyalty } from '../models/Loyalty.js';
import { Notification } from '../models/Notification.js';
import { Product } from '../models/Product.js';
import { Service } from '../models/Service.js';
import { Style } from '../models/Style.js';
import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist } from '../middleware/auth.js';
import { broadcast, emitTo, rooms } from '../lib/realtime.js';
import { toWhatsAppNumber } from '../lib/whatsapp.js';

export const artistsRouter = Router();

const artistBody = z.object({
  displayName: z.string().min(2, 'Give the artist a name'),
  specialty: z.string().optional(),
  bio: z.string().optional(),
  chair: z.string().optional(),
  /* Empty is meaningful — it hands contact back to the shop's own number. */
  whatsapp: z
    .string()
    .max(30)
    .refine(
      (v) => v.trim() === '' || toWhatsAppNumber(v) !== null,
      'That does not look like a number WhatsApp can reach',
    )
    .optional(),
  priceFrom: z.coerce.number().min(0).optional(),
  /* Turnaround between clients. Zero is allowed — some artists genuinely do
     run back-to-back — but an hour is the sane ceiling. */
  gapMin: z.coerce.number().int().min(0, 'Cannot be negative').max(60, 'An hour is the most').optional(),
  daysOff: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  workingHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
      end: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
    })
    .optional(),
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
    broadcast('artists:changed', { id: artist.id });
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
    broadcast('artists:changed', { id: artist.id });
    res.json(artist);
  }),
);

/**
 * The way back in from deactivate.
 *
 * Both records flip together, exactly as they flipped going out: the chair
 * starts taking bookings again and the login it belongs to starts working
 * again. Reactivating one without the other leaves an artist who appears in
 * the app and cannot sign in to answer anybody.
 */
artistsRouter.post(
  '/:id/activate',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const artist = await Artist.findByIdAndUpdate(req.params.id, { active: true }, { new: true });
    if (!artist) throw new ApiError(404, 'Artist not found');
    await User.findByIdAndUpdate(artist.user, { active: true });

    emitTo(rooms.staff(), 'artist:changed', artist.toJSON());
    broadcast('artists:changed', { id: artist.id });
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
    /* A deactivated chair has to leave the booking screen of anyone standing
       on it, not wait until they navigate away and back. */
    broadcast('artists:changed', { id: artist.id });
    res.status(204).end();
  }),
);

/**
 * What stands between this artist and the bin, phrased so a sentence can be
 * built out of it.
 *
 * Each of these is a record that would stop making sense if the chair it names
 * stopped existing — a booking by nobody, a loyalty card stamped by nobody.
 * Counting them is cheap and the answer is worth saying out loud: an admin who
 * is told "still has 14 bookings" knows what to do, where a flat refusal just
 * reads as the button being broken.
 */
async function deletionBlockers(artistId) {
  const [appointments, haircuts, checkIns, cards, products] = await Promise.all([
    Appointment.countDocuments({ artist: artistId }),
    HaircutRecord.countDocuments({ artist: artistId }),
    CheckIn.countDocuments({ artist: artistId }),
    Loyalty.countDocuments({
      $or: [{ artist: artistId }, { 'stamps.artist': artistId }, { 'rewards.redeemedBy': artistId }],
    }),
    Product.countDocuments({ owner: artistId }),
  ]);

  return [
    [appointments, 'booking', 'bookings'],
    [haircuts, 'haircut record', 'haircut records'],
    [checkIns, 'loyalty check-in', 'loyalty check-ins'],
    [cards, 'loyalty card', 'loyalty cards'],
    [products, 'product on the shelf', 'products on the shelf'],
  ]
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
}

/** "a, b and c" — read aloud, not comma-spliced. */
function listSentence(parts) {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The real delete, for the chair that should never have existed.
 *
 * Deactivate covers the artist who left: the shop keeps their history and the
 * app stops offering them. This covers the other case — the duplicate, the
 * typo, the trial account — where there is no history to keep and leaving an
 * INACTIVE card on the screen forever is just litter.
 *
 * Which case it is isn't a judgement call, it's a count: anything pointing at
 * this artist and we refuse and say what. What does go with them is only what
 * described them alone — their own services, their lookbook, the announcements
 * addressed to their clients — plus any client who had them starred.
 */
artistsRouter.delete(
  '/:id/permanent',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const artist = await Artist.findById(req.params.id);
    if (!artist) throw new ApiError(404, 'Artist not found');

    const blockers = await deletionBlockers(artist._id);
    if (blockers.length) {
      throw new ApiError(
        409,
        `${artist.displayName} still has ${listSentence(blockers)} on record, ` +
          'and deleting the chair would leave those describing nobody. ' +
          'Deactivate instead — that stops the bookings and keeps the history.',
      );
    }

    await Promise.all([
      Service.deleteMany({ artist: artist._id }),
      Style.deleteMany({ artist: artist._id }),
      Notification.deleteMany({ audience: 'artist-clients', targetArtist: artist._id }),
      User.updateMany(
        { 'preferences.preferredArtist': artist._id },
        { $set: { 'preferences.preferredArtist': null } },
      ),
    ]);

    await Artist.deleteOne({ _id: artist._id });
    /* The login goes with the chair; there is nothing left for it to open. */
    await User.deleteOne({ _id: artist.user });

    emitTo(rooms.staff(), 'artist:removed', { id: artist.id });
    broadcast('artists:changed', { id: artist.id });
    res.status(204).end();
  }),
);
