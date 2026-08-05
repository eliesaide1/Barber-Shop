import mongoose from 'mongoose';

/* The marketplace listing. `owner` is the artist whose shelf it sits on, or
   null for the house label — that ownership is what scopes the CMS: an artist
   edits their own rows, an admin edits everything and approves. */
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, default: 'FadeRoom Label', trim: true },
    category: {
      type: String,
      required: true,
      enum: ['Hair', 'Beard', 'Shave', 'Tools', 'Aftercare'],
      index: true,
    },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, default: null, min: 0 },
    size: { type: String, default: '' },
    description: { type: String, default: '' },
    howToUse: { type: String, default: '' },
    /* Fallback glyph shown until a real photo is uploaded through the CMS. */
    icon: { type: String, default: '🧴' },
    images: { type: [String], default: [] },
    stock: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 5, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0, min: 0 },
    tag: { type: String, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', default: null, index: true },
    status: {
      type: String,
      enum: ['draft', 'pending', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    featured: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

productSchema.index({ name: 'text', brand: 'text', description: 'text' });

productSchema.virtual('inStock').get(function inStock() {
  return this.stock > 0;
});

productSchema.set('toJSON', { virtuals: true });

export const Product = mongoose.model('Product', productSchema);
