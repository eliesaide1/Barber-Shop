import { Router } from 'express';
import { z } from 'zod';
import { Style } from '../models/Style.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist, maybeAuth } from '../middleware/auth.js';
import { upload, withImageUrls } from '../lib/upload.js';
import { broadcast, emitTo, rooms } from '../lib/realtime.js';

export const stylesRouter = Router();

stylesRouter.get(
  '/',
  maybeAuth,
  asyncHandler(async (req, res) => {
    const filter = { status: 'published' };
    if (req.query.category && req.query.category !== 'All') filter.category = req.query.category;
    if (req.query.saved === 'true') {
      if (!req.user) throw new ApiError(401, 'Sign in to see your lookbook');
      filter.savedBy = req.user._id;
    }

    const styles = await Style.find(filter)
      .populate('artist', 'displayName rating')
      .sort({ createdAt: -1 })
      .limit(80);

    res.json(
      styles.map((s) => ({
        ...withImageUrls(s),
        saved: req.user ? s.savedBy.some((id) => String(id) === String(req.user._id)) : false,
      })),
    );
  }),
);

stylesRouter.post(
  '/:id/save',
  requireAuth,
  asyncHandler(async (req, res) => {
    const style = await Style.findById(req.params.id);
    if (!style) throw new ApiError(404, 'Style not found');

    const saved = style.savedBy.some((id) => String(id) === String(req.user._id));
    await Style.updateOne(
      { _id: style._id },
      saved ? { $pull: { savedBy: req.user._id } } : { $addToSet: { savedBy: req.user._id } },
    );

    res.json({ saved: !saved });
  }),
);

/* ---------------- artist portfolio ---------------- */

stylesRouter.get(
  '/mine',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const filter = req.user.role === 'artist' ? { artist: req.artist._id } : {};
    const styles = await Style.find(filter).populate('artist', 'displayName').sort({ createdAt: -1 });
    res.json(styles.map(withImageUrls));
  }),
);

stylesRouter.post(
  '/',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  upload.array('images', 4),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(2, 'Give the look a title'),
        category: z.enum(['Fades', 'Classic', 'Textured', 'Beard', 'Design']),
        durationMin: z.coerce.number().int().min(5).optional(),
        price: z.coerce.number().min(0).optional(),
      })
      .parse(req.body);

    const style = await Style.create({
      ...body,
      artist: req.artist?._id ?? null,
      images: (req.files || []).map((f) => f.filename),
      /* Same review gate as the marketplace: the shop approves before it is public. */
      status: req.user.role === 'admin' ? 'published' : 'pending',
    });

    emitTo(rooms.staff(), 'style:changed', withImageUrls(style));
    broadcast('lookbook:changed', { id: style.id });
    res.status(201).json(withImageUrls(style));
  }),
);

stylesRouter.post(
  '/:id/status',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['pending', 'published', 'rejected']) })
      .parse(req.body);

    const style = await Style.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!style) throw new ApiError(404, 'Style not found');

    emitTo(rooms.staff(), 'style:changed', withImageUrls(style));
    broadcast('lookbook:changed', { id: style.id });
    if (style.artist) emitTo(rooms.artist(style.artist), 'style:changed', withImageUrls(style));

    res.json(withImageUrls(style));
  }),
);
