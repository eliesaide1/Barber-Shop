import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    serviceName: { type: String, required: true },
    startsAt: { type: Date, required: true, index: true },
    durationMin: { type: Number, required: true, min: 5 },
    price: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled', 'noshow'],
      default: 'confirmed',
      index: true,
    },
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
   query in the booking route; this index just makes that query cheap. */
appointmentSchema.index({ artist: 1, startsAt: 1, status: 1 });

export const Appointment = mongoose.model('Appointment', appointmentSchema);
