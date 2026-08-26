import mongoose from 'mongoose';

/**
 * One piece of interface copy, editable by the shop.
 *
 * The app ships with every one of these written into it — `t('auth.signIn',
 * 'Sign in')` carries its own default at the call site — so this collection
 * holds overrides and nothing else. That ordering matters: a phone with no
 * network, a first launch before the fetch returns, and a key the shop has
 * never touched all render the same words the developer wrote, rather than a
 * blank space where a button should be.
 *
 * `defaultText` is stored anyway, so the back office can show what a label
 * *was* next to what it has been changed to, and offer a way back.
 */
const labelSchema = new mongoose.Schema(
  {
    /* Dotted and grouped by where it appears: `auth.signIn`, `tabs.shop`. */
    key: { type: String, required: true, unique: true, trim: true, index: true },
    /* What the app would say if this row did not exist. Written by the
       extraction script, not by hand, so it cannot drift from the source. */
    defaultText: { type: String, default: '' },
    /* The shop's wording. Empty means "use the default" — which is how a label
       is reset: clear the box rather than retype what it used to say. */
    value: { type: String, default: '' },
    /* First segment of the key, kept as a field so the CMS can group without
       parsing strings in a template. */
    group: { type: String, default: '', index: true },
  },
  { timestamps: true },
);

labelSchema.set('toJSON', { virtuals: true });

export const Label = mongoose.model('Label', labelSchema);
