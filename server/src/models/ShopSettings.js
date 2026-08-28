import mongoose from 'mongoose';

/**
 * The shop's own settings — one document, edited from the back office.
 *
 * Everything here is something the owner should be able to change without a
 * deploy. Credentials are *not* here: they live in the environment, because a
 * token that can message every client should not be editable from a browser
 * session, and should not sit in a database that gets dumped into a repository.
 */

const birthdaySchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },

    /**
     * The name and language of an **approved** WhatsApp template.
     *
     * Meta does not allow a business to send whatever it likes to somebody who
     * has not messaged first. A birthday greeting is unprompted by definition,
     * so it has to be a template submitted for review in advance, and the only
     * parts that vary are its numbered placeholders. That is not a limitation
     * this app invented and it is not one it can work around.
     */
    templateName: { type: String, default: '', trim: true },
    templateLanguage: { type: String, default: 'en', trim: true },

    /**
     * What goes into the template's `{{1}}`, `{{2}}`, … in order.
     *
     * This is where the shop's own wording actually lives. `{name}` and
     * `{shop}` are filled in per client; everything else is literal, so an
     * owner can change "a free beard trim this month" to "20% off" whenever
     * they like without going back to Meta for approval.
     */
    variables: {
      type: [String],
      default: ['{name}', 'a free beard trim on your next visit'],
    },

    /**
     * What the greeting comes with.
     *
     *  `none`   — good wishes and nothing else.
     *  `text`   — an offer described in the message. Costs nothing to run, and
     *             the shop can reword it whenever it likes, but it is only
     *             words: nothing records who was offered what, or who used it.
     *  `reward` — a real entry on the client's loyalty card, with a claim code
     *             the artist burns at the chair. Trackable, and it cannot be
     *             used twice.
     *
     * `reward` is the honest option for anything of value. A discount promised
     * in a message and a discount the till knows about are different things,
     * and only the second can be reconciled at the end of the month.
     */
    offer: { type: String, enum: ['none', 'text', 'reward'], default: 'text' },

    /** What the reward is, in the shop's own words — it need not be a free cut. */
    rewardLabel: { type: String, default: 'Birthday gift — a free cut', trim: true },
    /** Its worth, when that is not the standard free-cut value. */
    rewardValue: { type: Number, default: null, min: 0 },
    /**
     * How long they have to use it.
     *
     * A gift was not paid for in visits, and one with no end date is a liability
     * the shop carries indefinitely and cannot plan around. A month is long
     * enough to be a real gift and short enough to be a reason to come in, which
     * is the point of sending it.
     */
    rewardExpiryDays: { type: Number, default: 30, min: 1, max: 365 },

    /** What the app's own notification says. No approval needed for this one. */
    inAppTitle: { type: String, default: 'Happy birthday! 🎉', trim: true },
    inAppBody: {
      type: String,
      default: 'From everyone at {shop} — come and see us, there’s something on the house.',
      trim: true,
    },

    /**
     * Hour of the day to send, in the shop's timezone. Nobody wants a marketing
     * message at three in the morning, and Meta counts that against you.
     */
    sendHour: { type: Number, default: 10, min: 0, max: 23 },
  },
  { _id: false },
);

/**
 * The "message us" button in the client app.
 *
 * A client opening WhatsApp to ask a question is not the shop messaging them,
 * so none of the template machinery above applies — they start the conversation,
 * which is exactly the case Meta leaves alone. It is a link, and it works today.
 */
const contactSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    /** The shop's own number, used when the artist has not given one. */
    whatsapp: { type: String, default: '', trim: true },
    /** Prefilled into the message box, so nobody has to open with "hi". */
    greeting: { type: String, default: 'Hi {shop}, I have a question about my booking.', trim: true },
  },
  { _id: false },
);

const marketplaceSchema = new mongoose.Schema(
  {
    /**
     * Hide every price at once, whatever each product says.
     *
     * A shop that quotes rather than lists wants this on and never thinks about
     * it again; a shop that does both leaves it off and hides the few products
     * it needs to. Two plain switches rather than one clever one, because the
     * question "why can nobody see this price" should have an obvious answer.
     */
    hideAllPrices: { type: Boolean, default: false },
    /** Prefilled when a client asks about a specific product. */
    priceEnquiry: {
      type: String,
      default: 'Hi {shop}, how much is {product}?',
      trim: true,
    },
  },
  { _id: false },
);

/**
 * The loyalty programme, as the shop sets it rather than as it was deployed.
 *
 * This was an environment variable, which meant changing "every fifth cut" to
 * "every eighth" was a redeploy — a business decision behind an engineering
 * task. It belongs where the owner can reach it.
 *
 * Raising the goal lengthens the card for everyone mid-way through one. That is
 * a real change to a promise already made, so the CMS says so beside the field
 * rather than letting somebody discover it from a complaint.
 */
const loyaltySchema = new mongoose.Schema(
  {
    goal: { type: Number, default: 8, min: 1, max: 50 },
    /** What a free cut is worth, for the card and for the artist's confirmation. */
    freeCutValue: { type: Number, default: 25, min: 0 },
  },
  { _id: false },
);

const shopSettingsSchema = new mongoose.Schema(
  {
    /* A fixed key, so there can only ever be one of these. Upserting on it is
       simpler and safer than "find the first document and hope". */
    key: { type: String, default: 'shop', unique: true, immutable: true },
    birthday: { type: birthdaySchema, default: () => ({}) },
    contact: { type: contactSchema, default: () => ({}) },
    /**
     * Proving a new client's mobile number before the account exists.
     *
     * Off by default, and inert without an approved template — Meta will not
     * carry a business-initiated message without one, so a shop that turns this
     * on with nothing named would block sign-up entirely rather than verify
     * anything.
     */
    verification: {
      type: new mongoose.Schema(
        {
          required: { type: Boolean, default: false },
          templateName: { type: String, default: '', trim: true },
          templateLanguage: { type: String, default: 'en', trim: true },
          /* Minutes a code stays good for. Long enough to find the phone, short
             enough that a screenshot in somebody's chat history is worthless. */
          ttlMinutes: { type: Number, default: 10, min: 2, max: 60 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    marketplace: { type: marketplaceSchema, default: () => ({}) },
    loyalty: { type: loyaltySchema, default: () => ({}) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

shopSettingsSchema.set('toJSON', { virtuals: true });

export const ShopSettings = mongoose.model('ShopSettings', shopSettingsSchema);

/** The settings document, created with its defaults the first time it is asked for. */
export const getSettings = () =>
  ShopSettings.findOneAndUpdate(
    { key: 'shop' },
    { $setOnInsert: { key: 'shop' } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

/**
 * Fills `{name}` and `{shop}` in a piece of shop-authored text.
 *
 * Deliberately tiny and deliberately not a template language: anything cleverer
 * would be a way for whoever edits the CMS to reach further into the system
 * than "put this client's first name here".
 */
export const fillTokens = (text, { name, shop, reward, expires, product } = {}) =>
  String(text ?? '')
    .replaceAll('{name}', name ?? '')
    .replaceAll('{shop}', shop ?? '')
    .replaceAll('{product}', product ?? '')
    /* Empty when the greeting carries no reward, so a template written for one
       degrades to a plain good-wishes message rather than saying "code
       undefined" at somebody on their birthday. */
    .replaceAll('{reward}', reward ?? '')
    .replaceAll('{expires}', expires ?? '')
    .trim();
