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

/** Weeks between visits, as a client would describe their own habit. */
export const VISIT_FREQUENCIES = [2, 3, 4, 6, 8, 12];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, default: '', trim: true },
    /**
     * A calendar date, held as `YYYY-MM-DD` rather than a Date.
     *
     * A birthday is not an instant. Stored as a Date it becomes UTC midnight,
     * and anyone reading it west of Greenwich sees the day before — someone born
     * on the 1st turns up as the 31st. The string has no zone to get wrong.
     */
    dateOfBirth: {
      type: String,
      default: '',
      match: [/^(\d{4}-\d{2}-\d{2})?$/, 'Use YYYY-MM-DD'],
    },
    /**
     * How often they get cut, in weeks. A number rather than a label because it
     * is the thing you can actually compute with — when somebody is due, who has
     * drifted away — and a label is only ever a rendering of it.
     */
    visitFrequencyWeeks: { type: Number, enum: [...VISIT_FREQUENCIES, null], default: null },
    /* The year they were last wished a happy birthday. One mark, claimed before
       the message goes out, is what stops a second sweep — or a second server —
       greeting somebody twice. */
    birthdayGreetedYear: { type: Number, default: null },
    /* Absent for an account that only ever signs in with Google or Apple.
       Every account must still have *some* way in — see the validator below. */
    passwordHash: { type: String, select: false },
    /**
     * Signing in with Google or Apple.
     *
     * `subject` is the provider's own stable id for the person, and it is what
     * an account is actually matched on. Email is kept for display and for the
     * one-time link to an existing password account, but never used to match on
     * its own: people change the email on a Google account, and matching on
     * something the user can edit means their history quietly detaches.
     */
    identities: {
      type: [
        {
          provider: { type: String, enum: ['google', 'apple'], required: true },
          subject: { type: String, required: true },
          email: { type: String, default: '' },
          linkedAt: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      default: [],
    },
    role: { type: String, enum: ['client', 'artist', 'admin'], default: 'client', index: true },
    preferences: { type: preferencesSchema, default: () => ({}) },
    devices: { type: [deviceSchema], default: [] },
    notifications: {
      /* Shop announcements and artist broadcasts. Transactional messages — a
         booking answered, an order on its way — have no switch on purpose:
         silencing an advert must not also silence the confirmation somebody is
         waiting on, and one setting for both is how an app ends up unable to
         reach anyone about anything. */
      broadcasts: { type: Boolean, default: true },
      /* WhatsApp is somebody's personal messaging app, not a channel the shop
         is entitled to. Off until they say otherwise — which is also what Meta
         requires, and what stops the shop's number being reported into a
         quality rating it cannot recover from. */
      whatsapp: { type: Boolean, default: false },
    },
    /* Bumped on logout-all / password change so old refresh tokens stop working. */
    tokenVersion: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/* One provider account maps to one user, forever. Without this, a race between
   two simultaneous first-time sign-ins could mint two accounts for one person,
   and only one of them would keep their loyalty card. */
userSchema.index(
  { 'identities.provider': 1, 'identities.subject': 1 },
  { unique: true, sparse: true },
);

/* An account with neither a password nor a provider is an account nobody can
   ever sign into — worth refusing at the point of writing rather than
   discovering when somebody tries.
 *
 * Guarded on the field having actually been read. `passwordHash` is `select:
 * false`, so a document loaded the ordinary way — which is every request that
 * touches `req.user` — has no idea whether one exists, and checking anyway would
 * fail the save on every profile edit and device registration. */
userSchema.pre('validate', function requireSomeWayIn(next) {
  const knowsAboutPassword = this.isNew || this.isSelected('passwordHash');
  if (knowsAboutPassword && !this.passwordHash && this.identities.length === 0) {
    this.invalidate('passwordHash', 'An account needs a password or a linked Google/Apple sign-in');
  }
  next();
});

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
    /* The app wants to show "signed in with Google"; the provider's internal
       subject id is nobody's business outside this collection. */
    if (Array.isArray(ret.identities)) {
      ret.identities = ret.identities.map((i) => ({ provider: i.provider, email: i.email }));
    }
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
