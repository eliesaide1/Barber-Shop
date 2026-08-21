import mongoose from 'mongoose';

/* Fanned out over Socket.IO and stored, so a client who was offline still sees
   it next time they open the app.

   Two sorts arrive here. A `message` is composed in the CMS by an artist or
   admin. Everything else the shop raises itself — a booking answered, an order
   on its way — and those are stored as documents rather than emitted and
   forgotten precisely so that push, when it goes in, sends *this record*: the
   app de-duplicates by id, so the same message over both transports lands once. */
const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    /* What raised it, which is also what the app draws an icon from. */
    kind: {
      type: String,
      enum: ['message', 'booking', 'order', 'loyalty'],
      default: 'message',
      index: true,
    },
    audience: {
      type: String,
      enum: ['all', 'clients', 'artists', 'user', 'artist-clients'],
      default: 'clients',
      index: true,
    },
    /* Set when audience === 'user'. */
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    /* Set when audience === 'artist-clients' — everyone who has booked them. */
    targetArtist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', default: null },
    /* Optional deep link, e.g. { screen: 'Product', id: '...' } */
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    image: { type: String, default: '' },
    /* Null when the shop raised it rather than a person typing it. */
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: 'VIA Barber House' },
    sentAt: { type: Date, default: Date.now, index: true },
    readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    deliveredCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

notificationSchema.set('toJSON', { virtuals: true });

export const Notification = mongoose.model('Notification', notificationSchema);
