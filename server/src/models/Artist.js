import mongoose from 'mongoose';
import { toWhatsAppNumber } from '../lib/whatsapp.js';

const artistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    displayName: { type: String, required: true, trim: true },
    specialty: { type: String, default: '', trim: true },
    bio: { type: String, default: '' },
    chair: { type: String, default: '' },
    /**
     * The number this artist takes WhatsApp on, when it is not the shop's.
     *
     * Separate from the linked user's `phone`, which is a login detail and may
     * well be a landline or a number they would rather clients did not have.
     * Publishing somebody's personal number to every client in the app is not a
     * thing to do by inference — it takes them typing it in here.
     */
    whatsapp: { type: String, default: '', trim: true },
    rating: { type: Number, default: 5, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0, min: 0 },
    priceFrom: { type: Number, default: 20, min: 0 },
    /**
     * Turnaround between clients, in minutes.
     *
     * A cut does not end when the clippers stop: the chair has to be swept, the
     * guards cleaned, the last client has to pay and get their coat. Booking
     * back-to-back looks efficient on a screen and runs late by eleven o'clock,
     * because the debt compounds all morning.
     *
     * So a 15-minute cut at 10:00 with a 5-minute gap frees the chair at 10:20,
     * not 10:15. Each artist sets their own — a skin fade needs longer to clear
     * down than a beard trim — from their own phone.
     */
    gapMin: { type: Number, default: 5, min: 0, max: 60 },
    /* 0 = Sunday, matching JS getDay(). */
    daysOff: { type: [Number], default: [] },
    workingHours: {
      start: { type: String, default: '10:00' },
      end: { type: String, default: '20:00' },
    },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

/**
 * Dialled form, worked out once here rather than in each client.
 *
 * `whatsapp` is whatever the artist typed — `03 887 445`, `+961 3 887 445`. The
 * app needs `9613887445`, and every place that had to convert it would be a
 * place that could convert it differently.
 */
artistSchema.virtual('whatsappNumber').get(function whatsappNumber() {
  return toWhatsAppNumber(this.whatsapp);
});

artistSchema.set('toJSON', { virtuals: true });

export const Artist = mongoose.model('Artist', artistSchema);
