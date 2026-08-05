import mongoose from 'mongoose';

const stampSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
  },
  { _id: false },
);

const rewardSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    earnedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['available', 'reserved', 'redeemed'], default: 'available' },
    redeemedAt: { type: Date, default: null },
    redeemedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', default: null },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  },
  { _id: false },
);

const loyaltySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    /* Reset to [] each time a reward is minted, so length is "progress to the
       next free cut" and totalCheckIns is the lifetime figure. */
    stamps: { type: [stampSchema], default: [] },
    rewards: { type: [rewardSchema], default: [] },
    totalCheckIns: { type: Number, default: 0, min: 0 },
    lastCheckInAt: { type: Date, default: null },
  },
  { timestamps: true },
);

loyaltySchema.set('toJSON', { virtuals: true });

export const Loyalty = mongoose.model('Loyalty', loyaltySchema);
