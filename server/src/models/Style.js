import mongoose from 'mongoose';

/* Lookbook entry — a cut photo an artist uploads, reviewed by the shop before
   clients see it. Same approval gate the marketplace listings use. */
const styleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Fades', 'Classic', 'Textured', 'Beard', 'Design'],
      required: true,
      index: true,
    },
    durationMin: { type: Number, default: 45 },
    price: { type: Number, default: 25 },
    images: { type: [String], default: [] },
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', default: null, index: true },
    status: { type: String, enum: ['pending', 'published', 'rejected'], default: 'pending', index: true },
    savedBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true },
);

styleSchema.set('toJSON', { virtuals: true });

export const Style = mongoose.model('Style', styleSchema);
