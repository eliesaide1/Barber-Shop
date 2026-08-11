import mongoose from 'mongoose';

/**
 * The statuses that actually occupy the chair.
 *
 * A booking starts life as `pending` — a *request*, not a reservation. It holds
 * nothing, so several clients may ask for the same time and the artist decides
 * who gets it. Were a request to hold the slot, one client could take out the
 * whole week and never turn up.
 *
 * `completed` is in here as well as `confirmed`: a cut that happened occupied
 * the chair just as surely as one that is about to.
 */
export const HOLDS_SLOT = ['confirmed', 'completed'];

const appointmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    serviceName: { type: String, required: true },
    startsAt: { type: Date, required: true, index: true },
    /* The time the client actually asked for, kept even when the artist moves
       the booking on acceptance. Without it a client who asked for five o'clock
       and got quarter to six has no way of telling that it was moved rather
       than mis-tapped. */
    requestedStartsAt: { type: Date, default: null },
    /* While the booking is a request this is the catalogue's estimate for the
       service. On confirmation the artist replaces it with the length they
       actually want to give this client — how long a cut takes depends on the
       head in the chair, not on the price list. */
    durationMin: { type: Number, required: true, min: 5 },
    price: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled', 'declined', 'noshow'],
      default: 'pending',
      index: true,
    },
    /* When the artist answered the request, either way. */
    respondedAt: { type: Date, default: null },
    /* Which reminder lead times have already gone out, in minutes. The record
       of what was sent lives on the booking rather than in the scheduler,
       because the scheduler has no memory: it is a sweep that may run twice,
       run late, or run on a second instance, and this list is what makes any of
       those harmless. Leads that had already passed when the booking was
       accepted are written here immediately, so a cut confirmed an hour before
       it starts never gets told it is "tomorrow". */
    remindersSent: { type: [Number], default: [] },
    declineReason: { type: String, default: '' },
    notes: { type: String, default: '' },
    /* A free cut held against this booking — the reward is only burned when
       the artist confirms it in person, never by the client. */
    free: { type: Boolean, default: false },
    rewardCode: { type: String, default: null },
    walkIn: { type: Boolean, default: false },
  },
  { timestamps: true },
);

appointmentSchema.virtual('endsAt').get(function endsAt() {
  return new Date(this.startsAt.getTime() + this.durationMin * 60_000);
});

appointmentSchema.set('toJSON', { virtuals: true });

/* One artist cannot be in two chairs at once. Enforced properly by the overlap
   query in the confirmation route; this index just makes that query cheap. */
appointmentSchema.index({ artist: 1, startsAt: 1, status: 1 });

/* The client's "how many requests do I have open" check. */
appointmentSchema.index({ user: 1, status: 1, startsAt: 1 });

/* The reminder sweep: confirmed bookings inside the next lead window. */
appointmentSchema.index({ status: 1, startsAt: 1 });

export const Appointment = mongoose.model('Appointment', appointmentSchema);
