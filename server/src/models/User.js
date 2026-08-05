import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const preferencesSchema = new mongoose.Schema(
  {
    clipperGuard: { type: String, default: '' },
    beard: { type: String, default: '' },
    part: { type: String, default: '' },
    notes: { type: String, default: '' },
    preferredArtist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', default: null },
  },
  { _id: false },
);

const deviceSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    platform: { type: String, enum: ['android', 'ios'], required: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, default: '', trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['client', 'artist', 'admin'], default: 'client', index: true },
    preferences: { type: preferencesSchema, default: () => ({}) },
    devices: { type: [deviceSchema], default: [] },
    /* Bumped on logout-all / password change so old refresh tokens stop working. */
    tokenVersion: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.virtual('initials').get(function initials() {
  return this.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
});

userSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export const User = mongoose.model('User', userSchema);
