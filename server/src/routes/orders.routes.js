import { Router } from 'express';
import { z } from 'zod';
import { atomically } from '../lib/tx.js';
import { Order, ORDER_FLOW } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Appointment } from '../models/Appointment.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { requireAuth, requireRole, attachArtist } from '../middleware/auth.js';
import { orderCode, readCode } from '../lib/codes.js';
import { emitTo, rooms } from '../lib/realtime.js';
import { env } from '../config/env.js';
import { withImageUrls } from '../lib/upload.js';

export const ordersRouter = Router();

const createBody = z.object({
  items: z
    .array(z.object({ product: z.string(), qty: z.coerce.number().int().min(1).max(20) }))
    .min(1, 'Your cart is empty'),
  fulfilment: z.enum(['pickup', 'delivery']),
  payment: z.enum(['cash', 'card']).default('cash'),
  withAppointment: z.boolean().optional(),
  address: z
    .object({
      name: z.string().min(2, 'Please enter your name'),
      phone: z.string().min(7, 'Enter a valid phone number'),
      line: z.string().min(6, 'We need an address to deliver to'),
      note: z.string().optional(),
    })
    .optional(),
});

const shape = (order) => {
  const json = order.toJSON();
  json.items = json.items.map((i) => withImageUrls(i));
  return json;
};

/* ---------------- client ---------------- */

ordersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(orders.map(shape));
  }),
);

ordersRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, 'Order not found');
    const isStaff = ['artist', 'admin'].includes(req.user.role);
    if (!isStaff && String(order.user) !== String(req.user._id)) {
      throw new ApiError(403, 'Not your order');
    }
    res.json(shape(order));
  }),
);

ordersRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createBody.parse(req.body);

    if (body.fulfilment === 'delivery' && !body.address) {
      throw new ApiError(422, 'Add a delivery address', { fields: { 'address.line': 'Required' } });
    }

    /* Price the order from the database. The client sends product ids and
       quantities and nothing else — totals are never taken on trust. */
    const ids = body.items.map((i) => i.product);
    const products = await Product.find({ _id: { $in: ids }, status: 'published' });
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const items = [];
    for (const line of body.items) {
      const product = byId.get(line.product);
      if (!product) throw new ApiError(409, 'One of those products is no longer listed');
      if (product.stock < line.qty) {
        throw new ApiError(409, `Only ${product.stock} left of ${product.name}`);
      }
      items.push({
        product: product._id,
        name: product.name,
        price: product.price,
        qty: line.qty,
        icon: product.icon,
        image: product.images[0] || '',
      });
    }

    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const fee =
      body.fulfilment === 'delivery' && subtotal < env.freeDeliveryOver ? env.deliveryFee : 0;

    /* Decrement stock and write the order together — a half-applied order
       would either oversell or lose the sale. `taken` lets us put stock back
       when the database has no transactions to do it for us. */
    const taken = [];
    const order = await atomically(
      async (session) => {
        const opts = session ? { session } : {};

        for (const item of items) {
          /* The stock guard lives in the query, so two people checking out the
             last unit at the same moment can't both win it. */
          const updated = await Product.findOneAndUpdate(
            { _id: item.product, stock: { $gte: item.qty } },
            { $inc: { stock: -item.qty } },
            { ...opts, new: true },
          );
          if (!updated) throw new ApiError(409, `${item.name} just sold out`);
          taken.push(item);
        }

        const status = body.fulfilment === 'delivery' ? 'packing' : 'ready';
        const [created] = await Order.create(
          [
            {
              user: req.user._id,
              items,
              subtotal,
              fee,
              total: subtotal + fee,
              fulfilment: body.fulfilment,
              address: body.fulfilment === 'delivery' ? body.address : null,
              payment: body.payment,
              code: orderCode(),
              status,
              withAppointment: Boolean(body.withAppointment) && body.fulfilment === 'pickup',
              timeline: [{ status, at: new Date(), by: req.user._id }],
            },
          ],
          opts,
        );
        return created;
      },
      async () => {
        await Promise.all(
          taken.map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.qty } })),
        );
      },
    );

    if (order.withAppointment) {
      const next = await Appointment.findOne({
        user: req.user._id,
        status: { $in: ['pending', 'confirmed'] },
        startsAt: { $gte: new Date() },
      }).sort({ startsAt: 1 });
      if (next) {
        order.appointment = next._id;
        await order.save();
      }
    }

    const payload = shape(order);
    emitTo(rooms.staff(), 'order:created', payload);
    emitTo(rooms.user(req.user._id), 'order:created', payload);

    res.status(201).json(payload);
  }),
);

/* ---------------- staff ---------------- */

ordersRouter.get(
  '/manage/list',
  requireAuth,
  requireRole('artist', 'admin'),
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.open === 'true') filter.status = { $in: ['ready', 'packing', 'out'] };
    if (req.query.status) filter.status = req.query.status;

    const orders = await Order.find(filter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(orders.map(shape));
  }),
);

/** Look an order up by its pickup code — what the artist scans at the chair. */
ordersRouter.get(
  '/manage/by-code/:code',
  requireAuth,
  requireRole('artist', 'admin'),
  asyncHandler(async (req, res) => {
    const code = readCode(req.params.code, 'O');
    const order = await Order.findOne({ code }).populate('user', 'name email phone');
    if (!order) throw new ApiError(404, 'No order matches that code');
    res.json(shape(order));
  }),
);

/** Move an order along its flow. The flow itself decides what is reachable. */
ordersRouter.post(
  '/:id/status',
  requireAuth,
  requireRole('artist', 'admin'),
  attachArtist,
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({
        status: z.enum(['ready', 'collected', 'packing', 'out', 'delivered', 'cancelled']),
      })
      .parse(req.body);

    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, 'Order not found');

    if (status !== 'cancelled') {
      const flow = ORDER_FLOW[order.fulfilment];
      if (!flow.includes(status)) {
        throw new ApiError(400, `A ${order.fulfilment} order cannot be "${status}"`);
      }
      /* Forward only — an order that was collected cannot go back to ready. */
      if (flow.indexOf(status) <= flow.indexOf(order.status)) {
        throw new ApiError(409, `That order is already "${order.status}"`);
      }
    } else if (order.status === 'collected' || order.status === 'delivered') {
      throw new ApiError(409, 'That order was already handed over');
    }

    /* Cancelling puts the stock back on the shelf. */
    if (status === 'cancelled') {
      await Promise.all(
        order.items.map((i) =>
          Product.updateOne({ _id: i.product }, { $inc: { stock: i.qty } }),
        ),
      );
    }

    order.status = status;
    order.timeline.push({ status, at: new Date(), by: req.user._id });
    await order.save();

    const payload = shape(order);
    emitTo(rooms.user(order.user), 'order:status', payload);
    emitTo(rooms.staff(), 'order:status', payload);

    res.json(payload);
  }),
);
