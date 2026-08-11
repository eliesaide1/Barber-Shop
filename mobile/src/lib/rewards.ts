import type { Reward } from '../types';

/**
 * Is this reward actually usable?
 *
 * Not redeemed is not enough. A birthday gift carries a deadline, and one that
 * has passed is refused everywhere the server can be asked to spend it — so
 * offering it in the app hands somebody a claim code that fails at the chair,
 * which is the worst possible place to find out.
 *
 * The server has the same rule in `models/Loyalty.js`. Kept in step deliberately:
 * an expiry that one side enforces and the other advertises around is worse than
 * no expiry at all.
 */
export const isRewardLive = (reward: Reward, now = Date.now()): boolean =>
  reward.status !== 'redeemed' &&
  (!reward.expiresAt || new Date(reward.expiresAt).getTime() > now);

/** The one to spend first: soonest deadline, since the others keep. */
export const nextRewardToUse = (rewards: Reward[] = [], now = Date.now()): Reward | undefined =>
  rewards
    .filter((r) => r.status === 'available' && isRewardLive(r, now))
    .sort(
      (a, b) =>
        (a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity) -
        (b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity),
    )[0];

/** What to call it. A gift need not be a free cut, and saying so would be a lie. */
export const rewardTitle = (reward: Reward): string =>
  reward.label?.trim() || 'Free haircut';
