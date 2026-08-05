import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    durationMin: { type: Number, required: true, min: 5 },
    price: { type: Number, required: true, min: 0 },
    /* null = offered at every chair. */
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', default: null, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

serviceSchema.set('toJSON', { virtuals: true });

export const Service = mongoose.model('Service', serviceSchema);
