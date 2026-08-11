import { Router } from 'express';
import { z } from 'zod';
import { HaircutRecord } from '../models/HaircutRecord.js';
import { Appointment } from '../models/Appointment.js';
import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist } from '../middleware/auth.js';
import { upload, withImageUrls, removeUpload } from '../lib/upload.js';
import { notify } from '../lib/notify.js';
import { emitTo, rooms } from '../lib/realtime.js';

export const haircutsRouter = Router();

/**
 * Previous haircut records.
 *
 * The artist proposes; the client decides. Nothing here is on somebody's
 * profile until they have said so, and saying no removes the photograph rather
 * than filing it as refused.
 */

const shape = (record) => withImageUrls(record);

/* ---------------- the client's own record ---------------- */

/**
 * Their haircut history, and anything waiting on them.
 *
 * Pending records are returned too, deliberately: a photograph of you that
 * somebody is holding pending your answer is a thing you should be able to see
 * *before* answering, not a yes-or-no about an image you were never shown.
 */
haircutsRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const records = await HaircutRecord.find({ user: req.user._id })
      .populate('artist', 'displayName chair')
      .sort({ takenAt: -1 })
      .limit(60);

    res.json(records.map(shape));
  }),
);

/** Only the person in the photograph can approve it. */
async function loadOwn(req) {
  const record = await HaircutRecord.findById(req.params.id);
  if (!record) throw new ApiError(404, 'That haircut record is no longer there');
  if (String(record.user) !== String(req.user._id)) {
    throw new ApiError(403, 'That is not your haircut');
  }
  return record;
}

haircutsRouter.post(
  '/:id/approve',
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await loadOwn(req);
    if (record.status === 'approved') return res.json(shape(record));

    record.status = 'approved';
    record.approvedAt = new Date();
    await record.save();

    /* The artist finds out their reference is usable. */
    emitTo(rooms.artist(record.artist), 'haircut:changed', shape(record));
    res.json(shape(record));
  }),
);

/**
 * No.
 *
 * The row goes and so do the files. A `declined` record would be the shop
 * keeping a photograph somebody explicitly refused, which is not a smaller
 * version of consent — it is the absence of it.
 */
haircutsRouter.post(
  '/:id/decline',
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await loadOwn(req);

    record.images.forEach(removeUpload);
    await record.deleteOne();

    emitTo(rooms.artist(record.artist), 'haircut:changed', { id: String(record._id), removed: true });
    res.status(204).end();
  }),
);

/** Second thoughts. Same treatment — the photograph goes with it. */
haircutsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await loadOwn(req);
    record.images.forEach(removeUpload);
    await record.deleteOne();

    emitTo(rooms.artist(record.artist), 'haircut:changed', { id: String(record._id), removed: true });
    res.status(204).end();
  }),
);

/* ---------------- the chair ---------------- */

/**
 * Propose a record of the cut just finished.
 *
 * Pending, always. There is no route by which an artist can put an approved
 * photograph on somebody's profile, because there is no version of that which
 * is the client's decision.
 */
haircutsRouter.post(
  '/',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  upload.array('images', 3),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        user: z.string(),
        appointment: z.string().optional(),
        serviceName: z.string().max(80).optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(req.body);

    if (!req.files?.length) throw new ApiError(422, 'Add a photo of the cut');

    const client = await User.findById(body.user);
    if (!client || client.role !== 'client') throw new ApiError(404, 'No such client');

    /* An admin has no chair, so they must be acting for one — and a record has
       to belong to the artist who cut it, or it is no use as a reference. */
    let artistId = req.artist?._id;
    if (!artistId) {
      const appointment = body.appointment ? await Appointment.findById(body.appointment) : null;
      artistId = appointment?.artist;
      if (!artistId) throw new ApiError(400, 'Only an artist can record a cut');
    }

    const record = await HaircutRecord.create({
      user: client._id,
      artist: artistId,
      appointment: body.appointment || null,
      serviceName: body.serviceName || '',
      notes: body.notes || '',
      images: req.files.map((f) => f.filename),
      status: 'pending',
    });

    /* Asking is the point. Without this the photograph sits unseen and the
       client is never actually asked anything. */
    await notify(client._id, {
      title: 'Can we save a photo of your cut?',
      body: 'Your artist took one so they can repeat it next time. It only goes on your profile if you say yes.',
      kind: 'message',
      data: { screen: 'Haircuts' },
      actor: req.user,
    });

    res.status(201).json(shape(record));
  }),
);

/**
 * A client's approved cuts, for the artist about to work on them.
 *
 * Approved only, whoever is asking — an artist looking up a client's history
 * gets what that client agreed to share, never what is still pending with
 * somebody else. Their own pending proposals come back too, so they can see
 * they have asked and are waiting.
 */
haircutsRouter.get(
  '/client/:userId',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const mine = req.artist?._id;
    const records = await HaircutRecord.find({
      user: req.params.userId,
      $or: [{ status: 'approved' }, ...(mine ? [{ status: 'pending', artist: mine }] : [])],
    })
      .populate('artist', 'displayName chair')
      .sort({ takenAt: -1 })
      .limit(40);

    res.json(records.map(shape));
  }),
);
