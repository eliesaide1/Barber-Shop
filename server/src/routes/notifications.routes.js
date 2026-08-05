import { Router } from 'express';
import { z } from 'zod';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { Appointment } from '../models/Appointment.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist } from '../middleware/auth.js';
import { upload, withImageUrls } from '../lib/upload.js';
import { emitTo, emitToRooms, rooms, connectedCount } from '../lib/realtime.js';

export const notificationsRouter = Router();

/** Which socket rooms a notification should land in. */
async function resolveTargets(notification) {
  switch (notification.audience) {
    case 'all':
      return [rooms.role('client'), rooms.role('artist'), rooms.role('admin')];
    case 'clients':
      return [rooms.role('client')];
    case 'artists':
      return [rooms.role('artist')];
    case 'user':
      return [rooms.user(notification.targetUser)];
    case 'artist-clients': {
      /* Everyone who has ever sat in this artist's chair. */
      const userIds = await Appointment.distinct('user', { artist: notification.targetArtist });
      return userIds.map((id) => rooms.user(id));
    }
    default:
      return [];
  }
}

/** Whether a stored notification was aimed at this user. */
function matchesUser(notification, user, artistClientIds) {
  switch (notification.audience) {
    case 'all':
      return true;
    case 'clients':
      return user.role === 'client';
    case 'artists':
      return user.role === 'artist';
    case 'user':
      return String(notification.targetUser) === String(user._id);
    case 'artist-clients':
      return artistClientIds.has(String(notification._id));
    default:
      return false;
  }
}

/* ---------------- inbox ---------------- */

notificationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    /* Which artist-scoped broadcasts reached this user. */
    const artistIds = await Appointment.distinct('artist', { user: req.user._id });
    const scoped = await Notification.find({
      audience: 'artist-clients',
      targetArtist: { $in: artistIds },
    }).select('_id');
    const scopedIds = new Set(scoped.map((n) => String(n._id)));

    const candidates = await Notification.find({
      $or: [
        { audience: 'all' },
        { audience: req.user.role === 'client' ? 'clients' : 'artists' },
        { audience: 'user', targetUser: req.user._id },
        { audience: 'artist-clients', targetArtist: { $in: artistIds } },
      ],
    })
      .sort({ sentAt: -1 })
      .limit(60);

    res.json(
      candidates
        .filter((n) => matchesUser(n, req.user, scopedIds))
        .map((n) => ({
          ...withImageUrls(n),
          read: n.readBy.some((id) => String(id) === String(req.user._id)),
        })),
    );
  }),
);

notificationsRouter.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    await Notification.updateOne(
      { _id: req.params.id },
      { $addToSet: { readBy: req.user._id } },
    );
    res.status(204).end();
  }),
);

notificationsRouter.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await Notification.updateMany({}, { $addToSet: { readBy: req.user._id } });
    res.status(204).end();
  }),
);

/* ---------------- CMS composer ---------------- */

notificationsRouter.get(
  '/sent',
  requireAuth,
  requireRole('artist', 'admin'),
  asyncHandler(async (req, res) => {
    const filter = req.user.role === 'artist' ? { createdBy: req.user._id } : {};
    const sent = await Notification.find(filter).sort({ sentAt: -1 }).limit(50);
    res.json(sent.map(withImageUrls));
  }),
);

notificationsRouter.post(
  '/',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(2, 'Give the message a title'),
        body: z.string().min(2, 'Write something to send'),
        audience: z.enum(['all', 'clients', 'artists', 'user', 'artist-clients']).default('clients'),
        targetUser: z.string().optional(),
        data: z
          .union([z.string(), z.record(z.any())])
          .optional()
          .transform((v) => {
            if (!v) return {};
            /* multipart sends this as a JSON string. */
            if (typeof v === 'string') {
              try {
                return JSON.parse(v);
              } catch {
                return {};
              }
            }
            return v;
          }),
      })
      .parse(req.body);

    /* An artist may not broadcast to the whole shop or to other artists —
       only to their own clients, or to one named client. */
    if (req.user.role === 'artist' && !['artist-clients', 'user'].includes(body.audience)) {
      throw new ApiError(403, 'Artists can message their own clients only');
    }
    if (body.audience === 'user') {
      if (!body.targetUser) throw new ApiError(422, 'Pick who to send it to');
      if (!(await User.exists({ _id: body.targetUser }))) throw new ApiError(404, 'No such user');
    }

    const notification = await Notification.create({
      title: body.title,
      body: body.body,
      audience: body.audience,
      targetUser: body.audience === 'user' ? body.targetUser : null,
      targetArtist: body.audience === 'artist-clients' ? req.artist?._id ?? req.body.targetArtist : null,
      data: body.data,
      image: req.file ? req.file.filename : '',
      createdBy: req.user._id,
      createdByName: req.user.name,
    });

    const targets = await resolveTargets(notification);
    const payload = withImageUrls(notification);

    emitToRooms(targets, 'notification:new', payload);
    notification.deliveredCount = targets.reduce((sum, room) => sum + connectedCount(room), 0);
    await notification.save();

    /* Mirrored to the CMS so every seat sees the send log update live. */
    emitTo(rooms.staff(), 'notification:sent', withImageUrls(notification));

    res.status(201).json(withImageUrls(notification));
  }),
);

notificationsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await Notification.findByIdAndDelete(req.params.id);
    res.status(204).end();
  }),
);
