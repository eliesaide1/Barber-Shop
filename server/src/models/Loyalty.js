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

    /**
     * How this was come by. `loyalty` is the fifth stamp; `birthday` is a gift
     * the shop attached to a greeting.
     *
     * Worth distinguishing at the chair: one was earned over five visits and the
     * other was given, and an artist looking at a claim code should be able to
     * tell which without asking.
     */
    kind: { type: String, enum: ['loyalty', 'birthday'], default: 'loyalty', index: true },

    /**
     * What it actually is. A loyalty reward is always one free cut, so it needs
     * no label — but a birthday offer might be a discount, a free beard trim, or
     * anything else the shop decides that month, and "free cut" would be a lie.
     */
    label: { type: String, default: '' },
    /** What it is worth, when that is not the standard free-cut value. */
    value: { type: Number, default: null, min: 0 },

    /**
     * Null means never, which is what a stamped-for reward stays.
     *
     * A gift is different: it was not paid for in visits, and one with no end
     * date is a liability the shop carries forever and cannot plan around. So a
     * birthday reward gets a deadline, and — this is the part that matters — it
     * is enforced everywhere a reward can be claimed, not just displayed. An
     * expiry that only appears in the UI is a promise the shop has still made.
     */
    expiresAt: { type: Date, default: null },
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

/**
 * A Mongo fragment for "has not expired".
 *
 * Kept here beside the field rather than written out at each call site: an
 * expiry that one query remembers and another forgets is worse than no expiry
 * at all, because the shop believes it is bounded and it is not.
 */
export const notExpired = (now = new Date()) => [
  { expiresAt: null },
  { expiresAt: { $gt: now } },
];

/** The same question, for a reward already in hand. */
export const rewardIsLive = (reward, now = Date.now()) =>
  reward.status !== 'redeemed' && (!reward.expiresAt || reward.expiresAt.getTime() > now);
