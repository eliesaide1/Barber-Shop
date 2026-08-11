import mongoose from 'mongoose';

/**
 * A record of a cut somebody actually had, on their own profile.
 *
 * Not the lookbook. A `Style` is the artist's portfolio — public, reviewed by
 * the shop, chosen to advertise the chair. This is private: what *this* client
 * left with, kept so the next artist can reproduce it without the conversation
 * that starts "shorter than last time, but not as short as the time before".
 *
 * ── Consent is the shape of this model, not a field on it ────────────────────
 *
 * A photograph of a person, taken at the chair, filed against their name, is
 * theirs before it is the shop's. So the artist does not *add* a record — they
 * *propose* one, and it does nothing until the client says yes. Until then it
 * is not on their profile, not in the artist's reference, and not part of any
 * history.
 *
 * And a refusal deletes it. Keeping a declined photograph as a row marked
 * `declined` would be filing the thing the client just refused; the only honest
 * implementation of "no" is that it goes.
 */
const haircutRecordSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /* Who cut it — and, until it is approved, the only member of staff who can
       see it, because they are the one who was standing there. */
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true, index: true },
    /* The visit it came from, when there was one. A walk-in has none. */
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },

    serviceName: { type: String, default: '' },
    images: { type: [String], default: [] },
    /**
     * What was actually done, in the artist's words — guard numbers, where the
     * fade started, how the top was left. The photograph shows the result; this
     * is how somebody repeats it, and it is the half a picture cannot carry.
     */
    notes: { type: String, default: '' },

    /* `pending` until the client answers. There is no `declined`: see above. */
    status: { type: String, enum: ['pending', 'approved'], default: 'pending', index: true },
    approvedAt: { type: Date, default: null },
    takenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/* The client's own history, newest first — the common read by a distance. */
haircutRecordSchema.index({ user: 1, status: 1, takenAt: -1 });

/**
 * Image paths are made client-ready here rather than at each call site.
 *
 * A record arrives in three different shapes — its own routes, and populated
 * onto an appointment in the agenda and the request inbox — and a call site
 * that forgot would send a bare filename that resolves to nothing. Idempotent,
 * so passing one through `withImageUrls` as well is harmless.
 */
haircutRecordSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    if (Array.isArray(ret.images)) {
      ret.images = ret.images.map((img) =>
        img.startsWith('/uploads/') || img.startsWith('http') ? img : `/uploads/${img}`,
      );
    }
    return ret;
  },
});

export const HaircutRecord = mongoose.model('HaircutRecord', haircutRecordSchema);
