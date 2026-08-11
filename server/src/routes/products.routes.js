import { Router } from 'express';
import { z } from 'zod';
import { Product } from '../models/Product.js';
import { Artist } from '../models/Artist.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist, maybeAuth } from '../middleware/auth.js';
import { upload, withImageUrls } from '../lib/upload.js';
import { broadcast, emitTo, rooms } from '../lib/realtime.js';
import { getSettings } from '../models/ShopSettings.js';

export const productsRouter = Router();

const CATEGORIES = ['Hair', 'Beard', 'Shave', 'Tools', 'Aftercare'];

/**
 * A product as a client is allowed to see it.
 *
 * When the price is hidden it is *removed*, not blanked — the number never
 * leaves the server. Anything less makes "hidden" a property of the interface
 * rather than of the data, and the first person to open the network tab finds
 * out what the shop did not want to publish.
 *
 * Staff see everything: the CMS has to show the price in order to edit it.
 */
export function forViewer(product, { isStaff = false, hideAll = false } = {}) {
  const json = withImageUrls(product);
  const hidden = hideAll || json.priceHidden;
  json.priceHidden = Boolean(hidden);

  if (hidden && !isStaff) {
    delete json.price;
    delete json.compareAtPrice;
  }
  return json;
}

const productBody = z.object({
  name: z.string().min(2, 'Give the product a name'),
  brand: z.string().optional(),
  category: z.enum(CATEGORIES),
  price: z.coerce.number().min(0, 'Price cannot be negative'),
  compareAtPrice: z.coerce.number().min(0).nullable().optional(),
  size: z.string().optional(),
  description: z.string().optional(),
  howToUse: z.string().optional(),
  icon: z.string().optional(),
  stock: z.coerce.number().int().min(0).optional(),
  tag: z.string().optional(),
  owner: z.string().nullable().optional(),
  featured: z.coerce.boolean().optional(),
  /* Multipart sends booleans as "true"/"false" strings. */
  priceHidden: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
});

/* ---------------- public catalogue ---------------- */

productsRouter.get(
  '/',
  maybeAuth,
  asyncHandler(async (req, res) => {
    const { category, q, artist, limit = 60 } = req.query;

    const filter = { status: 'published' };
    if (category && category !== 'All') filter.category = category;
    if (artist) filter.owner = artist;
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { brand: rx }, { description: rx }];
    }

    const products = await Product.find(filter)
      .populate('owner', 'displayName specialty rating chair')
      .sort({ featured: -1, createdAt: -1 })
      .limit(Math.min(Number(limit) || 60, 200));

    const { marketplace } = await getSettings();
    const isStaff = req.user && ['artist', 'admin'].includes(req.user.role);
    res.json(products.map((p) => forViewer(p, { isStaff, hideAll: marketplace.hideAllPrices })));
  }),
);

productsRouter.get(
  '/:id',
  maybeAuth,
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).populate(
      'owner',
      'displayName specialty rating chair',
    );
    if (!product) throw new ApiError(404, 'That product is no longer listed');
    /* Staff can preview their own drafts; clients only ever see published. */
    const isStaff = req.user && ['artist', 'admin'].includes(req.user.role);
    if (product.status !== 'published' && !isStaff) {
      throw new ApiError(404, 'That product is no longer listed');
    }
    const { marketplace } = await getSettings();
    res.json(forViewer(product, { isStaff, hideAll: marketplace.hideAllPrices }));
  }),
);

/* ---------------- CMS ---------------- */

/** Everything the signed-in staff member is allowed to manage. */
productsRouter.get(
  '/manage/list',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const filter = req.user.role === 'artist' ? { owner: req.artist._id } : {};
    if (req.query.status) filter.status = req.query.status;

    const products = await Product.find(filter)
      .populate('owner', 'displayName')
      .sort({ updatedAt: -1 });

    const { marketplace } = await getSettings();
    res.json(products.map((p) => forViewer(p, { isStaff: true, hideAll: marketplace.hideAllPrices })));
  }),
);

/** An artist may only touch their own shelf; an admin may touch anything. */
async function loadOwned(req) {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  if (req.user.role === 'artist' && String(product.owner) !== String(req.artist._id)) {
    throw new ApiError(403, 'That product belongs to another artist');
  }
  return product;
}

productsRouter.post(
  '/',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  upload.array('images', 6),
  asyncHandler(async (req, res) => {
    const body = productBody.parse(req.body);

    /* An artist's listing is always their own, whatever the payload claims. */
    let owner = req.user.role === 'artist' ? req.artist._id : body.owner || null;
    if (owner && req.user.role === 'admin' && !(await Artist.exists({ _id: owner }))) {
      throw new ApiError(400, 'That artist does not exist');
    }

    const product = await Product.create({
      ...body,
      owner,
      images: (req.files || []).map((f) => f.filename),
      createdBy: req.user._id,
      /* Artists submit for approval; admins publish directly. */
      status: req.user.role === 'admin' ? 'published' : 'pending',
    });

    const payload = withImageUrls(product);
    emitTo(rooms.staff(), 'product:created', payload);
    if (product.status === 'published') broadcast('catalogue:changed', { id: product.id });

    res.status(201).json(payload);
  }),
);

productsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  upload.array('images', 6),
  asyncHandler(async (req, res) => {
    const product = await loadOwned(req);
    const body = productBody.partial().parse(req.body);

    Object.assign(product, body);
    if (req.user.role === 'artist') {
      delete product.owner;
      /* Edits by an artist go back through approval. */
      if (product.status === 'published') product.status = 'pending';
    }
    if (req.files?.length) {
      product.images = [...product.images, ...req.files.map((f) => f.filename)].slice(-6);
    }
    await product.save();

    const payload = withImageUrls(product);
    emitTo(rooms.staff(), 'product:updated', payload);
    broadcast('catalogue:changed', { id: product.id });

    res.json(payload);
  }),
);

/** Admin approval gate — mirrors the portfolio review flow. */
productsRouter.post(
  '/:id/status',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['draft', 'pending', 'published', 'archived']) })
      .parse(req.body);

    const product = await Product.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!product) throw new ApiError(404, 'Product not found');

    const payload = withImageUrls(product);
    emitTo(rooms.staff(), 'product:updated', payload);
    if (product.owner) emitTo(rooms.artist(product.owner), 'product:updated', payload);
    broadcast('catalogue:changed', { id: product.id });

    res.json(payload);
  }),
);

productsRouter.delete(
  '/:id/images/:index',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const product = await loadOwned(req);
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= product.images.length) {
      throw new ApiError(400, 'No image at that position');
    }
    product.images.splice(index, 1);
    await product.save();
    res.json(withImageUrls(product));
  }),
);

productsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const product = await loadOwned(req);
    /* Archive rather than delete — past orders still reference this row. */
    product.status = 'archived';
    await product.save();

    emitTo(rooms.staff(), 'product:updated', withImageUrls(product));
    broadcast('catalogue:changed', { id: product.id });

    res.status(204).end();
  }),
);
