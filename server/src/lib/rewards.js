import { Loyalty } from '../models/Loyalty.js';
import { rewardCode } from './codes.js';
import { emitTo, rooms } from './realtime.js';
import { env } from '../config/env.js';

/**
 * Rewards that were given rather than earned.
 *
 * A loyalty reward is always the same thing — the fifth stamp, one free cut, no
 * end date, because it was paid for in visits and taking it back would be
 * theft. A gift is the shop choosing to give something away, so it needs to say
 * what it is, what it is worth, and when it stops being valid.
 */

/** What to call a reward when telling somebody about it. */
export const rewardLabel = (reward) =>
  (reward?.label || '').trim() || 'free cut';

/**
 * What it is worth, falling back to the shop's standard free-cut value.
 *
 * The fallback stays on `env` deliberately: this is called from places that are
 * not async and have no settings to hand, and it is only a default for a reward
 * that never named its own worth. The settings value is what the card and the
 * redemption actually report.
 */
export const rewardValue = (reward) =>
  reward?.value === null || reward?.value === undefined ? env.freeCutValue : reward.value;

/** `12 Sep`, in the shop's clock — an expiry is only useful as a date you'd say. */
export const dateLabel = (date) =>
  date
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: env.shopTimezone,
      }).format(date)
    : '';

/**
 * Puts a birthday gift on a client's card, if the shop's settings say to.
 *
 * Called before the greeting goes out, so the claim code can go *into* the
 * message: a greeting that mentions a gift the card does not have is worse than
 * one that mentions no gift at all.
 *
 * Returns null for the `none` and `text` offer modes. `text` deliberately mints
 * nothing — it is words in a message and the shop has chosen not to track it,
 * which is a legitimate choice as long as it is a clear one.
 *
 * @returns {{code: string, expiresAt: Date, label: string, value: number}|null}
 */
export async function grantBirthdayReward(userId, config) {
  if (config?.offer !== 'reward') return null;

  const expiresAt = new Date(Date.now() + config.rewardExpiryDays * 86_400_000);
  const reward = {
    code: rewardCode(userId),
    earnedAt: new Date(),
    status: 'available',
    kind: 'birthday',
    label: config.rewardLabel,
    value: config.rewardValue ?? null,
    expiresAt,
  };

  /* Upserted: a client who signed in with Google before ever earning a stamp
     has no card yet, and a birthday is a poor moment to discover that. */
  const card = await Loyalty.findOneAndUpdate(
    { user: userId },
    { $push: { rewards: reward }, $setOnInsert: { user: userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  /* So the card ticks over in their hand if they happen to have the app open. */
  if (card) emitTo(rooms.user(userId), 'loyalty:updated', { rewards: card.rewards });

  return { ...reward, value: rewardValue(reward) };
}
