import { Router } from 'express';
import { z } from 'zod';
import { Service } from '../models/Service.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist } from '../middleware/auth.js';
import { broadcast, emitTo, rooms } from '../lib/realtime.js';
import { priceSafe } from '../lib/prices.js';

export const servicesRouter = Router();

const serviceBody = z.object({
  name: z.string().min(2, 'Give the service a name'),
  description: z.string().optional(),
  durationMin: z.coerce.number().int().min(5, 'At least 5 minutes'),
  price: z.coerce.number().min(0),
  artist: z.string().nullable().optional(),
  active: z.coerce.boolean().optional(),
});

servicesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = req.query.all === 'true' ? {} : { active: true };
    if (req.query.artist) filter.$or = [{ artist: req.query.artist }, { artist: null }];
    const services = await Service.find(filter).sort({ price: 1 });
    res.json(await priceSafe(req.user, services.map((x) => x.toJSON()), ['price']));
  }),
);

servicesRouter.post(
  '/',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const body = serviceBody.parse(req.body);
    const service = await Service.create({
      ...body,
      artist: req.user.role === 'artist' ? req.artist._id : body.artist || null,
    });
    emitTo(rooms.staff(), 'service:changed', service.toJSON());
    broadcast('services:changed', { id: service.id });
    res.status(201).json(service);
  }),
);

servicesRouter.patch(
  '/:id',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const service = await Service.findById(req.params.id);
    if (!service) throw new ApiError(404, 'Service not found');
    if (req.user.role === 'artist' && String(service.artist) !== String(req.artist._id)) {
      throw new ApiError(403, 'That service belongs to another chair');
    }

    Object.assign(service, serviceBody.partial().parse(req.body));
    await service.save();

    emitTo(rooms.staff(), 'service:changed', service.toJSON());
    broadcast('services:changed', { id: service.id });
    res.json(await priceSafe(req.user, service.toJSON(), ['price']));
  }),
);

servicesRouter.delete(
  '/:id',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const service = await Service.findById(req.params.id);
    if (!service) throw new ApiError(404, 'Service not found');
    if (req.user.role === 'artist' && String(service.artist) !== String(req.artist._id)) {
      throw new ApiError(403, 'That service belongs to another chair');
    }
    service.active = false;
    await service.save();
    emitTo(rooms.staff(), 'service:changed', service.toJSON());
    broadcast('services:changed', { id: service.id });
    res.status(204).end();
  }),
);
