import mongoose from 'mongoose';

/* Composed in the CMS by an artist or admin, fanned out over Socket.IO and
   stored so a client who was offline still sees it next time they open the app. */
const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, default: '' },
    sentAt: { type: Date, default: Date.now, index: true },
    readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    deliveredCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

notificationSchema.set('toJSON', { virtuals: true });

export const Notification = mongoose.model('Notification', notificationSchema);
