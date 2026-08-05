import mongoose from 'mongoose';

const artistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    displayName: { type: String, required: true, trim: true },
    specialty: { type: String, default: '', trim: true },
    bio: { type: String, default: '' },
    chair: { type: String, default: '' },
    rating: { type: Number, default: 5, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0, min: 0 },
    priceFrom: { type: Number, default: 20, min: 0 },
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

artistSchema.set('toJSON', { virtuals: true });

export const Artist = mongoose.model('Artist', artistSchema);
