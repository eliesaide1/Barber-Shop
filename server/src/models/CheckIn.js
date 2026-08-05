import mongoose from 'mongoose';

/* The artist-facing activity feed: every stamp, every reward earned, every
   free cut burned. Written by the loyalty routes, streamed to the CMS. */
const checkInSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, required: true },
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true, index: true },
    kind: { type: String, enum: ['stamp', 'earned', 'redeemed'], required: true },
    stampNumber: { type: Number, default: null },
    code: { type: String, default: null },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

export const CheckIn = mongoose.model('CheckIn', checkInSchema);
